/**
 * Format analysis result as GitHub Actions job summary markdown.
 */
export function formatJobSummary(result) {
    const lines = [
        '# Workflow Failure Analysis',
        '',
        '| Property | Value |',
        '|----------|-------|',
        `| Repository | ${result.repository} |`,
        `| Workflow | ${result.workflowName} |`,
        `| Run ID | [${result.runId}](https://github.com/${result.repository}/actions/runs/${result.runId}) |`,
        `| Status | ${result.status} |`,
        '',
    ];
    if (result.failures.length > 0) {
        lines.push('## Failed Steps', '');
        for (const failure of result.failures) {
            lines.push(`- **${failure.job}** → ${failure.step}`);
        }
        lines.push('');
    }
    if (result.analysis) {
        lines.push('## AI Analysis', '');
        // Summary is an array of 3 bullet points
        for (const bullet of result.analysis.summary) {
            lines.push(`- ${bullet}`);
        }
        lines.push('');
        if (result.analysis.details) {
            lines.push('## Details', '', result.analysis.details, '');
        }
        if (result.analysis.attribution) {
            lines.push('## Attribution', '', `Likely introduced by commit \`${result.analysis.attribution.commit}\` by @${result.analysis.attribution.author}`, '');
        }
        if (result.analysis.confidence) {
            lines.push(`> **Confidence:** ${result.analysis.confidence}`, '');
        }
        if (result.analysis.is_flaky) {
            lines.push('> **Note:** This appears to be a flaky test', '');
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=summary-formatter.js.map