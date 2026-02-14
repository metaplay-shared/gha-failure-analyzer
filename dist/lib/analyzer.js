import * as path from 'path';
import * as fs from 'fs';
import { AIAnalysisSchema, getAIAnalysisSchemaDescription } from './types.js';
import { getWorkflowLogs, getMostRecentFailedRun, getWorkflowRunSummary } from './github.js';
import { writeWorkflowSummary, writeJobLogs, getStoragePath } from './storage.js';
import { formatWorkflowSummary } from './formatter.js';
import { createOpencodeClient, processEventStream } from './opencode.js';
import { createAnalysisToolServer } from './mcp-tool-server.js';
import { notifyStart, notifyComplete } from './slack-notifier.js';
/**
 * Fetch workflow data and write it to .ci-analyzer/
 * Returns paths to the written files
 * @param baseDir - Base directory for storage
 */
export async function fetchAndStoreWorkflow(repo, runId, baseDir) {
    // Fetch workflow summary (run, jobs, annotations)
    const summary = await getWorkflowRunSummary(repo, runId);
    // Fetch logs for each job
    const jobLogs = await getWorkflowLogs(repo, runId);
    // Write to baseDir/.ci-analyzer/
    const summaryPath = await writeWorkflowSummary(repo, runId, summary, baseDir);
    const logPaths = await writeJobLogs(runId, jobLogs, baseDir);
    const storagePath = getStoragePath(runId, baseDir);
    const storedData = {
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
function resolveWorkingDir(repoPath) {
    const defaultDir = process.env.INIT_CWD || process.cwd();
    return path.resolve(repoPath ?? defaultDir);
}
/**
 * Analyze a workflow run using the OpenCode SDK
 */
export async function analyzeWorkflowRun(options) {
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
    // Send initial Slack notification (or stdout fallback)
    const notificationHandle = await notifyStart(data.run, options.repo);
    // Print workflow summary before analysis
    console.log(formatWorkflowSummary(data));
    // Extract failure information from stored data
    const failures = extractFailures(data.jobs, jobLogs);
    // Build log file info with stats
    const logFiles = [];
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
    console.log('-'.repeat(70));
    console.log('IDENTIFIED FAILURES');
    console.log('-'.repeat(70));
    if (failures.length > 0) {
        for (const f of failures) {
            console.log(`  - Job: ${f.job}, Step: ${f.step}`);
        }
    }
    else {
        console.log('  (none identified)');
    }
    console.log('');
    // Print log files
    console.log('-'.repeat(70));
    console.log('LOG FILES');
    console.log('-'.repeat(70));
    for (const f of logFiles) {
        console.log(`  - ${path.basename(f.path)} (${f.lines.toLocaleString()} lines, ${(f.bytes / 1024).toFixed(1)} KB)`);
    }
    console.log('');
    console.log('='.repeat(70));
    console.log('RUNNING AI ANALYSIS');
    console.log('='.repeat(70));
    console.log('');
    // Analyze with OpenCode SDK (use already-resolved workingDir)
    const analysis = await analyzeWithOpenCode(data, failures, { summaryPath, logFiles, storagePath }, workingDir, options.verbose);
    const result = {
        repository: options.repo,
        runId,
        workflowName: data.run.workflowName,
        status: data.run.conclusion ?? 'unknown',
        failures,
        analysis,
        analyzedAt: new Date().toISOString(),
    };
    // Update Slack notification with results (or stdout fallback)
    await notifyComplete(notificationHandle, result);
    return result;
}
/**
 * Extract failure information from jobs and logs
 */
function extractFailures(jobs, jobLogs) {
    const failures = [];
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
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minute timeout
const MAX_TOOL_CALL_ATTEMPTS = 3; // Max retries for getting the AI to call the tool
/**
 * Format job status icon
 */
function getStatusIcon(conclusion) {
    switch (conclusion) {
        case 'success': return '[PASS]';
        case 'failure': return '[FAIL]';
        case 'cancelled':
        case 'skipped': return '[SKIP]';
        default: return '[----]';
    }
}
/**
 * Build embedded workflow summary for the prompt
 */
function buildWorkflowSummary(data) {
    const { run, jobs } = data;
    const lines = [];
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
function buildAnalysisPrompt(data, failures, filePaths) {
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
function buildPromptParts(mainPrompt) {
    return [{
            type: 'text',
            text: mainPrompt,
        }];
}
/**
 * Build a reminder prompt to instruct the AI to call the analysis tool
 */
function buildToolReminderPrompt() {
    return `You have not called the required analysis tool. Your task is incomplete.

You MUST call the \`analysis-tool_report_analysis\` tool now with your findings.

## Tool Schema
${getAIAnalysisSchemaDescription()}

Call the tool immediately. Do not explain - just call the tool.`;
}
/**
 * Parse the analysis result from agent response text using Zod validation
 */
function parseAnalysisResult(text) {
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
    }
    catch {
        // JSON parse failed
        return null;
    }
}
/**
 * Analyze failures using the OpenCode SDK
 * @param workingDir - Already-resolved working directory
 */
async function analyzeWithOpenCode(data, failures, filePaths, workingDir, verbose = false) {
    const log = verbose ? console.log.bind(console) : () => { };
    // Start in-process MCP server with the analysis tool
    process.stdout.write('Starting analysis tool server... ');
    const toolServer = await createAnalysisToolServer();
    console.log(`done (port ${toolServer.port})`);
    log(`[verbose] MCP tool server URL: ${toolServer.url}`);
    // Start OpenCode server (prints model config and status)
    const { client, server, model } = await createOpencodeClient(workingDir);
    try {
        // Register the MCP server with OpenCode (scoped to working directory)
        process.stdout.write('Registering MCP tool server... ');
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
            console.log('failed');
            log(`[verbose] MCP registration error: ${JSON.stringify(mcpResult.error)}`);
            throw new Error('Failed to register MCP tool server');
        }
        console.log('done');
        // Connect to the MCP server to make tools available
        process.stdout.write('Connecting MCP tool server... ');
        const connectResult = await client.mcp.connect({
            query: { directory: workingDir },
            path: { name: 'analysis-tool' },
        });
        if (connectResult.error) {
            console.log('failed');
            log(`[verbose] MCP connect error: ${JSON.stringify(connectResult.error)}`);
            throw new Error('Failed to connect MCP tool server');
        }
        console.log('done');
        // Create session
        process.stdout.write('Creating session... ');
        const createResult = await client.session.create({
            query: { directory: workingDir },
        });
        if (createResult.error || !createResult.data) {
            console.log('failed');
            throw new Error('Failed to create session');
        }
        const sessionId = createResult.data.id;
        console.log(`done (${sessionId.slice(0, 12)}...)`);
        const analysisPrompt = buildAnalysisPrompt(data, failures, filePaths);
        const parts = buildPromptParts(analysisPrompt);
        log(`[verbose] Prompt length: ${analysisPrompt.length} chars`);
        // Connect to events
        process.stdout.write('Connecting... ');
        const eventStream = await client.event.subscribe();
        console.log('done');
        // Send prompt
        process.stdout.write('Sending prompt... ');
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
            console.log('failed');
            log(`[verbose] Error: ${JSON.stringify(promptResult.error)}`);
            return null;
        }
        console.log('done\n');
        // Retry loop - try multiple times to get the AI to call the tool
        for (let attempt = 1; attempt <= MAX_TOOL_CALL_ATTEMPTS; attempt++) {
            log(`[verbose] Attempt ${attempt}/${MAX_TOOL_CALL_ATTEMPTS} to get analysis result`);
            // Process events - capture both response text and tool calls
            const { responseText, toolCalls } = await processEventStream(eventStream, {
                verbose,
                timeoutMs: TIMEOUT_MS,
            });
            // Try to get the result from the in-process MCP server
            try {
                const result = await Promise.race([
                    toolServer.resultPromise,
                    new Promise((resolve) => setTimeout(() => resolve(null), 1000)),
                ]);
                if (result) {
                    console.log('\n' + '-'.repeat(70));
                    console.log('ANALYSIS RESULT (via MCP tool):');
                    console.log('-'.repeat(70));
                    console.log(JSON.stringify(result, null, 2));
                    console.log('-'.repeat(70) + '\n');
                    return result;
                }
            }
            catch {
                log('[verbose] MCP tool result not available');
            }
            // Check if AI called the report_analysis tool via event stream
            const analysisCall = toolCalls.find(tc => tc.tool === 'analysis-tool_report_analysis' || tc.tool === 'report_analysis');
            if (analysisCall) {
                console.log('\n' + '-'.repeat(70));
                console.log('ANALYSIS RESULT (via tool call):');
                console.log('-'.repeat(70));
                console.log(analysisCall.output);
                console.log('-'.repeat(70) + '\n');
                try {
                    const parsed = JSON.parse(analysisCall.output);
                    const result = AIAnalysisSchema.safeParse(parsed);
                    if (result.success) {
                        return result.data;
                    }
                    console.log('[warn] Tool output failed schema validation:', result.error.flatten());
                }
                catch (e) {
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
                console.log('\n' + '-'.repeat(70));
                console.log('RAW RESPONSE (fallback):');
                console.log('-'.repeat(70));
                console.log(responseText);
                console.log('-'.repeat(70) + '\n');
                const result = parseAnalysisResult(responseText);
                if (result) {
                    return result;
                }
                console.log('[warn] Failed to parse response as structured JSON');
            }
        }
        console.log(`[error] Failed to get analysis result after ${MAX_TOOL_CALL_ATTEMPTS} attempts`);
        return null;
    }
    finally {
        server.close();
        // Close the in-process MCP tool server
        await toolServer.close();
    }
}
//# sourceMappingURL=analyzer.js.map