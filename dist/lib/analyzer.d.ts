import { type AnalysisResult, type AnalyzeOptions } from './types.js';
import { type StoredWorkflowData } from './storage.js';
/**
 * Fetch workflow data and write it to .ci-analyzer/
 * Returns paths to the written files
 * @param baseDir - Base directory for storage
 */
export declare function fetchAndStoreWorkflow(repo: string, runId: number, baseDir: string): Promise<{
    summaryPath: string;
    logPaths: string[];
    storagePath: string;
    data: StoredWorkflowData;
    jobLogs: Map<string, string>;
}>;
/**
 * Analyze a workflow run using the OpenCode SDK
 */
export declare function analyzeWorkflowRun(options: AnalyzeOptions): Promise<AnalysisResult>;
//# sourceMappingURL=analyzer.d.ts.map