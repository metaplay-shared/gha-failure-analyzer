import { ProgressHandler } from './progress-handler.js';
import type { CommandResult, CommonOptions } from './types.js';

export interface CommandRunnerOptions<TOptions> extends CommonOptions {
  name: string;
  options: TOptions;
}

/**
 * Generic command runner that provides consistent UX for all commands
 */
export class CommandRunner<TOptions, TResult> {
  private progressHandler: ProgressHandler;

  constructor(private config: CommandRunnerOptions<TOptions>) {
    this.progressHandler = new ProgressHandler({
      verbose: config.verbose,
      quiet: config.quiet,
    });
  }

  /**
   * Run the command with consistent error handling and progress reporting
   */
  async run(
    action: (options: TOptions, progress: ProgressHandler) => Promise<TResult>
  ): Promise<CommandResult<TResult>> {
    const { name, options } = this.config;

    try {
      this.progressHandler.start(name);
      const result = await action(options, this.progressHandler);
      this.progressHandler.complete(name);
      return { success: true, data: result };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.progressHandler.error(name, err);
      return { success: false, error: err };
    }
  }

  /**
   * Get the progress handler for manual progress updates
   */
  get progress(): ProgressHandler {
    return this.progressHandler;
  }
}

/**
 * Helper to create a command runner
 */
export function createCommandRunner<TOptions, TResult>(
  name: string,
  options: TOptions & CommonOptions
): CommandRunner<TOptions, TResult> {
  return new CommandRunner({
    name,
    options,
    verbose: options.verbose,
    quiet: options.quiet,
  });
}
