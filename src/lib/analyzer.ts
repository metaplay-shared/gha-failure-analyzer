import * as path from 'path';
import * as fs from 'fs';
import { AIAnalysisSchema, getAIAnalysisJsonSchema, type AIAnalysis, type AnalysisResult, type AnalyzeOptions, type FailureInfo } from './types.js';
import { getWorkflowLogs, getMostRecentFailedRun, getWorkflowRunSummary } from './github.js';
import { writeWorkflowSummary, writeJobLogs, getStoragePath, type StoredWorkflowData } from './storage.js';
import { formatWorkflowSummary, getStatusIcon } from './formatter.js';
import type { TextPartInput } from '@opencode-ai/sdk/v2';
import { createOpencodeClient, processEventStream, type ModelConfig } from './opencode.js';
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

// opencode's built-in structured-output tool. When a prompt is sent with
// `format: { type: 'json_schema', ... }`, opencode exposes the schema as this tool, requires the
// model to call it, validates the call server-side, and retries internally on failure. The
// model's analysis arrives as this tool call's input.
const STRUCTURED_OUTPUT_TOOL = 'StructuredOutput';

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

5. **Report Your Findings**: Provide your structured analysis as your final answer: concise summary bullets (what failed, why, and how to fix it), a detailed markdown writeup, attribution if you identified the culprit commit via git history, and a confidence level.

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
 * Build an urgent prompt to force immediate analysis emission (soft timeout)
 */
function buildUrgentEmitPrompt(): string {
  return `STOP IMMEDIATELY. Time limit reached.
Provide your final structured analysis RIGHT NOW using whatever findings you have so far - partial analysis is acceptable.
Do NOT continue investigating. Emit your analysis NOW.`;
}

/**
 * Print actionable diagnostics when the model returns no output at all (no text, no tool calls).
 * This almost always means missing or invalid API credentials, so we fail loudly rather than
 * silently returning an empty analysis.
 */
function reportNoAIOutput(model: ModelConfig): never {
  // Find existing API key env variables
  const apiKeyEnvVars = Object.keys(process.env)
    .filter((key) => key.includes('_API_') || key.includes('_KEY'))
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
  // Exit immediately - no point continuing without valid API credentials
  throw new Error('No AI response received - check API key configuration');
}

/**
 * Analyze failures using the OpenCode SDK.
 *
 * Structured output is enforced natively via opencode's `format: json_schema`: opencode exposes
 * {@link getAIAnalysisJsonSchema} as the built-in `StructuredOutput` tool, requires the model to
 * call it, validates the call against the schema (retrying internally), and we read the result
 * back from that tool call. This replaces the previous in-process MCP tool server and the
 * "you forgot to call the tool" retry loop.
 *
 * @param workingDir - Already-resolved working directory
 * @param softTimeoutMs - Soft timeout in milliseconds (sends urgent emit prompt when reached; 0 disables)
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

  // Start OpenCode server
  const { client, server, model } = await createOpencodeClient(workingDir, verbose);

  try {
    // Create session
    log('[verbose] Creating session...');
    const createResult = await client.session.create({ directory: workingDir });
    if (createResult.error || !createResult.data) {
      if (!verbose) console.log('failed');
      throw new Error('Failed to create session');
    }

    const sessionId = createResult.data.id;
    log(`[verbose] Session created: ${sessionId}`);

    const analysisPrompt = buildAnalysisPrompt(data, failures, filePaths);
    const parts: Array<TextPartInput> = buildPromptParts(analysisPrompt);
    log(`[verbose] Prompt length: ${analysisPrompt.length} chars`);

    // Structured-output contract handed to opencode (see getAIAnalysisJsonSchema).
    const jsonSchema = getAIAnalysisJsonSchema();

    // Send a prompt with file edits disabled (read-only analysis) and structured output enforced.
    const sendPrompt = (promptParts: Array<TextPartInput>) =>
      client.session.promptAsync({
        sessionID: sessionId,
        model: {
          providerID: model.providerID,
          modelID: model.modelID,
        },
        tools: {
          write: false,
          edit: false,
        },
        format: { type: 'json_schema', schema: jsonSchema, retryCount: 2 },
        parts: promptParts,
      });

    // Soft-timeout callback - nudges the model to emit its (possibly partial) structured analysis
    // immediately instead of investigating until the job's hard timeout. This is independent of
    // the structured-output mechanism, so the timing control behaves as it did before.
    const sendUrgentPrompt = async (): Promise<boolean> => {
      const urgentResult = await sendPrompt([{ type: 'text', text: buildUrgentEmitPrompt() }]);
      if (urgentResult.error) {
        log(`[verbose] Urgent prompt failed: ${JSON.stringify(urgentResult.error)}`);
        return false;
      }
      return true; // Continue processing events
    };

    // Subscribe to the event stream BEFORE sending so no events are missed. opencode emits a
    // single global stream; one subscription covers the main prompt and any soft-timeout nudge.
    log('[verbose] Connecting to event stream...');
    const eventStream = await client.event.subscribe();
    log('[verbose] Event stream connected');

    log('[verbose] Sending prompt...');
    const promptResult = await sendPrompt(parts);
    if (promptResult.error) {
      if (!verbose) console.log('failed');
      log(`[verbose] Prompt error: ${JSON.stringify(promptResult.error)}`);
      return null;
    }

    // Complete the "Initializing AI session..." status line once the prompt is sent.
    if (!verbose) {
      console.log(`done (${model.providerID}/${model.modelID})\n`);
    } else {
      log('[verbose] Prompt sent successfully');
      console.log('');
    }

    // Process events for live progress, applying the soft timeout (urgent emit) when configured.
    // No hard timeout - the external job timeout handles termination if needed.
    const { toolCalls, hadActivity } = await processEventStream(eventStream, {
      verbose,
      softTimeoutMs: softTimeoutMs > 0 ? softTimeoutMs : undefined,
      onSoftTimeout: softTimeoutMs > 0 ? sendUrgentPrompt : undefined,
    });

    // Extract the structured analysis from opencode's built-in StructuredOutput tool call.
    // Its `input` is the model's analysis object, already validated server-side against the schema.
    const structured = toolCalls.find((tc) => tc.tool === STRUCTURED_OUTPUT_TOOL);
    if (structured) {
      const result = AIAnalysisSchema.safeParse(structured.input);
      if (result.success) {
        console.log(`[analysis] ${result.data.summary[0] ?? 'Analysis complete'}`);
        return result.data;
      }
      // opencode validates server-side, so a failure here is unexpected - surface, don't hide it.
      console.log('[warn] StructuredOutput failed local schema validation:', result.error.flatten());
    }

    // No structured analysis captured. If the model produced NO activity at all (no reasoning,
    // text, or tool calls), that almost always means missing/invalid credentials - fail loudly.
    // We key off hadActivity rather than response text, because a successful run emits its
    // analysis through the StructuredOutput tool and frequently produces no assistant prose.
    if (!hadActivity) {
      reportNoAIOutput(model);
    }

    // The model ran but never produced a valid structured analysis (e.g. StructuredOutputError
    // after exhausting retries). Return null; the caller renders an "Analysis Unavailable" report.
    console.log('[error] AI did not produce a structured analysis');
    return null;
  } finally {
    server.close();
  }
}
