import { isSlackConfigured, sendInitialMessage, updateMessage, sendThreadReply, } from './slack.js';
import { formatStdoutStarted, formatStdoutCompleted, formatStdoutDetails, } from './slack-formatter.js';
/**
 * Notify that analysis has started
 * Sends to Slack if configured, otherwise logs to stdout
 */
export async function notifyStart(run, repo) {
    if (isSlackConfigured()) {
        try {
            const slackHandle = await sendInitialMessage(run, repo);
            return { type: 'slack', slack: slackHandle };
        }
        catch (error) {
            console.error('[slack] Failed to send initial message:', error);
            // Fall through to stdout
        }
    }
    // Stdout fallback
    console.log(formatStdoutStarted(run, repo));
    return { type: 'stdout' };
}
/**
 * Notify that analysis is complete
 * Updates Slack message and sends thread reply, or logs to stdout
 */
export async function notifyComplete(handle, result) {
    if (handle.type === 'slack' && handle.slack) {
        try {
            await updateMessage(handle.slack, result);
            await sendThreadReply(handle.slack, result);
            return;
        }
        catch (error) {
            console.error('[slack] Failed to update message:', error);
            // Fall through to stdout
        }
    }
    // Stdout fallback
    console.log(formatStdoutCompleted(result));
    console.log(formatStdoutDetails(result));
}
//# sourceMappingURL=slack-notifier.js.map