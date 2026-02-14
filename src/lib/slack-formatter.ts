import type { WorkflowRun, WorkflowJob, AnalysisResult } from './types.js';
import type { KnownBlock } from '@slack/web-api';

export interface SlackMessage {
  blocks: KnownBlock[];
  text: string; // Fallback text for notifications
}

/**
 * Context for Slack message formatting
 */
export interface SlackMessageContext {
  workflowName: string;
  failedSteps: string[]; // Array of "job → step" strings
  runUrl: string;
  commitUrl: string;
}

/**
 * Extract failed steps from jobs as "job → step" strings
 */
function extractFailedSteps(jobs: WorkflowJob[]): string[] {
  const failures: string[] = [];
  for (const job of jobs) {
    if (job.conclusion === 'failure') {
      for (const step of job.steps) {
        if (step.conclusion === 'failure') {
          failures.push(`${job.name} → ${step.name}`);
        }
      }
    }
  }
  return failures;
}

/**
 * Convert standard Markdown to Slack mrkdwn format
 * - ## Headers → *Bold*
 * - **bold** → *bold*
 * - ```language → ``` (remove language specifier)
 */
function markdownToMrkdwn(markdown: string): string {
  return markdown
    // Convert headers (##, ###, ####) to bold
    .replace(/^#{1,4}\s+(.+)$/gm, '*$1*')
    // Convert **bold** to *bold* (Slack uses single asterisks)
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    // Remove language specifier from code blocks
    .replace(/```\w+\n/g, '```\n');
}

/**
 * Format failed steps for display, truncating if too long
 */
function formatFailedSteps(failures: string[], maxLength = 100): string {
  if (failures.length === 0) return 'No failures identified';

  let result = failures[0];
  let included = 1;

  for (let i = 1; i < failures.length; i++) {
    const next = `${result}, ${failures[i]}`;
    if (next.length > maxLength) {
      const remaining = failures.length - included;
      return `${result} (+${remaining} more)`;
    }
    result = next;
    included++;
  }

  return result;
}

/**
 * Build Slack message context from workflow run, jobs, and repository
 */
export function buildSlackContext(run: WorkflowRun, jobs: WorkflowJob[], repo: string): SlackMessageContext {
  const [owner, repoName] = repo.split('/');
  const commitSha = run.headCommit?.sha || 'unknown';
  return {
    workflowName: run.workflowName,
    failedSteps: extractFailedSteps(jobs),
    runUrl: run.url,
    commitUrl: `https://github.com/${owner}/${repoName}/commit/${commitSha}`,
  };
}

/**
 * Format the initial "Analyzing..." message
 */
export function formatAnalyzingBlocks(ctx: SlackMessageContext): SlackMessage {
  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${ctx.workflowName}* failed!`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*Failed:* ${formatFailedSteps(ctx.failedSteps)}`,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '*AI summary:* _Loading..._',
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: ':printer: View logs', emoji: true },
          url: ctx.runUrl,
          action_id: 'view_logs',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: ':wrench: View commit', emoji: true },
          url: ctx.commitUrl,
          action_id: 'view_commit',
        },
      ],
    },
  ];

  return {
    blocks,
    text: `*${ctx.workflowName}* failed!`,
  };
}

/**
 * Format confidence level as a tag
 */
function formatConfidenceTag(confidence?: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high':
      return ':large_green_circle: High confidence';
    case 'medium':
      return ':large_yellow_circle: Medium confidence';
    case 'low':
      return ':red_circle: Low confidence';
    default:
      return '';
  }
}

/**
 * Format the completed analysis message (replaces initial message)
 */
export function formatCompletedBlocks(ctx: SlackMessageContext, result: AnalysisResult): SlackMessage {
  const analysis = result.analysis;
  const hasAnalysis = analysis !== null;

  // Format summary bullets for display
  let summaryBullets = '_Analysis could not determine the root cause._';
  if (hasAnalysis && analysis.summary.length > 0) {
    summaryBullets = analysis.summary.map((s) => `• ${s}`).join('\n');
  }

  // Build tags for confidence and flakiness
  const tags: string[] = [];
  if (hasAnalysis) {
    const confidenceTag = formatConfidenceTag(analysis.confidence);
    if (confidenceTag) tags.push(confidenceTag);
    if (analysis.is_flaky) tags.push(':arrows_counterclockwise: Flaky');
  }

  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${ctx.workflowName}* failed!`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*Failed:* ${formatFailedSteps(ctx.failedSteps)}`,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*AI summary:*\n${summaryBullets}`,
        },
      ],
    },
  ];

  // Add tags row if we have any
  if (tags.length > 0) {
    blocks.push({
      type: 'context',
      elements: tags.map((tag) => ({
        type: 'mrkdwn' as const,
        text: tag,
      })),
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: ':printer: View logs', emoji: true },
        url: ctx.runUrl,
        action_id: 'view_logs',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: ':wrench: View commit', emoji: true },
        url: ctx.commitUrl,
        action_id: 'view_commit',
      },
    ],
  });

  return {
    blocks,
    text: `*${ctx.workflowName}* failed!`,
  };
}

/**
 * Format the thread reply with full analysis details
 */
export function formatDetailsBlocks(result: AnalysisResult): SlackMessage {
  const analysis = result.analysis;
  const blocks: KnownBlock[] = [];

  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: ':mag: Full Analysis Details',
      emoji: true,
    },
  });

  if (analysis?.details) {
    // Convert standard markdown to Slack mrkdwn format
    const details = markdownToMrkdwn(analysis.details);
    // Slack has a 3000 char limit per section, so we may need to split
    const maxLength = 2900;

    if (details.length <= maxLength) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: details,
        },
      });
    } else {
      // Split into chunks
      let remaining = details;
      while (remaining.length > 0) {
        const chunk = remaining.slice(0, maxLength);
        const lastNewline = chunk.lastIndexOf('\n');
        const splitAt = lastNewline > maxLength / 2 ? lastNewline : maxLength;

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: remaining.slice(0, splitAt),
          },
        });
        remaining = remaining.slice(splitAt).trim();
      }
    }
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '_No detailed analysis available._',
      },
    });
  }

  // Add metadata footer
  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `:clock1: Analyzed at ${result.analyzedAt} | Run ID: ${result.runId}`,
        },
      ],
    }
  );

  return {
    blocks,
    text: `Full analysis details for ${result.workflowName}`,
  };
}

/**
 * Format message for stdout fallback (when Slack not configured)
 */
export function formatStdoutStarted(ctx: SlackMessageContext): string {
  return `[notify] Send Slack message: "${ctx.workflowName}" failed
 | Failed: ${formatFailedSteps(ctx.failedSteps)}
 | AI summary: Loading...`;
}

/**
 * Format completed analysis for stdout fallback
 */
export function formatStdoutCompleted(ctx: SlackMessageContext, result: AnalysisResult): string {
  const analysis = result.analysis;

  let summaryText = 'Analysis could not determine the root cause.';
  if (analysis && analysis.summary.length > 0) {
    summaryText = analysis.summary.map((s) => `• ${s}`).join('\n |   ');
  }

  return `[notify] Update Slack message: "${ctx.workflowName}" failed
 | Failed: ${formatFailedSteps(ctx.failedSteps)}
 | AI summary:
 |   ${summaryText}`;
}

/**
 * Format details for stdout fallback (thread reply simulation)
 */
export function formatStdoutDetails(result: AnalysisResult): string {
  const analysis = result.analysis;
  const details = analysis?.details ?? 'No detailed analysis available.';
  const detailLines = details.split('\n').map((line) => ` | ${line}`).join('\n');

  return `[notify] Slack thread: Full analysis details
${detailLines}
 | Analyzed at: ${result.analyzedAt} | Run ID: ${result.runId}`;
}
