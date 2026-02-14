import { z } from 'zod';
/**
 * Attribution for a failure (commit/author that likely caused it)
 */
export const FailureAttributionSchema = z.object({
    commit: z.string().describe('Git commit SHA that introduced the issue'),
    author: z.string().describe('GitHub username of the commit author'),
    message: z.string().optional().describe('Commit message'),
});
/**
 * AI-generated analysis of a CI failure
 */
export const AIAnalysisSchema = z.object({
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
/**
 * Generate a JSON schema description for prompts from the AIAnalysisSchema.
 * This extracts the descriptions from Zod and formats them for LLM consumption.
 */
export function getAIAnalysisSchemaDescription() {
    const schema = {
        type: 'object',
        required: ['summary', 'details'],
        properties: {
            summary: {
                type: 'array',
                items: { type: 'string' },
                minItems: 3,
                maxItems: 3,
                description: AIAnalysisSchema.shape.summary.description,
            },
            attribution: {
                type: 'object',
                description: AIAnalysisSchema.shape.attribution.description,
                properties: {
                    commit: {
                        type: 'string',
                        description: FailureAttributionSchema.shape.commit.description,
                    },
                    author: {
                        type: 'string',
                        description: FailureAttributionSchema.shape.author.description,
                    },
                    message: {
                        type: 'string',
                        description: FailureAttributionSchema.shape.message.description,
                    },
                },
                required: ['commit', 'author'],
            },
            details: {
                type: 'string',
                description: AIAnalysisSchema.shape.details.description,
            },
            confidence: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: AIAnalysisSchema.shape.confidence.description,
            },
            is_flaky: {
                type: 'boolean',
                description: AIAnalysisSchema.shape.is_flaky.description,
            },
        },
    };
    return JSON.stringify(schema, null, 2);
}
//# sourceMappingURL=types.js.map