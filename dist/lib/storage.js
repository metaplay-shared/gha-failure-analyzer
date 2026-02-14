import * as fs from 'fs/promises';
import * as path from 'path';
const STORAGE_DIR = '.ci-analyzer';
/**
 * Get the storage directory path
 * @param baseDir - Base directory for storage (defaults to INIT_CWD or cwd)
 */
function getStorageDir(baseDir) {
    const base = baseDir ?? process.env.INIT_CWD ?? process.cwd();
    return path.resolve(base, STORAGE_DIR);
}
/**
 * Get the run directory path for a specific workflow run
 */
function getRunDir(runId, baseDir) {
    return path.join(getStorageDir(baseDir), String(runId));
}
/**
 * Convert a string to a safe filename (alphanumeric and dashes only)
 */
function toSafeFilename(name) {
    return name
        .replace(/[^a-zA-Z0-9]+/g, '-') // Replace any non-alphanumeric with dash
        .replace(/^-+|-+$/g, '') // Trim leading/trailing dashes
        .replace(/-+/g, '-') // Collapse multiple dashes
        .toLowerCase();
}
/**
 * Ensure the storage directory exists
 */
async function ensureStorageDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}
/**
 * Write workflow summary to disk
 * @param baseDir - Base directory for storage (defaults to INIT_CWD or cwd)
 */
export async function writeWorkflowSummary(repo, runId, data, baseDir) {
    const runDir = getRunDir(runId, baseDir);
    await ensureStorageDir(runDir);
    const storedData = {
        fetchedAt: new Date().toISOString(),
        repository: repo,
        ...data,
    };
    const summaryPath = path.join(runDir, 'summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(storedData, null, 2), 'utf-8');
    return summaryPath;
}
/**
 * Write individual job logs to separate files
 * @param baseDir - Base directory for storage (defaults to INIT_CWD or cwd)
 */
export async function writeJobLogs(runId, jobLogs, baseDir) {
    const runDir = getRunDir(runId, baseDir);
    const logsDir = path.join(runDir, 'logs');
    await ensureStorageDir(logsDir);
    const writtenPaths = [];
    for (const [jobName, logContent] of jobLogs) {
        const safeJobName = toSafeFilename(jobName);
        const logPath = path.join(logsDir, `${safeJobName}.log`);
        await fs.writeFile(logPath, logContent, 'utf-8');
        writtenPaths.push(logPath);
    }
    return writtenPaths;
}
/**
 * Read stored workflow summary from disk
 */
export async function readWorkflowSummary(runId) {
    const runDir = getRunDir(runId);
    const summaryPath = path.join(runDir, 'summary.json');
    try {
        const content = await fs.readFile(summaryPath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * Read stored job logs from disk
 * Returns a map of safe filenames to their log content
 */
export async function readJobLogs(runId) {
    const runDir = getRunDir(runId);
    const logsDir = path.join(runDir, 'logs');
    const jobLogs = new Map();
    try {
        const files = await fs.readdir(logsDir);
        for (const file of files) {
            if (file.endsWith('.log')) {
                const jobName = file.replace('.log', '');
                const content = await fs.readFile(path.join(logsDir, file), 'utf-8');
                jobLogs.set(jobName, content);
            }
        }
    }
    catch {
        // Logs directory doesn't exist
    }
    return jobLogs;
}
/**
 * List all stored workflow runs
 */
export async function listStoredRuns() {
    const storageDir = getStorageDir();
    const results = [];
    try {
        const runDirs = await fs.readdir(storageDir);
        for (const runDir of runDirs) {
            const runId = parseInt(runDir, 10);
            if (isNaN(runId))
                continue;
            const runPath = path.join(storageDir, runDir);
            const stat = await fs.stat(runPath);
            if (!stat.isDirectory())
                continue;
            const summary = await readWorkflowSummary(runId);
            if (summary) {
                results.push({
                    repo: summary.repository,
                    runId,
                    fetchedAt: summary.fetchedAt,
                });
            }
        }
    }
    catch {
        // Storage directory doesn't exist yet
    }
    return results;
}
/**
 * Get the storage path for a workflow run
 * @param baseDir - Base directory for storage (defaults to INIT_CWD or cwd)
 */
export function getStoragePath(runId, baseDir) {
    return getRunDir(runId, baseDir);
}
/**
 * Check if workflow data is already stored
 */
export async function isWorkflowStored(runId) {
    const summary = await readWorkflowSummary(runId);
    return summary !== null;
}
//# sourceMappingURL=storage.js.map