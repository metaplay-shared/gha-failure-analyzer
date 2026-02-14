import EventEmitter from 'eventemitter3';
export interface ProgressHandlerOptions {
    verbose?: boolean;
    quiet?: boolean;
}
/**
 * Handles progress reporting for CLI commands
 */
export declare class ProgressHandler extends EventEmitter {
    private verbose;
    private quiet;
    constructor(options?: ProgressHandlerOptions);
    /**
     * Emit a progress event
     */
    private emit_event;
    /**
     * Log progress to console based on verbosity settings
     */
    private log;
    /**
     * Signal the start of a stage
     */
    start(stage: string, message?: string): void;
    /**
     * Report progress within a stage
     */
    update(stage: string, message: string, current?: number, total?: number): void;
    /**
     * Signal completion of a stage
     */
    complete(stage: string, message?: string): void;
    /**
     * Signal an error in a stage
     */
    error(stage: string, error: Error): void;
}
//# sourceMappingURL=progress-handler.d.ts.map