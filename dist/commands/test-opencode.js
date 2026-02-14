import * as path from 'path';
import * as fs from 'fs';
import { createOpencodeClient, processEventStream } from '../lib/opencode.js';
import { createSummaryToolServer } from '../lib/mcp-tool-server.js';
/**
 * Register the test-opencode command
 */
export function register(program) {
    program
        .command('test-opencode')
        .description('Test MCP tool integration by summarizing markdown files')
        .option('-p, --repo-path <path>', 'Working directory for the session')
        .option('-v, --verbose', 'Show all events')
        .action(async (options) => {
        await action(options);
    });
}
const PROMPT = `# Task: Summarize markdown files and report via tool

## Instructions
1. List files in the directory to find markdown files (.md)
2. For each markdown file, read it and create a one-sentence summary
3. CRITICAL: After summarizing ALL files, you MUST call the \`summary-tool_report_summaries\` tool with your results

## Tool call format
The tool expects: { "summaries": [{ "filename": "file.md", "summary": "..." }, ...] }

## Important
- Do NOT finish without calling the tool
- The tool call is MANDATORY - this task is not complete until you call it`;
/**
 * Execute the test-opencode command
 */
async function action(options) {
    const { repoPath, verbose = false } = options;
    // Validate path - use INIT_CWD (original cwd before pnpm --dir changed it)
    const defaultDir = process.env.INIT_CWD || process.cwd();
    const workingDir = path.resolve(repoPath ?? defaultDir);
    if (!fs.existsSync(workingDir)) {
        console.error(`Error: Path does not exist: ${workingDir}`);
        process.exit(1);
    }
    if (!fs.statSync(workingDir).isDirectory()) {
        console.error(`Error: Path is not a directory: ${workingDir}`);
        process.exit(1);
    }
    // Start MCP tool server
    process.stdout.write('Starting MCP tool server... ');
    const toolServer = await createSummaryToolServer();
    console.log(`done (port ${toolServer.port})`);
    console.log(`\n${PROMPT}\n`);
    // Start OpenCode server (prints model config and status)
    const { client, server, model } = await createOpencodeClient(workingDir);
    try {
        // Register MCP tool server with OpenCode (scoped to working directory)
        process.stdout.write('Registering MCP tool server... ');
        const mcpResult = await client.mcp.add({
            query: { directory: workingDir },
            body: {
                name: 'summary-tool',
                config: {
                    type: 'remote',
                    url: toolServer.url,
                },
            },
        });
        if (mcpResult.error) {
            console.log('failed');
            console.error('MCP registration error:', mcpResult.error);
            return;
        }
        console.log('done');
        // Connect to the MCP server to make tools available
        process.stdout.write('Connecting MCP tool server... ');
        const connectResult = await client.mcp.connect({
            query: { directory: workingDir },
            path: { name: 'summary-tool' },
        });
        if (connectResult.error) {
            console.log('failed');
            console.error('MCP connect error:', connectResult.error);
            return;
        }
        console.log('done');
        // Create session
        process.stdout.write('Creating session... ');
        const session = await client.session.create({
            query: { directory: workingDir },
        });
        if (session.error) {
            console.error('failed:', session.error);
            return;
        }
        const sessionId = session.data.id;
        console.log(`done (${sessionId.slice(0, 12)}...)`);
        // Subscribe to events
        process.stdout.write('Connecting... ');
        const events = await client.event.subscribe();
        console.log('done');
        // Send prompt
        process.stdout.write('Sending prompt... ');
        const result = await client.session.promptAsync({
            path: { id: sessionId },
            body: {
                parts: [{ type: 'text', text: PROMPT }],
                model: {
                    providerID: model.providerID,
                    modelID: model.modelID,
                },
            },
        });
        if (result.error) {
            console.error('failed:', result.error);
            return;
        }
        console.log('done\n');
        // Process events
        const { responseText } = await processEventStream(events, { verbose });
        // Print result
        console.log('\n' + '='.repeat(50));
        console.log('RESPONSE:');
        console.log('='.repeat(50));
        console.log(responseText || '(no response received)');
        console.log('='.repeat(50));
        // Get the captured summaries from MCP tool
        console.log('\n' + '='.repeat(50));
        console.log('MCP TOOL RESULTS:');
        console.log('='.repeat(50));
        const summaries = await Promise.race([
            toolServer.resultPromise,
            new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
        ]);
        if (!summaries) {
            console.error('FAIL: Tool was not called - no results captured');
            process.exit(1);
        }
        if (!Array.isArray(summaries)) {
            console.error('FAIL: Tool result is not an array');
            process.exit(1);
        }
        if (summaries.length === 0) {
            console.error('FAIL: Tool was called but returned empty array');
            process.exit(1);
        }
        // Validate each summary has required fields
        for (const s of summaries) {
            if (!s.filename || typeof s.filename !== 'string') {
                console.error('FAIL: Summary missing valid filename:', s);
                process.exit(1);
            }
            if (!s.summary || typeof s.summary !== 'string') {
                console.error('FAIL: Summary missing valid summary text:', s);
                process.exit(1);
            }
        }
        console.log(`PASS: Captured ${summaries.length} summaries via MCP tool:\n`);
        for (const s of summaries) {
            console.log(`  - ${s.filename}: ${s.summary}`);
        }
        console.log('\n' + '='.repeat(50));
        console.log('All checks passed!');
        console.log('='.repeat(50));
    }
    finally {
        server.close();
        await toolServer.close();
    }
}
//# sourceMappingURL=test-opencode.js.map