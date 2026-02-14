import type { AnalysisResult } from './types.js';

/**
 * Format analysis result as markdown.
 * Used by both CLI and GitHub Action for consistent output.
 */
export function formatAnalysisMarkdown(result: AnalysisResult): string {
  const lines: string[] = [
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

  const analysis = result.analysis;

  if (analysis) {
    // Summary
    lines.push('## Summary', '');
    for (const bullet of analysis.summary) {
      lines.push(`- ${bullet}`);
    }
    lines.push('');

    // Attribution
    if (analysis.attribution) {
      const attr = analysis.attribution;
      lines.push(
        '## Attribution',
        '',
        `Likely introduced by commit \`${attr.commit.slice(0, 7)}\` by @${attr.author}`
      );
      if (attr.message) {
        lines.push(`> *"${attr.message}"*`);
      }
      lines.push('');
    }

    // Metadata
    const meta: string[] = [];
    if (analysis.confidence) {
      meta.push(`**Confidence:** ${analysis.confidence}`);
    }
    if (analysis.is_flaky) {
      meta.push('**Flaky:** yes');
    }
    if (meta.length > 0) {
      lines.push(meta.join(' | '), '');
    }

    // Details
    if (analysis.details) {
      lines.push('## Details', '', analysis.details, '');
    }
  }

  return lines.join('\n');
}
