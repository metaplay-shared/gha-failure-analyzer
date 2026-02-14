import { execFileSync } from 'node:child_process';
import { Octokit } from '@octokit/rest';
import type { WorkflowRun, WorkflowJob, ListOptions } from './types.js';

let octokitInstance: Octokit | null = null;

/**
 * Parse repository string into owner and repo
 */
export function parseRepository(repo: string): { owner: string; repo: string } {
  const [owner, repoName] = repo.split('/');
  return { owner, repo: repoName };
}

/**
 * Get the GitHub token from environment, falling back to `gh auth token`
 */
export function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    return token;
  }

  // When running locally (not in GitHub Actions), try the gh CLI
  if (!process.env.GITHUB_ACTIONS) {
    try {
      const ghToken = execFileSync('gh', ['auth', 'token'], { encoding: 'utf-8' }).trim();
      if (ghToken) {
        return ghToken;
      }
    } catch {
      // gh CLI not available or not authenticated
    }
  }

  throw new Error(
    'GITHUB_TOKEN environment variable is required.\n' +
    'Set it using the GitHub CLI:\n' +
    '  Unix/macOS:  export GITHUB_TOKEN=$(gh auth token)\n' +
    '  PowerShell:  $env:GITHUB_TOKEN = $(gh auth token)'
  );
}

/**
 * Get or create an Octokit instance
 */
function getOctokit(): Octokit {
  if (!octokitInstance) {
    octokitInstance = new Octokit({
      auth: getGitHubToken(),
    });
  }
  return octokitInstance;
}

/**
 * List failed workflow runs for a repository
 */
export async function listFailedRuns(options: ListOptions): Promise<WorkflowRun[]> {
  const { owner, repo } = parseRepository(options.repo);
  const octokit = getOctokit();

  const response = await octokit.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    status: 'completed',
    per_page: options.limit || 10,
  });

  // Filter to only failed runs and optionally by workflow name
  const failedRuns = response.data.workflow_runs.filter((run) => {
    const isFailed = run.conclusion === 'failure';
    const matchesWorkflow = !options.workflow || run.name === options.workflow;
    return isFailed && matchesWorkflow;
  });

  return failedRuns.map((run) => ({
    id: run.id,
    workflowName: run.name || 'Unknown',
    branch: run.head_branch || 'unknown',
    status: run.status as WorkflowRun['status'],
    conclusion: run.conclusion as WorkflowRun['conclusion'],
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    url: run.html_url,
    logsUrl: run.logs_url,
  }));
}

/**
 * Get details for a specific workflow run
 */
export async function getWorkflowRun(repo: string, runId: number): Promise<WorkflowRun> {
  const { owner, repo: repoName } = parseRepository(repo);
  const octokit = getOctokit();

  const response = await octokit.actions.getWorkflowRun({
    owner,
    repo: repoName,
    run_id: runId,
  });

  const run = response.data;

  return {
    id: run.id,
    workflowName: run.name || 'Unknown',
    branch: run.head_branch || 'unknown',
    status: run.status as WorkflowRun['status'],
    conclusion: run.conclusion as WorkflowRun['conclusion'],
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    url: run.html_url,
    logsUrl: run.logs_url,
    headCommit: run.head_commit ? {
      sha: run.head_sha,
      message: run.head_commit.message?.split('\n')[0] || '', // First line only
      author: run.head_commit.author?.name || run.head_commit.author?.email || 'unknown',
    } : undefined,
  };
}

/**
 * Get jobs for a workflow run
 */
export async function getWorkflowJobs(repo: string, runId: number): Promise<WorkflowJob[]> {
  const { owner, repo: repoName } = parseRepository(repo);
  const octokit = getOctokit();

  const response = await octokit.actions.listJobsForWorkflowRun({
    owner,
    repo: repoName,
    run_id: runId,
  });

  return response.data.jobs.map((job) => ({
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    steps: (job.steps || []).map((step) => ({
      name: step.name,
      status: step.status,
      conclusion: step.conclusion || null,
      number: step.number,
    })),
  }));
}

/**
 * Download and extract logs for a workflow run
 * Returns a map of job names to their log content
 */
export async function getWorkflowLogs(repo: string, runId: number): Promise<Map<string, string>> {
  const { owner, repo: repoName } = parseRepository(repo);
  const octokit = getOctokit();

  const jobLogs = new Map<string, string>();

  try {
    const jobs = await getWorkflowJobs(repo, runId);

    for (const job of jobs) {
      // Skip jobs that were skipped or cancelled - they may not have logs
      if (job.conclusion === 'skipped' || job.conclusion === 'cancelled') {
        jobLogs.set(job.name, `[Job was ${job.conclusion}]`);
        continue;
      }

      try {
        const jobLogResponse = await octokit.actions.downloadJobLogsForWorkflowRun({
          owner,
          repo: repoName,
          job_id: job.id,
        });

        jobLogs.set(job.name, String(jobLogResponse.data));
      } catch {
        jobLogs.set(job.name, '[Log retrieval failed]');
      }
    }
  } catch {
    // Return empty map if fetching fails entirely
  }

  return jobLogs;
}

/**
 * Get workflow run summary (annotations and check run details)
 */
export async function getWorkflowRunSummary(repo: string, runId: number): Promise<{
  run: WorkflowRun;
  jobs: WorkflowJob[];
  annotations: Array<{
    jobName: string;
    path: string;
    startLine: number;
    endLine: number;
    annotationLevel: string;
    message: string;
    title: string;
  }>;
}> {
  const { owner, repo: repoName } = parseRepository(repo);
  const octokit = getOctokit();

  const [run, jobs] = await Promise.all([
    getWorkflowRun(repo, runId),
    getWorkflowJobs(repo, runId),
  ]);

  // Get annotations from check runs
  const annotations: Array<{
    jobName: string;
    path: string;
    startLine: number;
    endLine: number;
    annotationLevel: string;
    message: string;
    title: string;
  }> = [];

  for (const job of jobs) {
    try {
      const checkRunResponse = await octokit.checks.listAnnotations({
        owner,
        repo: repoName,
        check_run_id: job.id,
      });

      for (const annotation of checkRunResponse.data) {
        annotations.push({
          jobName: job.name,
          path: annotation.path,
          startLine: annotation.start_line,
          endLine: annotation.end_line || annotation.start_line,
          annotationLevel: annotation.annotation_level || 'notice',
          message: annotation.message || '',
          title: annotation.title || '',
        });
      }
    } catch {
      // Annotations not available for this job
    }
  }

  return { run, jobs, annotations };
}

/**
 * Get the most recent failed workflow run
 */
export async function getMostRecentFailedRun(repo: string): Promise<WorkflowRun | null> {
  const runs = await listFailedRuns({ repo, limit: 1 });
  return runs.length > 0 ? runs[0] : null;
}
