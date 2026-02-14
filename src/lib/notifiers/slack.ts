import { WebClient } from '@slack/web-api';
import type { Notifier, NotifierHandle } from '../notifier.js';
import type { WorkflowRun, WorkflowJob, AnalysisResult } from '../types.js';
import {
  formatAnalyzingBlocks,
  formatCompletedBlocks,
  formatDetailsBlocks,
  buildSlackContext,
  type SlackMessageContext,
} from '../slack-formatter.js';

interface SlackConfig {
  token: string;
  channel: string;
}

interface SlackHandle extends NotifierHandle {
  channel: string;
  ts: string;
  ctx: SlackMessageContext;
}

/**
 * Check if Slack is configured via environment variables
 */
export function isSlackConfigured(): boolean {
  return Boolean(process.env.SLACK_TOKEN && process.env.SLACK_CHANNEL);
}

/**
 * Get Slack configuration from environment
 */
function getSlackConfig(): SlackConfig {
  const token = process.env.SLACK_TOKEN;
  const channel = process.env.SLACK_CHANNEL;

  if (!token || !channel) {
    throw new Error('Slack is not configured (SLACK_TOKEN and SLACK_CHANNEL required)');
  }

  return { token, channel };
}

/**
 * Slack notifier - sends messages to Slack channel
 * Supports message updates and threading
 */
export class SlackNotifier implements Notifier {
  readonly name = 'slack';
  private client: WebClient;
  private channel: string;

  constructor() {
    const config = getSlackConfig();
    this.client = new WebClient(config.token);
    this.channel = config.channel;
  }

  async notifyStart(run: WorkflowRun, jobs: WorkflowJob[], repo: string): Promise<NotifierHandle> {
    const ctx = buildSlackContext(run, jobs, repo);
    const { blocks, text } = formatAnalyzingBlocks(ctx);

    const result = await this.client.chat.postMessage({
      channel: this.channel,
      blocks,
      text,
    });

    if (!result.ok || !result.ts) {
      throw new Error(`Failed to send Slack message: ${result.error}`);
    }

    return {
      channel: result.channel || this.channel,
      ts: result.ts,
      ctx,
    } as SlackHandle;
  }

  async notifyComplete(handle: NotifierHandle, result: AnalysisResult): Promise<void> {
    const slackHandle = handle as SlackHandle;

    // Update original message with summary
    const { blocks: completedBlocks, text: completedText } = formatCompletedBlocks(slackHandle.ctx, result);
    const updateResult = await this.client.chat.update({
      channel: slackHandle.channel,
      ts: slackHandle.ts,
      blocks: completedBlocks,
      text: completedText,
    });

    if (!updateResult.ok) {
      throw new Error(`Failed to update Slack message: ${updateResult.error}`);
    }

    // Send thread reply with full details
    const { blocks: detailBlocks, text: detailText } = formatDetailsBlocks(result);
    const replyResult = await this.client.chat.postMessage({
      channel: slackHandle.channel,
      thread_ts: slackHandle.ts,
      blocks: detailBlocks,
      text: detailText,
    });

    if (!replyResult.ok) {
      throw new Error(`Failed to send Slack thread reply: ${replyResult.error}`);
    }
  }
}
