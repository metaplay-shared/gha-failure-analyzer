import { Command } from 'commander';
import type { AnalysisResult } from '../lib/types.js';
export interface AnalyzeOptions {
    raw?: boolean;
    verbose?: boolean;
    quiet?: boolean;
    timeout?: number;
}
/**
 * Register the analyze command
 */
export declare function register(program: Command): void;
/**
 * Execute the analyze command
 */
export declare function action(url: string, options: AnalyzeOptions): Promise<AnalysisResult | undefined>;
//# sourceMappingURL=analyze.d.ts.map