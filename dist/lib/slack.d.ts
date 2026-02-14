import type { WorkflowRun, AnalysisResult } from './types.js';
export interface SlackConfig {
    token: string;
    channel: string;
}
export interface SlackMessageHandle {
    channel: string;
    ts: string;
}
/**
 * Check if Slack is configured via environment variables
 */
export declare function isSlackConfigured(): boolean;
/**
 * Get Slack configuration from environment
 * Returns null if not configured
 */
export declare function getSlackConfig(): SlackConfig | null;
/**
 * Send initial "Analyzing..." message to Slack
 */
export declare function sendInitialMessage(run: WorkflowRun, repo: string): Promise<SlackMessageHandle>;
/**
 * Update existing message with analysis results
 */
export declare function updateMessage(handle: SlackMessageHandle, result: AnalysisResult): Promise<void>;
/**
 * Send thread reply with full analysis details
 */
export declare function sendThreadReply(handle: SlackMessageHandle, result: AnalysisResult): Promise<void>;
/**
 * Reset the Slack client (for testing)
 */
export declare function resetSlackClient(): void;
//# sourceMappingURL=slack.d.ts.map