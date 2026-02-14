import { ProgressHandler } from './progress-handler.js';
/**
 * Generic command runner that provides consistent UX for all commands
 */
export class CommandRunner {
    config;
    progressHandler;
    constructor(config) {
        this.config = config;
        this.progressHandler = new ProgressHandler({
            verbose: config.verbose,
            quiet: config.quiet,
        });
    }
    /**
     * Run the command with consistent error handling and progress reporting
     */
    async run(action) {
        const { name, options } = this.config;
        try {
            this.progressHandler.start(name);
            const result = await action(options, this.progressHandler);
            this.progressHandler.complete(name);
            return { success: true, data: result };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.progressHandler.error(name, err);
            return { success: false, error: err };
        }
    }
    /**
     * Get the progress handler for manual progress updates
     */
    get progress() {
        return this.progressHandler;
    }
}
/**
 * Helper to create a command runner
 */
export function createCommandRunner(name, options) {
    return new CommandRunner({
        name,
        options,
        verbose: options.verbose,
        quiet: options.quiet,
    });
}
//# sourceMappingURL=command-runner.js.map