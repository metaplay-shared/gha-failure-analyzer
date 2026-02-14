import type { WorkflowRun, WorkflowJob } from './types.js';
/**
 * Stored workflow data structure
 */
export interface StoredWorkflowData {
    fetchedAt: string;
    repository: string;
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
}
/**
 * Write workflow summary to disk
 * @param baseDir - Base directory for storage (defaults to INIT_CWD or cwd)
 */
export declare function writeWorkflowSummary(repo: string, runId: number, data: {
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
}, baseDir?: string): Promise<string>;
/**
 * Write individual job logs to separate files
 * @param baseDir - Base directory for storage (defaults to INIT_CWD or cwd)
 */
export declare function writeJobLogs(runId: number, jobLogs: Map<string, string>, baseDir?: string): Promise<string[]>;
/**
 * Read stored workflow summary from disk
 */
export declare function readWorkflowSummary(runId: number): Promise<StoredWorkflowData | null>;
/**
 * Read stored job logs from disk
 * Returns a map of safe filenames to their log content
 */
export declare function readJobLogs(runId: number): Promise<Map<string, string>>;
/**
 * List all stored workflow runs
 */
export declare function listStoredRuns(): Promise<Array<{
    repo: string;
    runId: number;
    fetchedAt: string;
}>>;
/**
 * Get the storage path for a workflow run
 * @param baseDir - Base directory for storage (defaults to INIT_CWD or cwd)
 */
export declare function getStoragePath(runId: number, baseDir?: string): string;
/**
 * Check if workflow data is already stored
 */
export declare function isWorkflowStored(runId: number): Promise<boolean>;
//# sourceMappingURL=storage.d.ts.map