import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorkflowRun, WorkflowJob } from './types.js';

const STORAGE_DIR = '.ci-analyzer';

/**
 * Stored workflow data structure
 */
export interface StoredWorkflowData {
  fetchedAt: string;
  repository: string;
  run: WorkflowRun;
  jobs: WorkflowJob[];
  annotations: Array<{
    jobName: string;
    path: string;
    startLine: number;
    endLine: number;
    annotationLevel: string;
    message: string;
    title: string;
  }>;
}

/**
 * Get the storage directory path
 * @param baseDir - Base directory for storage (defaults to INIT_CWD or cwd)
 */
function getStorageDir(baseDir?: string): string {
  const base = baseDir ?? process.env.INIT_CWD ?? process.cwd();
  return path.resolve(base, STORAGE_DIR);
}

/**
 * Get the run directory path for a specific workflow run
 */
function getRunDir(runId: number, baseDir?: string): string {
  return path.join(getStorageDir(baseDir), String(runId));
}

/**
 * Convert a string to a safe filename (alphanumeric and dashes only)
 */
function toSafeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, '-')     // Replace any non-alphanumeric with dash
    .replace(/^-+|-+$/g, '')            // Trim leading/trailing dashes
    .replace(/-+/g, '-')                // Collapse multiple dashes
    .toLowerCase();
}

/**
 * Ensure the storage directory exists
 */
async function ensureStorageDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Write workflow summary to disk
 * @param baseDir - Base directory for storage (defaults to INIT_CWD or cwd)
 */
export async function writeWorkflowSummary(
  repo: string,
  runId: number,
  data: {
    run: WorkflowRun;
    jobs: WorkflowJob[];
    annotations: Array<{
      jobName: string;
      path: string;
      startLine: number;
      endLine: number;
      annotationLevel: string;
      message: string;
      title: string;
    }>;
  },
  baseDir?: string
): Promise<string> {
  const runDir = getRunDir(runId, baseDir);
  await ensureStorageDir(runDir);

  const storedData: StoredWorkflowData = {
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
export async function writeJobLogs(
  runId: number,
  jobLogs: Map<string, string>,
  baseDir?: string
): Promise<string[]> {
  const runDir = getRunDir(runId, baseDir);
  const logsDir = path.join(runDir, 'logs');
  await ensureStorageDir(logsDir);

  const writtenPaths: string[] = [];

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
export async function readWorkflowSummary(
  runId: number
): Promise<StoredWorkflowData | null> {
  const runDir = getRunDir(runId);
  const summaryPath = path.join(runDir, 'summary.json');

  try {
    const content = await fs.readFile(summaryPath, 'utf-8');
    return JSON.parse(content) as StoredWorkflowData;
  } catch {
    return null;
  }
}

/**
 * Read stored job logs from disk
 * Returns a map of safe filenames to their log content
 */
export async function readJobLogs(
  runId: number
): Promise<Map<string, string>> {
  const runDir = getRunDir(runId);
  const logsDir = path.join(runDir, 'logs');
  const jobLogs = new Map<string, string>();

  try {
    const files = await fs.readdir(logsDir);

    for (const file of files) {
      if (file.endsWith('.log')) {
        const jobName = file.replace('.log', '');
        const content = await fs.readFile(path.join(logsDir, file), 'utf-8');
        jobLogs.set(jobName, content);
      }
    }
  } catch {
    // Logs directory doesn't exist
  }

  return jobLogs;
}

/**
 * List all stored workflow runs
 */
export async function listStoredRuns(): Promise<Array<{ repo: string; runId: number; fetchedAt: string }>> {
  const storageDir = getStorageDir();
  const results: Array<{ repo: string; runId: number; fetchedAt: string }> = [];

  try {
    const runDirs = await fs.readdir(storageDir);

    for (const runDir of runDirs) {
      const runId = parseInt(runDir, 10);
      if (isNaN(runId)) continue;

      const runPath = path.join(storageDir, runDir);
      const stat = await fs.stat(runPath);
      if (!stat.isDirectory()) continue;

      const summary = await readWorkflowSummary(runId);
      if (summary) {
        results.push({
          repo: summary.repository,
          runId,
          fetchedAt: summary.fetchedAt,
        });
      }
    }
  } catch {
    // Storage directory doesn't exist yet
  }

  return results;
}

/**
 * Get the storage path for a workflow run
 * @param baseDir - Base directory for storage (defaults to INIT_CWD or cwd)
 */
export function getStoragePath(runId: number, baseDir?: string): string {
  return getRunDir(runId, baseDir);
}

/**
 * Check if workflow data is already stored
 */
export async function isWorkflowStored(runId: number): Promise<boolean> {
  const summary = await readWorkflowSummary(runId);
  return summary !== null;
}
