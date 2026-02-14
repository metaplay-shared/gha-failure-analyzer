import { WebClient } from '@slack/web-api';
import { formatAnalyzingBlocks, formatCompletedBlocks, formatDetailsBlocks, } from './slack-formatter.js';
let slackClient = null;
/**
 * Check if Slack is configured via environment variables
 */
export function isSlackConfigured() {
    return Boolean(process.env.SLACK_TOKEN && process.env.SLACK_CHANNEL);
}
/**
 * Get Slack configuration from environment
 * Returns null if not configured
 */
export function getSlackConfig() {
    const token = process.env.SLACK_TOKEN;
    const channel = process.env.SLACK_CHANNEL;
    if (!token || !channel) {
        return null;
    }
    return { token, channel };
}
/**
 * Get or create Slack WebClient instance
 */
function getSlackClient() {
    const config = getSlackConfig();
    if (!config) {
        throw new Error('Slack is not configured (SLACK_TOKEN and SLACK_CHANNEL required)');
    }
    if (!slackClient) {
        slackClient = new WebClient(config.token);
    }
    return slackClient;
}
/**
 * Send initial "Analyzing..." message to Slack
 */
export async function sendInitialMessage(run, repo) {
    const config = getSlackConfig();
    if (!config) {
        throw new Error('Slack is not configured');
    }
    const client = getSlackClient();
    const { blocks, text } = formatAnalyzingBlocks(run, repo);
    const result = await client.chat.postMessage({
        channel: config.channel,
        blocks,
        text,
    });
    if (!result.ok || !result.ts) {
        throw new Error(`Failed to send Slack message: ${result.error}`);
    }
    return {
        channel: result.channel || config.channel,
        ts: result.ts,
    };
}
/**
 * Update existing message with analysis results
 */
export async function updateMessage(handle, result) {
    const client = getSlackClient();
    const { blocks, text } = formatCompletedBlocks(result);
    const updateResult = await client.chat.update({
        channel: handle.channel,
        ts: handle.ts,
        blocks,
        text,
    });
    if (!updateResult.ok) {
        throw new Error(`Failed to update Slack message: ${updateResult.error}`);
    }
}
/**
 * Send thread reply with full analysis details
 */
export async function sendThreadReply(handle, result) {
    const client = getSlackClient();
    const { blocks, text } = formatDetailsBlocks(result);
    const replyResult = await client.chat.postMessage({
        channel: handle.channel,
        thread_ts: handle.ts,
        blocks,
        text,
    });
    if (!replyResult.ok) {
        throw new Error(`Failed to send Slack thread reply: ${replyResult.error}`);
    }
}
/**
 * Reset the Slack client (for testing)
 */
export function resetSlackClient() {
    slackClient = null;
}
//# sourceMappingURL=slack.js.map