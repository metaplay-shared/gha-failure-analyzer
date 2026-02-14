import type { Notifier, NotifierHandle } from '../notifier.js';
import type { WorkflowRun, WorkflowJob, AnalysisResult } from '../types.js';
/**
 * Console notifier - logs formatted messages to stdout
 * Used as fallback when no other notifier is configured
 */
export declare class ConsoleNotifier implements Notifier {
    readonly name = "console";
    notifyStart(run: WorkflowRun, jobs: WorkflowJob[], repo: string): Promise<NotifierHandle>;
    notifyComplete(handle: NotifierHandle, result: AnalysisResult): Promise<void>;
}
//# sourceMappingURL=console.d.ts.map