import { InvalidArgumentError } from 'commander';
/**
 * Validate that a value is a positive integer
 */
export function validatePositiveInt(value) {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
        throw new InvalidArgumentError('Must be a positive integer');
    }
    return parsed;
}
/**
 * Validate that a value is a valid GitHub repository (owner/repo format)
 */
export function validateRepository(value) {
    const pattern = /^[\w.-]+\/[\w.-]+$/;
    if (!pattern.test(value)) {
        throw new InvalidArgumentError('Must be in owner/repo format');
    }
    return value;
}
/**
 * Validate that a value is a valid workflow run ID
 */
export function validateRunId(value) {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
        throw new InvalidArgumentError('Must be a valid run ID');
    }
    return parsed;
}
/**
 * Validate output format
 */
export function validateOutputFormat(value) {
    const validFormats = ['json', 'text', 'markdown'];
    if (!validFormats.includes(value.toLowerCase())) {
        throw new InvalidArgumentError(`Must be one of: ${validFormats.join(', ')}`);
    }
    return value.toLowerCase();
}
/**
 * Parse a GitHub Actions run URL
 * Format: https://github.com/{owner}/{repo}/actions/runs/{runId}
 */
export function parseRunUrl(url) {
    const pattern = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/;
    const match = url.match(pattern);
    if (!match) {
        throw new InvalidArgumentError('Invalid GitHub Actions URL. Expected format: https://github.com/{owner}/{repo}/actions/runs/{runId}');
    }
    const [, owner, repo, runIdStr] = match;
    const runId = parseInt(runIdStr, 10);
    return { owner, repo, runId };
}
/**
 * Validate a GitHub Actions run URL
 */
export function validateRunUrl(value) {
    // Just validate, return the original string
    parseRunUrl(value);
    return value;
}
//# sourceMappingURL=validators.js.map