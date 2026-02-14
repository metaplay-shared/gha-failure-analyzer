import { z } from 'zod';
/**
 * GitHub commit information
 */
export interface CommitInfo {
    sha: string;
    message: string;
    author: string;
}
/**
 * GitHub workflow run information
 */
export interface WorkflowRun {
    id: number;
    workflowName: string;
    branch: string;
    status: 'completed' | 'in_progress' | 'queued';
    conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
    createdAt: string;
    updatedAt: string;
    url: string;
    logsUrl: string;
    headCommit?: CommitInfo;
}
/**
 * Workflow job information
 */
export interface WorkflowJob {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    steps: WorkflowStep[];
}
/**
 * Workflow step information
 */
export interface WorkflowStep {
    name: string;
    status: string;
    conclusion: string | null;
    number: number;
}
/**
 * Failure information extracted from a workflow run
 */
export interface FailureInfo {
    step: string;
    job: string;
    message: string;
    logs?: string;
}
/**
 * Attribution for a failure (commit/author that likely caused it)
 */
export declare const FailureAttributionSchema: z.ZodObject<{
    commit: z.ZodString;
    author: z.ZodString;
    message: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type FailureAttribution = z.infer<typeof FailureAttributionSchema>;
/**
 * AI-generated analysis of a CI failure
 */
export declare const AIAnalysisSchema: z.ZodObject<{
    summary: z.ZodArray<z.ZodString>;
    attribution: z.ZodOptional<z.ZodObject<{
        commit: z.ZodString;
        author: z.ZodString;
        message: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    details: z.ZodString;
    confidence: z.ZodOptional<z.ZodEnum<{
        high: "high";
        medium: "medium";
        low: "low";
    }>>;
    is_flaky: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;
/**
 * Generate a JSON schema description for prompts from the AIAnalysisSchema.
 * This extracts the descriptions from Zod and formats them for LLM consumption.
 */
export declare function getAIAnalysisSchemaDescription(): string;
/**
 * Analysis result from the OpenCode SDK
 */
export interface AnalysisResult {
    repository: string;
    runId: number;
    workflowName: string;
    status: string;
    failures: FailureInfo[];
    analysis: AIAnalysis | null;
    analyzedAt: string;
}
/**
 * Options for analyzing a workflow run
 */
export interface AnalyzeOptions {
    repo: string;
    runId?: number;
    repoPath?: string;
    verbose?: boolean;
    /** Soft timeout in minutes - sends urgent emit prompt when reached */
    softTimeoutMinutes: number;
}
/**
 * Options for listing workflow runs
 */
export interface ListOptions {
    repo: string;
    limit?: number;
    workflow?: string;
}
//# sourceMappingURL=types.d.ts.map