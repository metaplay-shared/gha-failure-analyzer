import * as path from 'path';
import * as fs from 'fs';
import { AIAnalysisSchema, getAIAnalysisSchemaDescription, type AIAnalysis, type AnalysisResult, type AnalyzeOptions, type FailureInfo } from './types.js';
import { getWorkflowLogs, getMostRecentFailedRun, getWorkflowRunSummary } from './github.js';
import { writeWorkflowSummary, writeJobLogs, getStoragePath, type StoredWorkflowData } from './storage.js';
import { formatWorkflowSummary, getStatusIcon } from './formatter.js';
import type { TextPartInput } from '@opencode-ai/sdk';
import { createOpencodeClient, processEventStream } from './opencode.js';
import { createAnalysisToolServer } from './mcp-tool-server.js';
import { getNotifier } from './notifier.js';

/**
 * Fetch workflow data and write it to .ci-analyzer/
 * Returns paths to the written files
 * @param baseDir - Base directory for storage
 */
export async function fetchAndStoreWorkflow(
  repo: string,
  runId: number,
  baseDir: string
): Promise<{
  summaryPath: string;
  logPaths: string[];
  storagePath: string;
  data: StoredWorkflowData;
  jobLogs: Map<string, string>;
}> {
  // Fetch workflow summary (run, jobs, annotations)
  const summary = await getWorkflowRunSummary(repo, runId);

  // Fetch logs for each job
  const jobLogs = await getWorkflowLogs(repo, runId);

  // Write to baseDir/.ci-analyzer/
  const summaryPath = await writeWorkflowSummary(repo, runId, summary, baseDir);
  const logPaths = await writeJobLogs(runId, jobLogs, baseDir);
  const storagePath = getStoragePath(runId, baseDir);

  const storedData: StoredWorkflowData = {
    fetchedAt: new Date().toISOString(),
    repository: repo,
    ...summary,
  };

  return {
    summaryPath,
    logPaths,
    storagePath,
    data: storedData,
    jobLogs,
  };
}

/**
 * Resolve the working directory from options or environment
 */
function resolveWorkingDir(repoPath?: string): string {
  const defaultDir = process.env.INIT_CWD || process.cwd();
  return path.resolve(repoPath ?? defaultDir);
}

/**
 * Analyze a workflow run using the OpenCode SDK
 */
export async function analyzeWorkflowRun(options: AnalyzeOptions): Promise<AnalysisResult> {
  // Resolve working directory early - used for storage and AI analysis
  const workingDir = resolveWorkingDir(options.repoPath);

  // Determine which run to analyze
  let runId = options.runId;

  if (!runId) {
    const recentRun = await getMostRecentFailedRun(options.repo);
    if (!recentRun) {
      throw new Error('No failed workflow runs found');
    }
    runId = recentRun.id;
  }

  console.log('Fetching workflow data from GitHub...');

  // Fetch and store workflow data (in workingDir/.ci-analyzer/)
  const { data, jobLogs, summaryPath, logPaths, storagePath } = await fetchAndStoreWorkflow(options.repo, runId, workingDir);

  console.log(`Workflow data saved to ${storagePath}\n`);

  // Send initial notification (Slack if configured, otherwise console)
  const notifier = getNotifier();
  const notificationHandle = await notifier.notifyStart(data.run, data.jobs, options.repo);

  // Print workflow summary before analysis
  console.log(formatWorkflowSummary(data));

  // Extract failure information from stored data
  const failures = extractFailures(data.jobs, jobLogs);

  // Build log file info with stats
  const logFiles: LogFileInfo[] = [];
  for (const logPath of logPaths) {
    const stat = fs.statSync(logPath);
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').length;
    // Extract job name from filename (e.g., "tests-ubicloud-standard-4.log" -> "tests (ubicloud-standard-4)")
    const basename = path.basename(logPath, '.log');
    const jobName = basename.replace(/-/g, ' ').replace(/\s+/g, ' ');
    logFiles.push({ path: logPath, jobName, lines, bytes: stat.size });
  }

  // Print failures
  console.log('IDENTIFIED FAILURES:');
  if (failures.length > 0) {
    for (const f of failures) {
      console.log(`  - Job: ${f.job}, Step: ${f.step}`);
    }
  } else {
    console.log('  (none identified)');
  }
  console.log('');

  // Print log files
  console.log('LOG FILES:');
  for (const f of logFiles) {
    console.log(`  - ${path.basename(f.path)} (${f.lines.toLocaleString()} lines, ${(f.bytes / 1024).toFixed(1)} KB)`);
  }
  console.log('');

  console.log('='.repeat(70));
  console.log('RUNNING AI ANALYSIS');
  console.log('='.repeat(70));
  console.log('');

  // Analyze with OpenCode SDK (use already-resolved workingDir)
  const softTimeoutMs = options.softTimeoutMinutes * 60 * 1000;
  const analysis = await analyzeWithOpenCode(data, failures, { summaryPath, logFiles, storagePath }, workingDir, options.verbose ?? false, softTimeoutMs);

  const result: AnalysisResult = {
    repository: options.repo,
    runId,
    workflowName: data.run.workflowName,
    status: data.run.conclusion ?? 'unknown',
    failures,
    analysis,
    analyzedAt: new Date().toISOString(),
  };

  // Update notification with results
  await notifier.notifyComplete(notificationHandle, result);

  return result;
}

/**
 * Extract failure information from jobs and logs
 */
function extractFailures(
  jobs: import('./types.js').WorkflowJob[],
  jobLogs: Map<string, string>
): FailureInfo[] {
  const failures: FailureInfo[] = [];

  for (const job of jobs) {
    if (job.conclusion === 'failure') {
      const logs = jobLogs.get(job.name);
      for (const step of job.steps) {
        if (step.conclusion === 'failure') {
          failures.push({
            step: step.name,
            job: job.name,
            message: `Step '${step.name}' failed in job '${job.name}'`,
            logs,
          });
        }
      }
    }
  }

  return failures;
}

// Configuration constants
const MAX_TOOL_CALL_ATTEMPTS = 3; // Max retries for getting the AI to call the tool

interface LogFileInfo {
  path: string;
  jobName: string;
  lines: number;
  bytes: number;
}

interface WorkflowFilePaths {
  summaryPath: string;
  logFiles: LogFileInfo[];
  storagePath: string;
}

/**
 * Build embedded workflow summary for the prompt
 */
function buildWorkflowSummary(data: StoredWorkflowData): string {
  const { run, jobs } = data;
  const lines: string[] = [];

  lines.push(`Repository: ${data.repository}`);
  lines.push(`Workflow: ${run.workflowName}`);
  lines.push(`Branch: ${run.branch}`);
  lines.push(`Run ID: ${run.id}`);
  lines.push(`Status: ${run.conclusion?.toUpperCase() || 'UNKNOWN'}`);
  lines.push(`URL: ${run.url}`);
  lines.push('');
  lines.push('Jobs:');

  for (const job of jobs) {
    const icon = getStatusIcon(job.conclusion);
    lines.push(`  ${icon} ${job.name}`);

    if (job.conclusion === 'failure' && job.steps.length > 0) {
      for (const step of job.steps) {
        const stepIcon = getStatusIcon(step.conclusion);
        lines.push(`         ${stepIcon} ${step.number}. ${step.name}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Build the analysis prompt with workflow context (includes system instructions)
 */
function buildAnalysisPrompt(
  data: StoredWorkflowData,
  failures: FailureInfo[],
  filePaths: WorkflowFilePaths
): string {
  const failureList = failures
    .map((f) => `- Job: ${f.job}, Step: ${f.step}\n  Message: ${f.message}`)
    .join('\n');

  const workflowSummary = buildWorkflowSummary(data);

  const logFileList = filePaths.logFiles
    .map((f) => `  - ${f.path} (${f.lines.toLocaleString()} lines, ${(f.bytes / 1024).toFixed(1)} KB) - ${f.jobName}`)
    .join('\n');

  return `# CI Failure Analysis Task

## Mode
You are in READ-ONLY mode. Do not modify any files.
- For git: only use read commands (git log, git diff, git show, git status, git blame)
- For gh: only use read commands (gh pr view, gh issue view, gh run view)

## Instructions (follow these steps in order)

1. **Scan Logs**: Search log files for error patterns (grep for 'error', 'failed', 'exception', 'fatal', stack traces). Focus on the FIRST errors - later errors are often cascading failures.

2. **Read Error Context**: Read the relevant sections of logs around the errors to understand what failed and why.

3. **Investigate Source Code**: Based on the error, read relevant source files to understand:
   - What the failing code is trying to do
   - What conditions caused the error
   - Use git blame/history to identify when the issue was introduced

4. **Root-Cause Analysis**: Determine:
   - What is the actual error? (not symptoms, but the core failure)
   - What assumption was violated? (expected vs actual)
   - Category: code bug, config issue, flaky test, infrastructure, or dependency issue?
   - What's the minimal fix?

5. **MANDATORY - Call the Tool**: You MUST call \`analysis-tool_report_analysis\` with your structured findings. This step is NON-NEGOTIABLE - the task is incomplete without this tool call.

## Tool Schema
${getAIAnalysisSchemaDescription()}

## Workflow Run
${workflowSummary}

## Identified Failures
${failureList || 'No specific failure steps identified'}

## Log Files
${logFileList}`;
}

/**
 * Build prompt parts - agent will read files directly
 */
function buildPromptParts(mainPrompt: string): Array<TextPartInput> {
  return [{
    type: 'text',
    text: mainPrompt,
  }];
}

/**
 * Build a reminder prompt to instruct the AI to call the analysis tool
 */
function buildToolReminderPrompt(): string {
  return `You have not called the required analysis tool. Your task is incomplete.

You MUST call the \`analysis-tool_report_analysis\` tool now with your findings.

## Tool Schema
${getAIAnalysisSchemaDescription()}

Call the tool immediately. Do not explain - just call the tool.`;
}

/**
 * Build an urgent prompt to force immediate analysis emission (soft timeout)
 */
function buildUrgentEmitPrompt(): string {
  return `STOP IMMEDIATELY. Time limit reached.
You MUST call the \`analysis-tool_report_analysis\` tool RIGHT NOW.
Use whatever findings you have so far - partial analysis is acceptable.
Do NOT continue investigating. Emit your analysis NOW.`;
}

/**
 * Parse the analysis result from agent response text using Zod validation
 */
function parseAnalysisResult(text: string): AIAnalysis | null {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*"summary"[\s\S]*"details"[\s\S]*\}/);

  if (!jsonMatch) {
    return null;
  }

  try {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);
    const result = AIAnalysisSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    // Log validation errors for debugging
    console.error('Zod validation errors:', result.error.flatten());
    return null;
  } catch {
    // JSON parse failed
    return null;
  }
}

/**
 * Analyze failures using the OpenCode SDK
 * @param workingDir - Already-resolved working directory
 * @param softTimeoutMs - Soft timeout in milliseconds (sends urgent emit prompt when reached)
 */
async function analyzeWithOpenCode(
  data: StoredWorkflowData,
  failures: FailureInfo[],
  filePaths: WorkflowFilePaths,
  workingDir: string,
  verbose: boolean,
  softTimeoutMs: number
): Promise<AIAnalysis | null> {
  const log = verbose ? console.log.bind(console) : () => {};

  // Single status message for non-verbose mode
  if (!verbose) {
    process.stdout.write('Initializing AI session... ');
  }

  // Start in-process MCP server with the analysis tool
  log('[verbose] Starting analysis tool server...');
  const toolServer = await createAnalysisToolServer();
  log(`[verbose] Tool server started on port ${toolServer.port}`);
  log(`[verbose] MCP tool server URL: ${toolServer.url}`);

  // Start OpenCode server
  const { client, server, model } = await createOpencodeClient(workingDir, verbose);

  try {
    // Register the MCP server with OpenCode (scoped to working directory)
    log('[verbose] Registering MCP tool server...');
    const mcpResult = await client.mcp.add({
      query: { directory: workingDir },
      body: {
        name: 'analysis-tool',
        config: {
          type: 'remote',
          url: toolServer.url,
        },
      },
    });
    if (mcpResult.error) {
      if (!verbose) console.log('failed');
      log(`[verbose] MCP registration error: ${JSON.stringify(mcpResult.error)}`);
      throw new Error('Failed to register MCP tool server');
    }
    log('[verbose] MCP tool server registered');

    // Connect to the MCP server to make tools available
    log('[verbose] Connecting MCP tool server...');
    const connectResult = await client.mcp.connect({
      query: { directory: workingDir },
      path: { name: 'analysis-tool' },
    });
    if (connectResult.error) {
      if (!verbose) console.log('failed');
      log(`[verbose] MCP connect error: ${JSON.stringify(connectResult.error)}`);
      throw new Error('Failed to connect MCP tool server');
    }
    log('[verbose] MCP tool server connected');

    // Create session
    log('[verbose] Creating session...');
    const createResult = await client.session.create({
      query: { directory: workingDir },
    });

    if (createResult.error || !createResult.data) {
      if (!verbose) console.log('failed');
      throw new Error('Failed to create session');
    }

    const sessionId = createResult.data.id;
    log(`[verbose] Session created: ${sessionId}`);

    const analysisPrompt = buildAnalysisPrompt(data, failures, filePaths);
    const parts: Array<TextPartInput> = buildPromptParts(analysisPrompt);
    log(`[verbose] Prompt length: ${analysisPrompt.length} chars`);

    // Connect to events
    log('[verbose] Connecting to event stream...');
    const eventStream = await client.event.subscribe();
    log('[verbose] Event stream connected');

    // Send prompt
    log('[verbose] Sending prompt...');
    const promptResult = await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts,
        model: {
          providerID: model.providerID,
          modelID: model.modelID,
        },
        tools: {
          write: false,
          edit: false,
        },
      },
    });

    if (promptResult.error) {
      if (!verbose) console.log('failed');
      log(`[verbose] Error: ${JSON.stringify(promptResult.error)}`);
      return null;
    }

    // Complete the single status message
    if (!verbose) {
      console.log(`done (${model.providerID}/${model.modelID})\n`);
    } else {
      log('[verbose] Prompt sent successfully');
      console.log('');
    }

    // Soft timeout callback - sends urgent prompt mid-stream
    const sendUrgentPrompt = async (): Promise<boolean> => {
      const urgentResult = await client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: buildUrgentEmitPrompt() }],
          model: {
            providerID: model.providerID,
            modelID: model.modelID,
          },
          tools: {
            write: false,
            edit: false,
          },
        },
      });

      if (urgentResult.error) {
        log(`[verbose] Urgent prompt failed: ${JSON.stringify(urgentResult.error)}`);
        return false;
      }
      return true; // Continue processing events
    };

    // Retry loop - try multiple times to get the AI to call the tool
    for (let attempt = 1; attempt <= MAX_TOOL_CALL_ATTEMPTS; attempt++) {
      log(`[verbose] Attempt ${attempt}/${MAX_TOOL_CALL_ATTEMPTS} to get analysis result`);

      // Process events with soft timeout callback
      // First attempt uses soft timeout; subsequent attempts just wait for completion
      // No hard timeout - external process handles termination if needed
      const isFirstAttempt = attempt === 1;
      const { responseText, toolCalls } = await processEventStream(eventStream, {
        verbose,
        softTimeoutMs: isFirstAttempt ? softTimeoutMs : undefined,
        onSoftTimeout: isFirstAttempt ? sendUrgentPrompt : undefined,
      });

      // Check for no AI activity on first attempt - likely missing API key
      // If the session completed with no response text and no tool calls, something is wrong
      const noAIOutput = !responseText.trim() && toolCalls.length === 0;
      if (attempt === 1 && noAIOutput) {
        // Find existing API key env variables
        const apiKeyEnvVars = Object.keys(process.env)
          .filter(key => key.includes('_API_') || key.includes('_KEY'))
          .sort();

        console.log('\n' + '='.repeat(70));
        console.log('ERROR: No AI response received');
        console.log('='.repeat(70));
        console.log('');
        console.log('The AI model did not respond. This usually indicates a missing or');
        console.log('invalid API key.');
        console.log('');
        console.log(`Current model: ${model.providerID}/${model.modelID}`);
        console.log('');
        console.log('Expected environment variables by provider:');
        console.log('  OpenCode:   OPENCODE_API_KEY');
        console.log('  Anthropic:  ANTHROPIC_API_KEY');
        console.log('  OpenAI:     OPENAI_API_KEY');
        console.log('  Google:     GOOGLE_API_KEY or GEMINI_API_KEY');
        console.log('  z.ai:       ZHIPU_API_KEY (migrating to ZAI_API_KEY)');
        console.log('  Mistral:    MISTRAL_API_KEY');
        console.log('  Groq:       GROQ_API_KEY');
        console.log('');
        if (apiKeyEnvVars.length > 0) {
          console.log('Detected API key variables in environment:');
          for (const envVar of apiKeyEnvVars) {
            console.log(`  ${envVar}`);
          }
        } else {
          console.log('No API key variables detected in environment.');
        }
        console.log('='.repeat(70));
        // Exit immediately - no point retrying without valid API credentials
        throw new Error('No AI response received - check API key configuration');
      }

      // Try to get the result from the in-process MCP server
      try {
        const result = await Promise.race([
          toolServer.resultPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
        ]);
        if (result) {
          console.log(`[analysis-tool] ${result.summary}`);
          return result;
        }
      } catch {
        log('[verbose] MCP tool result not available');
      }

      // Check if AI called the report_analysis tool via event stream
      const analysisCall = toolCalls.find(tc =>
        tc.tool === 'analysis-tool_report_analysis' || tc.tool === 'report_analysis'
      );
      if (analysisCall) {
        try {
          const parsed = JSON.parse(analysisCall.output);
          const result = AIAnalysisSchema.safeParse(parsed);
          if (result.success) {
            console.log(`[analysis-tool] ${result.data.summary}`);
            return result.data;
          }
          console.log('[warn] Tool output failed schema validation:', result.error.flatten());
        } catch (e) {
          console.log('[warn] Failed to parse tool output as JSON:', e);
        }
      }

      // Tool wasn't called - send a reminder if we have attempts left
      if (attempt < MAX_TOOL_CALL_ATTEMPTS) {
        console.log(`\n[retry] Tool not called. Sending reminder (attempt ${attempt}/${MAX_TOOL_CALL_ATTEMPTS})...`);

        const reminderResult = await client.session.promptAsync({
          path: { id: sessionId },
          body: {
            parts: [{ type: 'text', text: buildToolReminderPrompt() }],
            model: {
              providerID: model.providerID,
              modelID: model.modelID,
            },
            tools: {
              write: false,
              edit: false,
            },
          },
        });

        if (reminderResult.error) {
          log(`[verbose] Reminder prompt failed: ${JSON.stringify(reminderResult.error)}`);
        }
        continue;
      }

      // Final attempt - try to parse from response text as last resort
      if (responseText) {
        log('[verbose] Attempting to parse raw response as JSON fallback');
        const result = parseAnalysisResult(responseText);
        if (result) {
          return result;
        }
        console.log('[warn] Failed to parse response as structured JSON');
      }
    }

    console.log(`[error] Failed to get analysis result after ${MAX_TOOL_CALL_ATTEMPTS} attempts`);
    return null;
  } finally {
    server.close();
    // Close the in-process MCP tool server
    await toolServer.close();
  }
}
