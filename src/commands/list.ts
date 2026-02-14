import { Command } from 'commander';
import { createCommandRunner } from '../cli/command-runner.js';
import { validateRepository, validatePositiveInt } from '../cli/validators.js';
import { listFailedRuns } from '../lib/github.js';
import type { WorkflowRun } from '../lib/types.js';

export interface ListOptions {
  repo: string;
  limit?: number;
  workflow?: string;
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * Register the list command
 */
export function register(program: Command): void {
  program
    .command('list')
    .description('List failed GitHub Actions workflow runs')
    .requiredOption('-r, --repo <owner/repo>', 'GitHub repository', validateRepository)
    .option('-l, --limit <count>', 'Maximum number of runs to list', validatePositiveInt, 10)
    .option('-w, --workflow <name>', 'Filter by workflow name')
    .option('-v, --verbose', 'Show detailed progress')
    .option('-q, --quiet', 'Suppress output except errors')
    .action(async (options: ListOptions) => {
      await action(options);
    });
}

/**
 * Execute the list command
 */
export async function action(options: ListOptions): Promise<WorkflowRun[] | undefined> {
  const runner = createCommandRunner<ListOptions, WorkflowRun[]>('list', options);

  const result = await runner.run(async (opts, progress) => {
    progress.update('list', `Fetching failed runs for ${opts.repo}`);

    const runs = await listFailedRuns({
      repo: opts.repo,
      limit: opts.limit,
      workflow: opts.workflow,
    });

    displayRuns(runs);
    return runs;
  });

  if (!result.success) {
    process.exit(1);
  }

  return result.data;
}

/**
 * Display the list of workflow runs
 */
function displayRuns(runs: WorkflowRun[]): void {
  if (runs.length === 0) {
    console.log('\nNo failed workflow runs found.');
    return;
  }

  console.log(`\nFound ${runs.length} failed workflow run(s):\n`);

  for (const run of runs) {
    const date = new Date(run.createdAt).toLocaleDateString();
    console.log(`  ${run.id} | ${run.workflowName.padEnd(30)} | ${run.branch.padEnd(20)} | ${date}`);
  }
}
