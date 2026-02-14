import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { createCommandRunner } from '../cli/command-runner.js';
import { parseRunUrl } from '../cli/validators.js';
import { analyzeWorkflowRun } from '../lib/analyzer.js';
import { formatAnalysisMarkdown } from '../lib/output-formatter.js';
import { renderMarkdown } from '../lib/markdown.js';
import type { AnalysisResult } from '../lib/types.js';

/** Default repo path relative to this project */
const DEFAULT_REPO_PATH = '../sdk';

/**
 * Resolve and validate the repo path for AI analysis context.
 */
function resolveRepoPath(repoPath: string | undefined): string {
  const baseDir = process.env.INIT_CWD || process.cwd();
  const raw = repoPath ?? DEFAULT_REPO_PATH;
  const resolved = resolve(baseDir, raw);

  if (!existsSync(resolved)) {
    const lines = [
      `Error: Repository path does not exist: ${resolved}`,
    ];
    if (!repoPath) {
      lines.push(`  (default: ${DEFAULT_REPO_PATH} resolved from ${baseDir})`);
    }
    lines.push('', 'Use --repo-path to specify the target repository:');
    lines.push('  pnpm dev analyze <url> --repo-path /path/to/repo');
    console.error(lines.join('\n'));
    process.exit(1);
  }

  if (!statSync(resolved).isDirectory()) {
    console.error(`Error: Repository path is not a directory: ${resolved}`);
    process.exit(1);
  }

  return resolved;
}

export interface AnalyzeOptions {
  raw?: boolean;
  repoPath?: string;
  verbose?: boolean;
  quiet?: boolean;
  timeout?: number;
}

/**
 * Register the analyze command
 */
export function register(program: Command): void {
  program
    .command('analyze <url>')
    .description('Analyze a failed GitHub Actions workflow run')
    .option('--raw', 'Output raw markdown without terminal formatting')
    .option(`-p, --repo-path <path>`, `Repository root for AI analysis context (default: "${DEFAULT_REPO_PATH}")`)
    .option('-t, --timeout <minutes>', 'Soft timeout - sends "emit now" prompt (default: 15)', parseInt, 15)
    .option('-v, --verbose', 'Show detailed progress')
    .option('-q, --quiet', 'Suppress output except errors')
    .action(async (url: string, options: AnalyzeOptions) => {
      await action(url, options);
    });
}

/**
 * Execute the analyze command
 */
export async function action(url: string, options: AnalyzeOptions): Promise<AnalysisResult | undefined> {
  const repoPath = resolveRepoPath(options.repoPath);
  console.log(`Repository root: ${repoPath}`);

  const runner = createCommandRunner<AnalyzeOptions, AnalysisResult>('analyze', options);

  const result = await runner.run(async (opts, progress) => {
    // Parse the URL to extract owner, repo, and runId
    const { owner, repo, runId } = parseRunUrl(url);
    const repoFullName = `${owner}/${repo}`;

    progress.update('analyze', `Analyzing workflow run ${runId} for ${repoFullName}`);

    const analysis = await analyzeWorkflowRun({
      repo: repoFullName,
      runId,
      repoPath,
      verbose: opts.verbose,
      softTimeoutMinutes: opts.timeout!, // Commander provides default
    });

    // Format and display output
    const markdown = formatAnalysisMarkdown(analysis);
    const separator = '='.repeat(70);
    console.log(`\n${separator}\nAI ANALYSIS\n${separator}\n`);
    console.log(renderMarkdown(markdown, { forceRaw: opts.raw }));
    console.log(`\n${separator}`);

    return analysis;
  });

  if (!result.success) {
    process.exit(1);
  }

  return result.data;
}
