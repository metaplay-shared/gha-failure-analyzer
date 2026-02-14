import EventEmitter from 'eventemitter3';
import type { ProgressEvent, ProgressEventType } from './types.js';

export interface ProgressHandlerOptions {
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * Handles progress reporting for CLI commands
 */
export class ProgressHandler extends EventEmitter {
  private verbose: boolean;
  private quiet: boolean;

  constructor(options: ProgressHandlerOptions = {}) {
    super();
    this.verbose = options.verbose ?? false;
    this.quiet = options.quiet ?? false;
  }

  /**
   * Emit a progress event
   */
  private emit_event(
    type: ProgressEventType,
    stage: string,
    message: string,
    extra?: Partial<ProgressEvent>
  ): void {
    const event: ProgressEvent = {
      type,
      stage,
      message,
      ...extra,
    };

    this.emit('progress', event);
    this.log(event);
  }

  /**
   * Log progress to console based on verbosity settings
   */
  private log(event: ProgressEvent): void {
    if (this.quiet) return;

    const { type, stage, message, current, total } = event;

    switch (type) {
      case 'start':
        console.log(`\n> ${stage}`);
        break;
      case 'progress':
        if (this.verbose) {
          const progress = total ? ` [${current}/${total}]` : '';
          console.log(`  ${message}${progress}`);
        }
        break;
      case 'complete':
        console.log(`  Done: ${message}`);
        break;
      case 'error':
        console.error(`  Error: ${message}`);
        break;
    }
  }

  /**
   * Signal the start of a stage
   */
  start(stage: string, message?: string): void {
    this.emit_event('start', stage, message ?? `Starting ${stage}...`);
  }

  /**
   * Report progress within a stage
   */
  update(stage: string, message: string, current?: number, total?: number): void {
    this.emit_event('progress', stage, message, { current, total });
  }

  /**
   * Signal completion of a stage
   */
  complete(stage: string, message?: string): void {
    this.emit_event('complete', stage, message ?? `${stage} completed`);
  }

  /**
   * Signal an error in a stage
   */
  error(stage: string, error: Error): void {
    this.emit_event('error', stage, error.message, { error });
  }
}
