import * as http from 'http';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { AIAnalysisSchema, FailureAttributionSchema, type AIAnalysis } from './types.js';

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
 * Start an HTTP server for an McpServer instance.
 * Returns the server infrastructure for cleanup.
 */
async function startMcpHttpServer(
  mcpServer: McpServer,
  onClose: () => void
): Promise<{ port: number; url: string; close: () => Promise<void> }> {
  // Map to store transports by session ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Create a simple HTTP server to handle MCP requests
  const server = http.createServer(async (req, res) => {

    // Set CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, last-event-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Only handle /mcp endpoint
    if (!req.url?.startsWith('/mcp')) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      if (req.method === 'POST') {
        // Parse request body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());

        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
          // Reuse existing transport
          transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(body)) {
          // New initialization request
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              transports[sid] = transport;
            },
          });

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              delete transports[sid];
            }
          };

          // Connect transport to MCP server
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, body);
          return;
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
              id: null,
            })
          );
          return;
        }

        await transport.handleRequest(req, res, body);
      } else if (req.method === 'GET') {
        // SSE stream for notifications
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400);
          res.end('Invalid or missing session ID');
          return;
        }
        await transports[sessionId].handleRequest(req, res);
      } else if (req.method === 'DELETE') {
        // Session termination
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400);
          res.end('Invalid or missing session ID');
          return;
        }
        await transports[sessionId].handleRequest(req, res);
      } else {
        res.writeHead(405);
        res.end('Method Not Allowed');
      }
    } catch (error) {
      console.error('MCP server error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          })
        );
      }
    }
  });

  // Start server on random port
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server address');
  }

  const port = address.port;
  const url = `http://127.0.0.1:${port}/mcp`;

  // Cleanup function
  const close = async () => {
    // Close all transports
    for (const sessionId of Object.keys(transports)) {
      try {
        await transports[sessionId].close();
      } catch {
        // Ignore cleanup errors
      }
    }

    // Close HTTP server
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    // Call the onClose callback
    onClose();
  };

  return { port, url, close };
}

/**
 * Create and start an in-process MCP server with the report_analysis tool.
 * This server runs on a random port and captures tool inputs directly in memory.
 */
export async function createAnalysisToolServer(): Promise<AnalysisToolResult> {
  // Create a deferred promise to capture the analysis result
  let resolveResult: (value: AIAnalysis) => void;
  let rejectResult: (reason: Error) => void;
  const resultPromise = new Promise<AIAnalysis>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  // Create the MCP server with tools capability
  const mcpServer = new McpServer(
    { name: 'analysis-tool-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Register the analysis tool with Zod schemas matching AIAnalysisSchema
  mcpServer.registerTool(
    'report_analysis',
    {
      description:
        'Report the CI failure analysis results. You MUST call this tool with your structured analysis after completing your investigation.',
      inputSchema: {
        summary: z
          .array(z.string())
          .length(3)
          .describe(AIAnalysisSchema.shape.summary.description!),
        attribution: z
          .object({
            commit: z.string().describe(FailureAttributionSchema.shape.commit.description!),
            author: z.string().describe(FailureAttributionSchema.shape.author.description!),
            message: z.string().optional().describe(FailureAttributionSchema.shape.message.description!),
          })
          .optional()
          .describe(AIAnalysisSchema.shape.attribution.description!),
        details: z.string().describe(AIAnalysisSchema.shape.details.description!),
        confidence: z
          .enum(['high', 'medium', 'low'])
          .optional()
          .describe(AIAnalysisSchema.shape.confidence.description!),
        is_flaky: z.boolean().optional().describe(AIAnalysisSchema.shape.is_flaky.description!),
      },
    },
    async (args) => {
      // Validate and capture the analysis result
      const parsed = AIAnalysisSchema.safeParse(args);
      if (parsed.success) {
        resolveResult(parsed.data);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(parsed.data, null, 2) }],
        };
      } else {
        const errorMsg = `Invalid analysis format: ${parsed.error.message}`;
        return {
          content: [{ type: 'text' as const, text: errorMsg }],
          isError: true,
        };
      }
    }
  );

  // Start the HTTP server
  const { port, url, close } = await startMcpHttpServer(mcpServer, () => {
    rejectResult(new Error('Analysis tool server closed before receiving result'));
  });

  return { port, url, resultPromise, close };
}

/**
 * Create and start an in-process MCP server with the report_summaries tool.
 * This is a simpler tool for testing MCP integration with document summaries.
 */
export async function createSummaryToolServer(): Promise<SummaryToolResult> {
  // Create a deferred promise to capture the summaries
  let resolveResult: (value: DocumentSummary[]) => void;
  let rejectResult: (reason: Error) => void;
  const resultPromise = new Promise<DocumentSummary[]>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  // Schema for document summaries
  const DocumentSummarySchema = z.object({
    filename: z.string().describe('Name of the file'),
    summary: z.string().describe('One-sentence summary of the document'),
  });
  const SummariesSchema = z.array(DocumentSummarySchema);

  // Create the MCP server with tools capability
  const mcpServer = new McpServer(
    { name: 'summary-tool-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Register the summaries tool
  mcpServer.registerTool(
    'report_summaries',
    {
      description:
        'Report the summaries of all documents you analyzed. You MUST call this tool with your results after summarizing all markdown files.',
      inputSchema: {
        summaries: z
          .array(
            z.object({
              filename: z.string().describe('Name of the markdown file'),
              summary: z.string().describe('One-sentence summary of the document content'),
            })
          )
          .describe('Array of document summaries'),
      },
    },
    async (args) => {
      const input = args as { summaries: DocumentSummary[] };
      const parsed = SummariesSchema.safeParse(input.summaries);
      if (parsed.success) {
        resolveResult(parsed.data);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Received ${parsed.data.length} summaries:\n${parsed.data.map((s) => `- ${s.filename}: ${s.summary}`).join('\n')}`,
            },
          ],
        };
      } else {
        const errorMsg = `Invalid summaries format: ${parsed.error.message}`;
        return {
          content: [{ type: 'text' as const, text: errorMsg }],
          isError: true,
        };
      }
    }
  );

  // Start the HTTP server
  const { port, url, close } = await startMcpHttpServer(mcpServer, () => {
    rejectResult(new Error('Summary tool server closed before receiving result'));
  });

  return { port, url, resultPromise, close };
}
