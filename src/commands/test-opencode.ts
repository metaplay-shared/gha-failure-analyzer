import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { createOpencodeClient, processEventStream } from '../lib/opencode.js';
import { AIAnalysisSchema, getAIAnalysisJsonSchema } from '../lib/types.js';

interface TestOptions {
  repoPath?: string;
  verbose?: boolean;
}

/**
 * Register the test-opencode command
 */
export function register(program: Command): void {
  program
    .command('test-opencode')
    .description("Smoke-test the configured model's structured-output (format: json_schema) support")
    .option('-p, --repo-path <path>', 'Working directory for the session')
    .option('-v, --verbose', 'Show all events')
    .action(async (options: TestOptions) => {
      await action(options);
    });
}

// Self-contained failure so the test exercises structured output without needing repo access.
const PROMPT = `# CI Failure Analysis (smoke test)

A GitHub Actions integration test failed with this log:

\`\`\`
21:41:10 server: Serving probe proxies on [::]:8585
21:41:15 botclient: FATAL Health probe proxy failed to bind port 8585: listen tcp :8585: bind: address already in use
21:41:15 botclient: process exited with code 1
\`\`\`

The server and botclient share one network namespace and both try to bind port 8585.
Provide your structured analysis. Do not use any tools; you have all the information you need above.`;

/**
 * Execute the test-opencode command.
 *
 * Verifies that the configured provider/model honors opencode's native structured output: it
 * sends a tiny analysis prompt with `format: json_schema` and asserts the model called the
 * built-in `StructuredOutput` tool with a schema-valid payload. This is the quickest way to
 * confirm a new model works before wiring it into CI.
 */
async function action(options: TestOptions): Promise<void> {
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

  console.log(`\n${PROMPT}\n`);

  // Start OpenCode server (prints model config and status)
  const { client, server, model } = await createOpencodeClient(workingDir);

  try {
    // Create session
    process.stdout.write('Creating session... ');
    const session = await client.session.create({ directory: workingDir });
    if (session.error || !session.data) {
      console.error('failed:', session.error);
      process.exit(1);
    }
    const sessionId = session.data.id;
    console.log(`done (${sessionId.slice(0, 12)}...)`);

    // Subscribe to events before sending the prompt
    process.stdout.write('Connecting... ');
    const events = await client.event.subscribe();
    console.log('done');

    // Send prompt with structured output enforced
    process.stdout.write('Sending prompt (format: json_schema)... ');
    const result = await client.session.promptAsync({
      sessionID: sessionId,
      model: { providerID: model.providerID, modelID: model.modelID },
      tools: { write: false, edit: false },
      format: { type: 'json_schema', schema: getAIAnalysisJsonSchema(), retryCount: 2 },
      parts: [{ type: 'text', text: PROMPT }],
    });
    if (result.error) {
      console.error('failed:', result.error);
      process.exit(1);
    }
    console.log('done\n');

    // Process events (live progress + captured tool calls)
    const { toolCalls } = await processEventStream(events, { verbose });

    console.log('\n' + '='.repeat(50));
    console.log('STRUCTURED OUTPUT RESULT:');
    console.log('='.repeat(50));

    const structured = toolCalls.find((tc) => tc.tool === 'StructuredOutput');
    if (!structured) {
      console.error('FAIL: model did not call the StructuredOutput tool - the provider may not support format: json_schema');
      process.exit(1);
    }

    const parsed = AIAnalysisSchema.safeParse(structured.input);
    if (!parsed.success) {
      console.error('FAIL: StructuredOutput payload did not match the schema:');
      console.error(JSON.stringify(parsed.error.flatten(), null, 2));
      process.exit(1);
    }

    console.log('PASS: model returned a schema-valid structured analysis:\n');
    for (const bullet of parsed.data.summary) {
      console.log(`  - ${bullet}`);
    }
    if (parsed.data.confidence) {
      console.log(`\n  confidence: ${parsed.data.confidence}`);
    }
    console.log('\n' + '='.repeat(50));
    console.log('All checks passed!');
    console.log('='.repeat(50));
  } finally {
    server.close();
  }
}
