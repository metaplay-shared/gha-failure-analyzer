/**
 * Format the initial "Analyzing..." message
 */
export function formatAnalyzingBlocks(run, repo) {
    const blocks = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: ':hourglass_flowing_sand: Analyzing CI Failure...',
                emoji: true,
            },
        },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*Workflow:*\n${run.workflowName}` },
                { type: 'mrkdwn', text: `*Branch:*\n\`${run.branch}\`` },
                { type: 'mrkdwn', text: `*Status:*\n:x: ${run.conclusion?.toUpperCase() || 'FAILED'}` },
                { type: 'mrkdwn', text: `*Repository:*\n${repo}` },
            ],
        },
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: { type: 'plain_text', text: 'View Logs', emoji: true },
                    url: run.url,
                    action_id: 'view_logs',
                },
            ],
        },
        {
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `:robot_face: AI analysis in progress...`,
                },
            ],
        },
    ];
    return {
        blocks,
        text: `Analyzing CI failure in ${repo}: ${run.workflowName} on ${run.branch}`,
    };
}
/**
 * Format the completed analysis message (replaces initial message)
 */
export function formatCompletedBlocks(result) {
    const analysis = result.analysis;
    const hasAnalysis = analysis !== null;
    const blocks = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: ':x: CI Failure Analysis',
                emoji: true,
            },
        },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*Workflow:*\n${result.workflowName}` },
                { type: 'mrkdwn', text: `*Repository:*\n${result.repository}` },
            ],
        },
        { type: 'divider' },
    ];
    // Add summary bullets
    if (hasAnalysis && analysis.summary.length > 0) {
        const summaryText = analysis.summary.map((s) => `• ${s}`).join('\n');
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Summary:*\n${summaryText}`,
            },
        });
    }
    else {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: '*Summary:*\n_Analysis could not determine the root cause._',
            },
        });
    }
    // Add attribution if present
    if (hasAnalysis && analysis.attribution) {
        const { commit, author, message } = analysis.attribution;
        const shortCommit = commit.slice(0, 7);
        const commitMsg = message ? `: "${message}"` : '';
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `:bust_in_silhouette: *Attribution:* \`${shortCommit}\` by @${author}${commitMsg}`,
                },
            ],
        });
    }
    // Add confidence and flaky badges
    if (hasAnalysis) {
        const badges = [];
        if (analysis.confidence) {
            const confidenceEmoji = analysis.confidence === 'high'
                ? ':large_green_circle:'
                : analysis.confidence === 'medium'
                    ? ':large_yellow_circle:'
                    : ':large_orange_circle:';
            badges.push(`${confidenceEmoji} Confidence: *${analysis.confidence}*`);
        }
        if (analysis.is_flaky) {
            badges.push(':warning: *Flaky test detected*');
        }
        if (badges.length > 0) {
            blocks.push({
                type: 'context',
                elements: [{ type: 'mrkdwn', text: badges.join('  |  ') }],
            });
        }
    }
    // Add view details hint
    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: ':thread: _See thread for full analysis details_',
            },
        ],
    });
    return {
        blocks,
        text: `CI Failure Analysis: ${result.workflowName} - ${analysis?.summary[0] || 'Analysis complete'}`,
    };
}
/**
 * Format the thread reply with full analysis details
 */
export function formatDetailsBlocks(result) {
    const analysis = result.analysis;
    const blocks = [];
    blocks.push({
        type: 'header',
        text: {
            type: 'plain_text',
            text: ':mag: Full Analysis Details',
            emoji: true,
        },
    });
    if (analysis?.details) {
        // Slack has a 3000 char limit per section, so we may need to split
        const details = analysis.details;
        const maxLength = 2900;
        if (details.length <= maxLength) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: details,
                },
            });
        }
        else {
            // Split into chunks
            let remaining = details;
            while (remaining.length > 0) {
                const chunk = remaining.slice(0, maxLength);
                const lastNewline = chunk.lastIndexOf('\n');
                const splitAt = lastNewline > maxLength / 2 ? lastNewline : maxLength;
                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: remaining.slice(0, splitAt),
                    },
                });
                remaining = remaining.slice(splitAt).trim();
            }
        }
    }
    else {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: '_No detailed analysis available._',
            },
        });
    }
    // Add metadata footer
    blocks.push({ type: 'divider' }, {
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: `:clock1: Analyzed at ${result.analyzedAt} | Run ID: ${result.runId}`,
            },
        ],
    });
    return {
        blocks,
        text: `Full analysis details for ${result.workflowName}`,
    };
}
/**
 * Format message for stdout fallback (when Slack not configured)
 */
export function formatStdoutStarted(run, repo) {
    const line = '='.repeat(70);
    return `
${line}
[SLACK] Analysis Started
${line}
Workflow:   ${run.workflowName}
Branch:     ${run.branch}
Status:     ${run.conclusion?.toUpperCase() || 'FAILED'}
Repository: ${repo}
URL:        ${run.url}
${line}
`.trim();
}
/**
 * Format completed analysis for stdout fallback
 */
export function formatStdoutCompleted(result) {
    const line = '='.repeat(70);
    const analysis = result.analysis;
    let output = `
${line}
[SLACK] Analysis Complete
${line}
`;
    if (analysis) {
        output += `Summary:\n`;
        for (const bullet of analysis.summary) {
            output += `  • ${bullet}\n`;
        }
        output += '\n';
        if (analysis.attribution) {
            const { commit, author, message } = analysis.attribution;
            output += `Attribution: ${commit.slice(0, 7)} by @${author}`;
            if (message)
                output += ` ("${message}")`;
            output += '\n';
        }
        if (analysis.confidence) {
            output += `Confidence: ${analysis.confidence}`;
            if (analysis.is_flaky)
                output += ' | Flaky: yes';
            output += '\n';
        }
    }
    else {
        output += 'Analysis could not determine the root cause.\n';
    }
    output += line;
    return output.trim();
}
/**
 * Format details for stdout fallback (thread reply simulation)
 */
export function formatStdoutDetails(result) {
    const line = '-'.repeat(70);
    const analysis = result.analysis;
    let output = `
${line}
[SLACK THREAD] Full Analysis Details
${line}
`;
    if (analysis?.details) {
        output += analysis.details;
    }
    else {
        output += 'No detailed analysis available.';
    }
    output += `\n${line}`;
    output += `\nAnalyzed at: ${result.analyzedAt} | Run ID: ${result.runId}`;
    return output.trim();
}
//# sourceMappingURL=slack-formatter.js.map