import EventEmitter from 'eventemitter3';
/**
 * Handles progress reporting for CLI commands
 */
export class ProgressHandler extends EventEmitter {
    verbose;
    quiet;
    constructor(options = {}) {
        super();
        this.verbose = options.verbose ?? false;
        this.quiet = options.quiet ?? false;
    }
    /**
     * Emit a progress event
     */
    emit_event(type, stage, message, extra) {
        const event = {
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
    log(event) {
        if (this.quiet)
            return;
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
    start(stage, message) {
        this.emit_event('start', stage, message ?? `Starting ${stage}...`);
    }
    /**
     * Report progress within a stage
     */
    update(stage, message, current, total) {
        this.emit_event('progress', stage, message, { current, total });
    }
    /**
     * Signal completion of a stage
     */
    complete(stage, message) {
        this.emit_event('complete', stage, message ?? `${stage} completed`);
    }
    /**
     * Signal an error in a stage
     */
    error(stage, error) {
        this.emit_event('error', stage, error.message, { error });
    }
}
//# sourceMappingURL=progress-handler.js.map