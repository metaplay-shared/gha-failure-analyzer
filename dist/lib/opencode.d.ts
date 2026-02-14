export interface ModelConfig {
    providerID: string;
    modelID: string;
}
/**
 * Create an OpenCode client with standard configuration.
 * Temporarily changes cwd to workingDir so watcher ignores resolve correctly.
 * @param verbose - If true, prints detailed startup messages
 */
export declare function createOpencodeClient(workingDir?: string, verbose?: boolean): Promise<{
    model: ModelConfig;
    client: import("@opencode-ai/sdk").OpencodeClient;
    server: {
        url: string;
        close(): void;
    };
}>;
export interface ToolCallResult {
    tool: string;
    input: Record<string, unknown>;
    output: string;
}
export interface StreamResult {
    responseText: string;
    completed: boolean;
    toolCalls: ToolCallResult[];
    /** Whether any AI activity occurred (thinking, text response, or tool calls) */
    hadActivity: boolean;
}
export interface StreamOptions {
    verbose?: boolean;
    /** Called when soft timeout is reached - should send urgent prompt and return true to continue processing */
    onSoftTimeout?: () => Promise<boolean>;
    /** Soft timeout in milliseconds - triggers onSoftTimeout callback */
    softTimeoutMs?: number;
}
/**
 * Process an OpenCode event stream with consistent output formatting.
 * Displays [thinking], [tool] info, and streams text responses.
 */
export declare function processEventStream(eventStream: {
    stream: AsyncIterable<{
        type: string;
        properties: unknown;
    }>;
}, options?: StreamOptions): Promise<StreamResult>;
//# sourceMappingURL=opencode.d.ts.map