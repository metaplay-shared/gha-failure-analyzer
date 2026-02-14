/**
 * Format a date string in a human-friendly way
 */
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
    });
}
/**
 * Format duration between two dates
 */
function formatDuration(startStr, endStr) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffMs = end.getTime() - start.getTime();
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    else {
        return `${seconds}s`;
    }
}
/**
 * Get status icon for conclusion
 */
function getStatusIcon(conclusion) {
    switch (conclusion) {
        case 'success':
            return '[PASS]';
        case 'failure':
            return '[FAIL]';
        case 'cancelled':
            return '[SKIP]';
        case 'skipped':
            return '[SKIP]';
        default:
            return '[----]';
    }
}
/**
 * Pretty-print workflow summary to a human-friendly string
 */
export function formatWorkflowSummary(data) {
    const lines = [];
    const { run, jobs, annotations } = data;
    // Header
    lines.push('='.repeat(70));
    lines.push(`WORKFLOW RUN SUMMARY`);
    lines.push('='.repeat(70));
    lines.push('');
    // Run info
    lines.push(`Repository:  ${data.repository}`);
    lines.push(`Workflow:    ${run.workflowName}`);
    lines.push(`Branch:      ${run.branch}`);
    lines.push(`Run ID:      ${run.id}`);
    lines.push(`Status:      ${run.conclusion?.toUpperCase() || 'UNKNOWN'}`);
    lines.push(`Started:     ${formatDate(run.createdAt)}`);
    lines.push(`Finished:    ${formatDate(run.updatedAt)}`);
    lines.push(`Duration:    ${formatDuration(run.createdAt, run.updatedAt)}`);
    lines.push(`URL:         ${run.url}`);
    lines.push('');
    // Jobs summary
    lines.push('-'.repeat(70));
    lines.push('JOBS');
    lines.push('-'.repeat(70));
    for (const job of jobs) {
        const icon = getStatusIcon(job.conclusion);
        lines.push(`${icon} ${job.name}`);
        // Show steps for failed jobs
        if (job.conclusion === 'failure' && job.steps.length > 0) {
            for (const step of job.steps) {
                const stepIcon = getStatusIcon(step.conclusion);
                lines.push(`       ${stepIcon} ${step.number}. ${step.name}`);
            }
        }
    }
    lines.push('');
    return lines.join('\n');
}
//# sourceMappingURL=formatter.js.map