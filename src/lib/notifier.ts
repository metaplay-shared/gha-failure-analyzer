import type { WorkflowRun, WorkflowJob, AnalysisResult } from './types.js';
import { ConsoleNotifier } from './notifiers/console.js';
import { SlackNotifier, isSlackConfigured } from './notifiers/slack.js';

/**
 * Opaque handle for tracking notification state across calls
 */
export interface NotifierHandle {
  readonly __brand: 'NotifierHandle';
}

/**
 * Notifier plugin interface
 * Implement this interface to add new notification backends
 */
export interface Notifier {
  readonly name: string;

  /**
   * Send notification that analysis has started
   * Returns a handle for tracking the notification state
   */
  notifyStart(run: WorkflowRun, jobs: WorkflowJob[], repo: string): Promise<NotifierHandle>;

  /**
   * Update notification with completed analysis results
   */
  notifyComplete(handle: NotifierHandle, result: AnalysisResult): Promise<void>;
}

/**
 * Get the active notifier based on configuration
 * Returns SlackNotifier if configured, otherwise ConsoleNotifier
 */
export function getNotifier(): Notifier {
  if (isSlackConfigured()) {
    return new SlackNotifier();
  }
  return new ConsoleNotifier();
}
