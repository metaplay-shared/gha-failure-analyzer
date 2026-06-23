import { type AIAnalysis, type AnalysisResult, type AnalyzeOptions } from './types.js';
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
/**
 * Last-resort fallback: build an AIAnalysis from the model's freeform response text when it
 * produced an analysis but never called the report_analysis tool (and the text wasn't JSON).
 * Keeps the model's full prose as `details` and derives up to 3 summary bullets from it.
 */
export declare function synthesizeAnalysisFromText(text: string): AIAnalysis;
//# sourceMappingURL=analyzer.d.ts.map