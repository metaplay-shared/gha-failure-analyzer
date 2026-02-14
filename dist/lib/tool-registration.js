import * as fs from 'fs';
import * as path from 'path';
import { AIAnalysisSchema, FailureAttributionSchema } from './types.js';
/**
 * Generate Zod code string for the AIAnalysis schema.
 * Uses descriptions from the canonical schema to stay in sync.
 */
function generateZodSchemaCode() {
    // Extract descriptions from canonical schemas
    const s = AIAnalysisSchema.shape;
    const a = FailureAttributionSchema.shape;
    return `{
    summary: z.array(z.string()).length(3)
      .describe(${JSON.stringify(s.summary.description)}),
    attribution: z.object({
      commit: z.string().describe(${JSON.stringify(a.commit.description)}),
      author: z.string().describe(${JSON.stringify(a.author.description)}),
      message: z.string().optional().describe(${JSON.stringify(a.message.description)}),
    }).optional().describe(${JSON.stringify(s.attribution.description)}),
    details: z.string()
      .describe(${JSON.stringify(s.details.description)}),
    confidence: z.enum(["high", "medium", "low"]).optional()
      .describe(${JSON.stringify(s.confidence.description)}),
    is_flaky: z.boolean().optional()
      .describe(${JSON.stringify(s.is_flaky.description)}),
  }`;
}
/**
 * Write a tool definition file to .opencode/tool/
 * OpenCode will pick this up on startup and make it available to the AI
 */
export function registerAnalysisTool(workingDir) {
    const toolDir = path.join(workingDir, '.opencode', 'tool');
    fs.mkdirSync(toolDir, { recursive: true });
    const toolPath = path.join(toolDir, 'report_analysis.ts');
    const argsCode = generateZodSchemaCode();
    const toolCode = `import { z } from "zod";

export default {
  description: "Report the CI failure analysis results. You MUST call this tool with your structured analysis after completing your investigation.",
  args: ${argsCode},
  async execute(args) {
    return JSON.stringify(args, null, 2);
  },
};
`;
    fs.writeFileSync(toolPath, toolCode);
    return toolPath;
}
/**
 * Remove the tool definition file after analysis is complete
 */
export function cleanupAnalysisTool(workingDir) {
    const toolPath = path.join(workingDir, '.opencode', 'tool', 'report_analysis.ts');
    if (fs.existsSync(toolPath)) {
        fs.unlinkSync(toolPath);
    }
}
//# sourceMappingURL=tool-registration.js.map