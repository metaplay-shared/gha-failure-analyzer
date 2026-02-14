#!/usr/bin/env node
/**
 * MCP server that exposes a report_analysis tool for structured CI failure analysis output.
 * This server is spawned by the analyzer and provides a tool that the AI must call
 * with its analysis results, ensuring structured output.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
// Define the schema inline to avoid import issues when running as a standalone process
const FailureAttributionSchema = z.object({
    commit: z.string().describe('Git commit SHA that introduced the issue'),
    author: z.string().describe('GitHub username of the commit author'),
    message: z.string().optional().describe('Commit message'),
});
const AIAnalysisSchema = z.object({
    summary: z
        .array(z.string())
        .length(3)
        .describe('Exactly 3 concise bullet points: (1) what failed, (2) why it failed, (3) how to fix it'),
    attribution: FailureAttributionSchema.optional().describe('Include ONLY if you can identify a specific commit that caused the issue via git blame/history. Omit entirely if uncertain.'),
    details: z
        .string()
        .describe('Freeform markdown with detailed analysis: error messages, source code excerpts with file paths, git history, suggested fixes'),
    confidence: z
        .enum(['high', 'medium', 'low'])
        .optional()
        .describe('high if root cause is clear, medium if likely but uncertain, low if speculative'),
    is_flaky: z
        .boolean()
        .optional()
        .describe('true only if this appears to be an intermittent/flaky failure (timing issues, network flakiness)'),
});
const server = new McpServer({
    name: 'ci-analyzer',
    version: '1.0.0',
});
// Register the report_analysis tool
server.registerTool('report_analysis', {
    description: `Report the CI failure analysis results. You MUST call this tool with your analysis after investigating the failure.

The tool expects:
- summary: Exactly 3 bullet points (what failed, why, how to fix)
- attribution: Only if you identified a specific commit via git blame (omit if uncertain)
- details: Freeform markdown with error messages, code excerpts, suggested fixes
- confidence: high/medium/low based on certainty of root cause
- is_flaky: true only if this appears to be intermittent`,
    inputSchema: AIAnalysisSchema.shape,
}, async (args) => {
    // Validate the input against the schema
    const result = AIAnalysisSchema.safeParse(args);
    if (!result.success) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Validation error: ${result.error.message}`,
                },
            ],
            isError: true,
        };
    }
    // Return the validated analysis as JSON
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(result.data, null, 2),
            },
        ],
    };
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('CI Analyzer MCP Server running on stdio');
}
main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
//# sourceMappingURL=analysis-server.js.map