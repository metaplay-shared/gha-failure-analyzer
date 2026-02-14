import { createCommandRunner } from '../cli/command-runner.js';
import { validateOutputFormat, parseRunUrl } from '../cli/validators.js';
import { analyzeWorkflowRun } from '../lib/analyzer.js';
/**
 * Register the analyze command
 */
export function register(program) {
    program
        .command('analyze <url>')
        .description('Analyze a failed GitHub Actions workflow run')
        .option('-o, --output <format>', 'Output format (json, text, markdown)', validateOutputFormat, 'text')
        .option('-p, --repo-path <path>', 'Local path to the cloned repository (defaults to cwd)')
        .option('-v, --verbose', 'Show detailed progress')
        .option('-q, --quiet', 'Suppress output except errors')
        .action(async (url, options) => {
        await action(url, options);
    });
}
/**
 * Execute the analyze command
 */
export async function action(url, options) {
    const runner = createCommandRunner('analyze', options);
    const result = await runner.run(async (opts, progress) => {
        // Parse the URL to extract owner, repo, and runId
        const { owner, repo, runId } = parseRunUrl(url);
        const repoFullName = `${owner}/${repo}`;
        progress.update('analyze', `Analyzing workflow run ${runId} for ${repoFullName}`);
        const analysis = await analyzeWorkflowRun({
            repo: repoFullName,
            runId,
            repoPath: opts.repoPath, // Let analyzer.ts use INIT_CWD as default
            verbose: opts.verbose,
        });
        // Format and display output
        await formatOutput(analysis, opts.output ?? 'text');
        return analysis;
    });
    if (!result.success) {
        process.exit(1);
    }
    return result.data;
}
/**
 * Format and display the analysis result
 */
async function formatOutput(result, format) {
    switch (format) {
        case 'json':
            console.log(JSON.stringify(result, null, 2));
            break;
        case 'markdown':
            console.log(formatMarkdown(result));
            break;
        case 'text':
        default:
            console.log(await formatText(result));
            break;
    }
}
async function formatText(result) {
    // Only show AI analysis results (workflow summary already printed before analysis)
    const lines = [];
    lines.push('='.repeat(70));
    lines.push('AI ANALYSIS');
    lines.push('='.repeat(70));
    lines.push('');
    const analysis = result.analysis;
    if (analysis) {
        // Summary bullets
        if (analysis.summary.length > 0) {
            lines.push('Summary:');
            for (const bullet of analysis.summary) {
                lines.push(`  - ${bullet}`);
            }
            lines.push('');
        }
        // Attribution
        if (analysis.attribution) {
            const attr = analysis.attribution;
            lines.push(`Likely caused by: ${attr.commit.slice(0, 7)} by ${attr.author}`);
            if (attr.message) {
                lines.push(`  "${attr.message}"`);
            }
            lines.push('');
        }
        // Metadata
        const meta = [];
        if (analysis.confidence) {
            meta.push(`Confidence: ${analysis.confidence}`);
        }
        if (analysis.is_flaky) {
            meta.push('Appears to be flaky');
        }
        if (meta.length > 0) {
            lines.push(meta.join(' | '));
            lines.push('');
        }
        // Details
        if (analysis.details) {
            lines.push('-'.repeat(70));
            lines.push('Details:');
            lines.push('-'.repeat(70));
            lines.push(analysis.details);
            lines.push('');
        }
    }
    else {
        lines.push('No AI analysis available.');
        lines.push('');
    }
    lines.push('='.repeat(70));
    return lines.join('\n');
}
function formatMarkdown(result) {
    const lines = [
        `# Analysis Results`,
        '',
        `**Repository:** ${result.repository}`,
        `**Run ID:** ${result.runId}`,
        `**Status:** ${result.status}`,
        `**Workflow:** ${result.workflowName}`,
        '',
    ];
    if (result.failures.length > 0) {
        lines.push('## Failures', '');
        for (const failure of result.failures) {
            lines.push(`- **${failure.step}:** ${failure.message}`);
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
            lines.push(`> **Likely caused by:** \`${attr.commit.slice(0, 7)}\` by ${attr.author}`);
            if (attr.message) {
                lines.push(`> *"${attr.message}"*`);
            }
            lines.push('');
        }
        // Metadata badges
        const badges = [];
        if (analysis.confidence) {
            badges.push(`**Confidence:** ${analysis.confidence}`);
        }
        if (analysis.is_flaky) {
            badges.push('**Flaky:** yes');
        }
        if (badges.length > 0) {
            lines.push(badges.join(' | '), '');
        }
        // Details
        if (analysis.details) {
            lines.push('## Details', '', analysis.details);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=analyze.js.map