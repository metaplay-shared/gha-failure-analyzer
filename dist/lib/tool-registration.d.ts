/**
 * Write a tool definition file to .opencode/tool/
 * OpenCode will pick this up on startup and make it available to the AI
 */
export declare function registerAnalysisTool(workingDir: string): string;
/**
 * Remove the tool definition file after analysis is complete
 */
export declare function cleanupAnalysisTool(workingDir: string): void;
//# sourceMappingURL=tool-registration.d.ts.map