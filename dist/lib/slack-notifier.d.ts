import { type SlackMessageHandle } from './slack.js';
import type { WorkflowRun, AnalysisResult } from './types.js';
/**
 * Handle for tracking a notification (Slack message or stdout placeholder)
 */
export interface NotificationHandle {
    type: 'slack' | 'stdout';
    slack?: SlackMessageHandle;
}
/**
 * Notify that analysis has started
 * Sends to Slack if configured, otherwise logs to stdout
 */
export declare function notifyStart(run: WorkflowRun, repo: string): Promise<NotificationHandle>;
/**
 * Notify that analysis is complete
 * Updates Slack message and sends thread reply, or logs to stdout
 */
export declare function notifyComplete(handle: NotificationHandle, result: AnalysisResult): Promise<void>;
//# sourceMappingURL=slack-notifier.d.ts.map