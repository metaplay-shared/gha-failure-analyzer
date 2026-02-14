/**
 * Check if a path is the Metaplay SDK repo root.
 * Returns null if valid, or an error message if not.
 */
export declare function validateSdkRepoRoot(repoPath: string): string | null;
/**
 * Validate that a value is a positive integer
 */
export declare function validatePositiveInt(value: string): number;
/**
 * Validate that a value is a valid GitHub repository (owner/repo format)
 */
export declare function validateRepository(value: string): string;
/**
 * Validate that a value is a valid workflow run ID
 */
export declare function validateRunId(value: string): number;
/**
 * Parsed GitHub Actions run URL
 */
export interface ParsedRunUrl {
    owner: string;
    repo: string;
    runId: number;
}
/**
 * Parse a GitHub Actions run URL
 * Format: https://github.com/{owner}/{repo}/actions/runs/{runId}
 */
export declare function parseRunUrl(url: string): ParsedRunUrl;
/**
 * Validate a GitHub Actions run URL
 */
export declare function validateRunUrl(value: string): string;
//# sourceMappingURL=validators.d.ts.map