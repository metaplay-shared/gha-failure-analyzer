import * as core from '@actions/core';
import { context } from '@actions/github';
import { analyzeWorkflowRun } from '../lib/analyzer.js';
import { formatAnalysisMarkdown } from '../lib/output-formatter.js';

async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true });
    process.env.GITHUB_TOKEN = token;

    // Extract Slack configuration
    const slackToken = core.getInput('slack-token') || undefined;
    const slackChannel = core.getInput('slack-channel') || undefined;
    if (slackToken) process.env.SLACK_TOKEN = slackToken;
    if (slackChannel) process.env.SLACK_CHANNEL = slackChannel;

    let runId: string | undefined = core.getInput('run-id') || undefined;
    let repository: string | undefined = core.getInput('repository') || undefined;
    const timeoutMinutes = parseInt(core.getInput('soft-timeout'), 10);

    // Extract from workflow_run event context
    if (context.eventName === 'workflow_run') {
      const workflowRun = context.payload.workflow_run;
      if (!runId) runId = workflowRun?.id?.toString();
      if (!repository) repository = context.payload.repository?.full_name;

      // Skip if workflow didn't fail
      if (workflowRun?.conclusion !== 'failure') {
        core.info('Workflow did not fail, skipping analysis');
        return;
      }
    }

    if (!repository) {
      repository = `${context.repo.owner}/${context.repo.repo}`;
    }

    // At this point repository is guaranteed to be a string
    const repoName: string = repository;

    if (!runId) {
      core.setFailed('run-id is required when not triggered by workflow_run event');
      return;
    }

    core.info(`Analyzing workflow run ${runId} in ${repoName}`);

    const result = await analyzeWorkflowRun({
      repo: repoName,
      runId: parseInt(runId, 10),
      softTimeoutMinutes: timeoutMinutes,
    });

    const markdown = formatAnalysisMarkdown(result);
    await core.summary.addRaw(markdown).write();

    // Set outputs - use summary bullets as recommendations
    const summaryText = result.analysis?.summary.join('\n') ?? '';
    core.setOutput('summary', summaryText);
    core.setOutput('recommendations', JSON.stringify(result.analysis?.summary ?? []));

    core.info('Analysis complete - see job summary for details');
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : 'Unknown error');
  }
}

// Force exit after completion to close lingering connections (e.g., event streams)
// process.exitCode is already set by core.setFailed() if there was an error
run().then(() => process.exit());
