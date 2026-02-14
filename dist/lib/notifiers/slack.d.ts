import type { Notifier, NotifierHandle } from '../notifier.js';
import type { WorkflowRun, WorkflowJob, AnalysisResult } from '../types.js';
/**
 * Check if Slack is configured via environment variables
 */
export declare function isSlackConfigured(): boolean;
/**
 * Slack notifier - sends messages to Slack channel
 * Supports message updates and threading
 */
export declare class SlackNotifier implements Notifier {
    readonly name = "slack";
    private client;
    private channel;
    constructor();
    notifyStart(run: WorkflowRun, jobs: WorkflowJob[], repo: string): Promise<NotifierHandle>;
    notifyComplete(handle: NotifierHandle, result: AnalysisResult): Promise<void>;
}
//# sourceMappingURL=slack.d.ts.map