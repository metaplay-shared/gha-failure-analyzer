import type { Notifier, NotifierHandle } from '../notifier.js';
import type { WorkflowRun, WorkflowJob, AnalysisResult } from '../types.js';
import {
  formatStdoutStarted,
  formatStdoutCompleted,
  buildSlackContext,
  type SlackMessageContext,
} from '../slack-formatter.js';

interface ConsoleHandle extends NotifierHandle {
  ctx: SlackMessageContext;
}

/**
 * Console notifier - logs formatted messages to stdout
 * Used as fallback when no other notifier is configured
 */
export class ConsoleNotifier implements Notifier {
  readonly name = 'console';

  async notifyStart(run: WorkflowRun, jobs: WorkflowJob[], repo: string): Promise<NotifierHandle> {
    const ctx = buildSlackContext(run, jobs, repo);
    console.log(formatStdoutStarted(ctx));
    return { ctx } as ConsoleHandle;
  }

  async notifyComplete(handle: NotifierHandle, result: AnalysisResult): Promise<void> {
    const consoleHandle = handle as ConsoleHandle;
    console.log(formatStdoutCompleted(consoleHandle.ctx, result));
  }
}
