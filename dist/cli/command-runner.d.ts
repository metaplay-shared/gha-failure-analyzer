import { ProgressHandler } from './progress-handler.js';
import type { CommandResult, CommonOptions } from './types.js';
export interface CommandRunnerOptions<TOptions> extends CommonOptions {
    name: string;
    options: TOptions;
}
/**
 * Generic command runner that provides consistent UX for all commands
 */
export declare class CommandRunner<TOptions, TResult> {
    private config;
    private progressHandler;
    constructor(config: CommandRunnerOptions<TOptions>);
    /**
     * Run the command with consistent error handling and progress reporting
     */
    run(action: (options: TOptions, progress: ProgressHandler) => Promise<TResult>): Promise<CommandResult<TResult>>;
    /**
     * Get the progress handler for manual progress updates
     */
    get progress(): ProgressHandler;
}
/**
 * Helper to create a command runner
 */
export declare function createCommandRunner<TOptions, TResult>(name: string, options: TOptions & CommonOptions): CommandRunner<TOptions, TResult>;
//# sourceMappingURL=command-runner.d.ts.map