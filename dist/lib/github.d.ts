import type { WorkflowRun, WorkflowJob, ListOptions } from './types.js';
/**
 * Parse repository string into owner and repo
 */
export declare function parseRepository(repo: string): {
    owner: string;
    repo: string;
};
/**
 * Get the GitHub token from environment
 */
export declare function getGitHubToken(): string;
/**
 * List failed workflow runs for a repository
 */
export declare function listFailedRuns(options: ListOptions): Promise<WorkflowRun[]>;
/**
 * Get details for a specific workflow run
 */
export declare function getWorkflowRun(repo: string, runId: number): Promise<WorkflowRun>;
/**
 * Get jobs for a workflow run
 */
export declare function getWorkflowJobs(repo: string, runId: number): Promise<WorkflowJob[]>;
/**
 * Download and extract logs for a workflow run
 * Returns a map of job names to their log content
 */
export declare function getWorkflowLogs(repo: string, runId: number): Promise<Map<string, string>>;
/**
 * Get workflow run summary (annotations and check run details)
 */
export declare function getWorkflowRunSummary(repo: string, runId: number): Promise<{
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
}>;
/**
 * Get the most recent failed workflow run
 */
export declare function getMostRecentFailedRun(repo: string): Promise<WorkflowRun | null>;
//# sourceMappingURL=github.d.ts.map