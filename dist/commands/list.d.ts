import { Command } from 'commander';
import type { WorkflowRun } from '../lib/types.js';
export interface ListOptions {
    repo: string;
    limit?: number;
    workflow?: string;
    verbose?: boolean;
    quiet?: boolean;
}
/**
 * Register the list command
 */
export declare function register(program: Command): void;
/**
 * Execute the list command
 */
export declare function action(options: ListOptions): Promise<WorkflowRun[] | undefined>;
//# sourceMappingURL=list.d.ts.map