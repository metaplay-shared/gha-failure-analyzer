import { Command } from 'commander';

/**
 * Interface for command modules
 */
export interface CommandModule<TOptions = unknown, TResult = unknown> {
  register: (program: Command) => void;
  action: (options: TOptions) => Promise<TResult>;
}

/**
 * Common options available to all commands
 */
export interface CommonOptions {
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * Progress event types
 */
export type ProgressEventType = 'start' | 'progress' | 'complete' | 'error';

/**
 * Progress event data
 */
export interface ProgressEvent {
  type: ProgressEventType;
  stage: string;
  message: string;
  current?: number;
  total?: number;
  error?: Error;
}

/**
 * Command execution result
 */
export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
}
