import { type AIAnalysis } from './types.js';
/**
 * Generic result from an MCP tool server
 */
export interface McpToolServerResult<T> {
    /** Port the server is listening on */
    port: number;
    /** URL to register with OpenCode */
    url: string;
    /** Promise that resolves when the tool is called */
    resultPromise: Promise<T>;
    /** Close the server and cleanup */
    close: () => Promise<void>;
}
/**
 * Result from the analysis tool server
 */
export type AnalysisToolResult = McpToolServerResult<AIAnalysis>;
/**
 * Document summary entry
 */
export interface DocumentSummary {
    filename: string;
    summary: string;
}
/**
 * Result from the summary tool server
 */
export type SummaryToolResult = McpToolServerResult<DocumentSummary[]>;
/**
 * Create and start an in-process MCP server with the report_analysis tool.
 * This server runs on a random port and captures tool inputs directly in memory.
 */
export declare function createAnalysisToolServer(): Promise<AnalysisToolResult>;
/**
 * Create and start an in-process MCP server with the report_summaries tool.
 * This is a simpler tool for testing MCP integration with document summaries.
 */
export declare function createSummaryToolServer(): Promise<SummaryToolResult>;
//# sourceMappingURL=mcp-tool-server.d.ts.map