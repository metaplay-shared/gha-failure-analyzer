import type { WorkflowRun, WorkflowJob, AnalysisResult } from './types.js';
import type { KnownBlock } from '@slack/web-api';
export interface SlackMessage {
    blocks: KnownBlock[];
    text: string;
}
/**
 * Context for Slack message formatting
 */
export interface SlackMessageContext {
    workflowName: string;
    failedSteps: string[];
    runUrl: string;
    commitUrl: string;
}
/**
 * Build Slack message context from workflow run, jobs, and repository
 */
export declare function buildSlackContext(run: WorkflowRun, jobs: WorkflowJob[], repo: string): SlackMessageContext;
/**
 * Format the initial "Analyzing..." message
 */
export declare function formatAnalyzingBlocks(ctx: SlackMessageContext): SlackMessage;
/**
 * Format the completed analysis message (replaces initial message)
 */
export declare function formatCompletedBlocks(ctx: SlackMessageContext, result: AnalysisResult): SlackMessage;
/**
 * Format the thread reply with full analysis details
 */
export declare function formatDetailsBlocks(result: AnalysisResult): SlackMessage;
/**
 * Format message for stdout fallback (when Slack not configured)
 */
export declare function formatStdoutStarted(ctx: SlackMessageContext): string;
/**
 * Format completed analysis for stdout fallback
 */
export declare function formatStdoutCompleted(ctx: SlackMessageContext, result: AnalysisResult): string;
/**
 * Format details for stdout fallback (thread reply simulation)
 */
export declare function formatStdoutDetails(result: AnalysisResult): string;
//# sourceMappingURL=slack-formatter.d.ts.map