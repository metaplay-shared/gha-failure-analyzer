import { createOpencode } from '@opencode-ai/sdk';
import { renderMarkdown } from './markdown.js';

/**
 * Directories to ignore when watching for file changes.
 * These are typically large generated/cached directories that slow down indexing.
 */
const WATCHER_IGNORE = [
  // Version control
  '.git/**',
  // JavaScript/Node
  'node_modules/**',
  '**/node_modules/**',
  '.pnpm-store/**',
  'dist/**',
  '.next/**',
  // C#/.NET
  '**/bin/**',
  '**/obj/**',
  // IDEs
  '.vs/**',
  '.idea/**',
  // Python
  '.venv/**',
  '__pycache__/**',
  // Rust
  'target/**',
  // Unity
  '**/Library/**',
  '**/Temp/**',
  '**/Logs/**',
  '**/Builds/**',
  // Build tools
  '.moon/cache/**',
];

export interface ModelConfig {
  providerID: string;
  modelID: string;
}

/**
 * Parse model specification from OPENCODE_MODEL env var.
 * Format: "provider/model" (e.g., "zai-coding-plan/glm-5" or "openai/gpt-5.4")
 */
function parseModelSpec(): ModelConfig {
  const modelSpec = process.env.OPENCODE_MODEL;

  if (!modelSpec) {
    throw new Error(
      `OPENCODE_MODEL environment variable is required but not set.\n` +
      `Set it to a "provider/model" string. Examples:\n` +
      `  OPENCODE_MODEL=zai-coding-plan/coding-glm-5-free    (free)\n` +
      `  OPENCODE_MODEL=zai-coding-plan/glm-5\n` +
      `  OPENCODE_MODEL=openai/gpt-5.4\n` +
      `  OPENCODE_MODEL=google/gemini-3.1-pro\n` +
      `See https://models.dev for all available models.`
    );
  }

  if (!modelSpec.includes('/')) {
    throw new Error(`Invalid model specification: "${modelSpec}". Must be in format "{providerID}/{modelID}" (e.g., "zai-coding-plan/glm-5" or "openai/gpt-5.4"). See https://models.dev for available models.`);
  }

  const slashIndex = modelSpec.indexOf('/');
  return {
    providerID: modelSpec.slice(0, slashIndex),
    modelID: modelSpec.slice(slashIndex + 1),
  };
}

/**
 * Create an OpenCode client with standard configuration.
 * Temporarily changes cwd to workingDir so watcher ignores resolve correctly.
 * @param verbose - If true, prints detailed startup messages
 */
export async function createOpencodeClient(workingDir?: string, verbose = false) {
  const log = verbose ? console.log.bind(console) : () => {};

  // Parse model config
  const model = parseModelSpec();
  log(`[verbose] Model: ${model.providerID}/${model.modelID}`);
  if (workingDir) {
    log(`[verbose] Path: ${workingDir}`);
  }

  log('[verbose] Starting server...');

  const originalCwd = process.cwd();
  if (workingDir) {
    process.chdir(workingDir);
  }

  try {
    const result = await createOpencode({
      port: 0, // Random available port
      config: {
        model: `${model.providerID}/${model.modelID}`,
        watcher: {
          ignore: WATCHER_IGNORE,
        },
        permission: {
          edit: 'deny',
          // TODO: To safely enable web fetching, create a custom MCP tool with domain allowlist
          // (e.g., github.com, stackoverflow.com, docs.microsoft.com) to prevent data exfiltration
          webfetch: 'deny',
          bash: {
            // Read-only git commands
            'git status': 'allow',
            'git log': 'allow',
            'git diff': 'allow',
            'git show': 'allow',
            'git blame': 'allow',
            'git branch': 'allow',
            'git rev-parse': 'allow',
            'git describe': 'allow',
            'git ls-files': 'allow',
            'git ls-tree': 'allow',
            'git remote': 'allow',
            'git tag': 'allow',
            'git config --get': 'allow',
            // Read-only gh commands
            'gh pr view': 'allow',
            'gh pr list': 'allow',
            'gh issue view': 'allow',
            'gh issue list': 'allow',
            'gh run view': 'allow',
            'gh run list': 'allow',
            'gh api': 'allow',
            // Common read-only utilities
            'cat': 'allow',
            'head': 'allow',
            'tail': 'allow',
            'grep': 'allow',
            'ls': 'allow',
            'find': 'allow',
            // Text processing
            'wc': 'allow',
            'sort': 'allow',
            'uniq': 'allow',
            'cut': 'allow',
            'jq': 'allow',
            'diff': 'allow',
            // Package managers - npm/pnpm/yarn
            'npm list': 'allow',
            'npm ls': 'allow',
            'npm outdated': 'allow',
            'npm view': 'allow',
            'pnpm list': 'allow',
            'pnpm ls': 'allow',
            'pnpm outdated': 'allow',
            'yarn list': 'allow',
            'yarn info': 'allow',
            // Package managers - pip
            'pip list': 'allow',
            'pip show': 'allow',
            'pip freeze': 'allow',
            // Package managers - Go
            'go list': 'allow',
            'go mod graph': 'allow',
            'go mod why': 'allow',
            'go version': 'allow',
            // Package managers - .NET
            'dotnet list': 'allow',
            'dotnet --list-sdks': 'allow',
            'dotnet --list-runtimes': 'allow',
            'dotnet --info': 'allow',
            'dotnet nuget list': 'allow',
          },
        },
      },
    });
    log('[verbose] Server started');
    return { ...result, model };
  } finally {
    if (workingDir) {
      process.chdir(originalCwd);
    }
  }
}

/**
 * Manages console output for streaming analysis events.
 * Encapsulates formatting concerns like newlines and continuation prefixes.
 */
class AnalysisLogger {
  private currentMode: 'idle' | 'thinking' | 'tool' = 'idle';
  private needsNewline = false;
  private thinkingNeedsContinuation = false;
  private verbose: boolean;
  private log: (...args: unknown[]) => void;

  constructor(verbose: boolean) {
    this.verbose = verbose;
    this.log = verbose ? console.log.bind(console) : () => {};
  }

  /** Ensure we're on a fresh line before output */
  private ensureNewline(): void {
    if (this.needsNewline) {
      process.stdout.write('\n');
      this.needsNewline = false;
    }
  }

  /** Start thinking mode and print header */
  startThinking(): void {
    if (this.currentMode !== 'thinking') {
      this.ensureNewline();
      process.stdout.write('[thinking] ');
      this.currentMode = 'thinking';
      this.thinkingNeedsContinuation = false;
      this.needsNewline = false;
    }
  }

  /** Write thinking content with proper continuation prefixes */
  writeThinking(delta: string): void {
    const prefix = this.thinkingNeedsContinuation ? ' | ' : '';
    const formatted = delta.replace(/\n(?!$)/g, '\n | ');
    process.stdout.write(prefix + formatted);
    this.thinkingNeedsContinuation = delta.endsWith('\n');
    this.needsNewline = !delta.endsWith('\n');
  }

  /** Write a tool usage line */
  writeTool(name: string, info: string): void {
    this.ensureNewline();
    console.log(`[tool:${name}]${info ? ' ' + info : ''}`);
    this.currentMode = 'tool';
  }

  /** Write verbose tool input keys */
  writeToolInputKeys(keys: string[]): void {
    if (this.verbose) {
      this.log(`[verbose] Tool input keys: ${keys.join(', ')}`);
    }
  }

  /** Write subagent start */
  writeSubagentStart(description: string): void {
    this.ensureNewline();
    console.log(`[subagent] ${description}`);
    this.currentMode = 'tool';
  }

  /** Write subagent end */
  writeSubagentEnd(): void {
    console.log(`[/subagent]`);
  }

  /** Write verbose task input keys */
  writeTaskInputKeys(keys: string[]): void {
    if (this.verbose) {
      this.log(`[verbose] Task input keys: ${keys.join(', ')}`);
    }
  }

  /** Write verbose tool completion */
  writeToolCompleted(tool: string, outputLength: number): void {
    if (this.verbose) {
      this.log(`[verbose] Tool completed: ${tool} output length=${outputLength}`);
    }
  }

  /** Write timeout message */
  writeTimeout(): void {
    this.ensureNewline();
    console.log('[timeout] Soft timeout reached, sending urgent emit prompt');
  }

  /** Write session error */
  writeError(props: unknown): void {
    console.error(`\n[SESSION ERROR]`);
    console.error(JSON.stringify(props, null, 2));
  }

  /** Write verbose event info */
  writeVerboseEvent(eventType: string, info: string): void {
    this.log(`[verbose] Event: ${eventType}${info}`);
  }

  /** Write verbose part info */
  writeVerbosePart(partInfo: string): void {
    this.log(`[verbose] Part: ${partInfo}`);
  }

  /** Finish output and render final response */
  finish(responseText: string): void {
    this.ensureNewline();
    console.log('[ai] Finished');
    if (responseText) {
      console.log('');
      console.log('[response]');
      console.log(renderMarkdown(responseText));
    }
  }
}

/**
 * Normalize tool name for display.
 * Converts internal names like 'analysis-tool_report_analysis' to 'report-analysis'.
 */
function normalizeToolName(tool: string): string {
  if (tool === 'analysis-tool_report_analysis' || tool === 'report_analysis') {
    return 'report-analysis';
  }
  return tool;
}

/**
 * Format tool usage info for display
 */
function formatToolInfo(tool: string | undefined, input: Record<string, unknown> | undefined): string {
  if (!tool || !input) return '';

  // Try common property names
  const filePath = input.filePath ?? input.file_path ?? input.path ?? input.file;
  const pattern = input.pattern ?? input.query;
  const command = input.command ?? input.cmd;

  switch (tool) {
    case 'read':
    case 'write':
    case 'edit':
      if (filePath) return String(filePath);
      break;
    case 'grep':
    case 'glob':
      if (pattern) {
        const dir = input.path ?? input.directory ?? input.dir;
        return `"${pattern}"${dir ? ` in ${dir}` : ''}`;
      }
      break;
    case 'bash':
      if (command) return String(command);
      break;
    case 'report_analysis':
    case 'analysis-tool_report_analysis':
      // Don't print the long analysis content
      return '';
  }

  // Fallback: show first string value found
  for (const val of Object.values(input)) {
    if (typeof val === 'string' && val.length > 0) {
      return val;
    }
  }

  // Last resort: show keys so we know what's available
  const keys = Object.keys(input);
  if (keys.length > 0) {
    return `{${keys.join(', ')}}`;
  }

  return '';
}

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

/** Type for message part event properties */
interface PartEventProps {
  part: {
    type: string;
    id?: string;
    text?: string;
    tool?: string;
    input?: Record<string, unknown>;
    state?: {
      status: string;
      input?: Record<string, unknown>;
      output?: string;
    };
    description?: string;
  };
  delta?: string;
}

/** State tracked during event stream processing */
interface StreamState {
  responseText: string;
  toolCalls: ToolCallResult[];
  hadActivity: boolean;
  shownTools: Set<string>;
  activeSubtasks: Set<string>;
  currentMessageRole: string;
}

/**
 * Handle a message.part.updated event.
 * Updates state and logs output via the AnalysisLogger.
 */
function handlePartUpdated(
  props: PartEventProps,
  writer: AnalysisLogger,
  state: StreamState,
  verbose: boolean
): void {
  const { part, delta } = props;

  // Verbose part logging
  if (verbose) {
    let partInfo = `type=${part.type}`;
    if (part.tool) partInfo += ` tool=${part.tool}`;
    if (part.state?.status) partInfo += ` state=${part.state.status}`;
    const text = delta || part.text;
    if (text) {
      const preview = text.slice(0, 100).replace(/\n/g, '\\n');
      partInfo += ` "${preview}${text.length > 100 ? '...' : ''}"`;
    }
    writer.writeVerbosePart(partInfo);
  }

  const isAssistantMessage = state.currentMessageRole === 'assistant';

  // Reasoning events are always from the assistant - don't require role check
  if (part.type === 'reasoning') {
    state.hadActivity = true;
    const text = delta || part.text;
    if (text) {
      writer.startThinking();
      writer.writeThinking(text);
    }
    return;
  }

  // Text content
  if (part.type === 'text' && isAssistantMessage) {
    state.hadActivity = true;
    if (delta) {
      state.responseText += delta;
    } else if (part.text) {
      state.responseText = part.text;
    }
    return;
  }

  // Tool usage
  if (part.type === 'tool' && part.tool) {
    const partId = part.id;
    const stateInput = part.state?.input as Record<string, unknown> | undefined;
    const hasInput = stateInput && Object.keys(stateInput).length > 0;
    const status = part.state?.status;

    // Handle 'task' tool specially - it spawns subagents
    if (part.tool === 'task') {
      state.hadActivity = true;
      if (hasInput && partId) {
        if (status === 'running' || status === 'pending' || !status) {
          // Task started
          if (!state.activeSubtasks.has(partId)) {
            state.activeSubtasks.add(partId);
            const description = (stateInput?.description as string) || (stateInput?.prompt as string)?.slice(0, 60) || 'Task';
            writer.writeSubagentStart(description);
            writer.writeTaskInputKeys(Object.keys(stateInput));
          }
        } else if (status === 'completed' || status === 'error') {
          // Task ended
          if (state.activeSubtasks.has(partId)) {
            state.activeSubtasks.delete(partId);
            writer.writeSubagentEnd();
          }
        }
      }
      return;
    }

    // Regular tool - show when we have input, dedupe by part ID
    if (hasInput && partId && !state.shownTools.has(partId)) {
      state.hadActivity = true;
      state.shownTools.add(partId);
      const toolInfo = formatToolInfo(part.tool, stateInput);
      writer.writeTool(normalizeToolName(part.tool), toolInfo);
      writer.writeToolInputKeys(Object.keys(stateInput));
    }

    // Capture completed tool call outputs
    if (status === 'completed' && stateInput) {
      const stateOutput = part.state?.output;
      if (stateOutput) {
        state.toolCalls.push({
          tool: part.tool,
          input: stateInput,
          output: stateOutput,
        });
        writer.writeToolCompleted(part.tool, stateOutput.length);
      }
    }
  }
}

/**
 * Build verbose event info string for logging.
 */
function getVerboseEventInfo(eventType: string, props: Record<string, unknown>): string {
  if (eventType === 'session.status' && props.status) {
    const status = (props.status as { type?: string }).type;
    if (status) return ` status=${status}`;
  } else if (eventType === 'message.updated' && props.message) {
    const m = props.message as { id?: string; role?: string; content?: string; text?: string };
    let info = '';
    if (m.role) info = ` role=${m.role}`;
    const text = m.content || m.text;
    if (text) info += `\n    "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`;
    return info;
  } else if (eventType === 'session.diff' && props.diff) {
    const d = props.diff as { type?: string; content?: string };
    let info = '';
    if (d.type) info = ` type=${d.type}`;
    if (d.content) info += `\n    "${d.content.slice(0, 100)}${d.content.length > 100 ? '...' : ''}"`;
    return info;
  }
  return '';
}

/**
 * Check if an event indicates session is idle.
 */
function isIdleEvent(eventType: string, properties: unknown): boolean {
  if (eventType === 'session.idle') return true;
  if (eventType === 'session.status') {
    const props = properties as { status?: { type: string } };
    return props.status?.type === 'idle';
  }
  return false;
}

/**
 * Process an OpenCode event stream with consistent output formatting.
 * Displays [thinking], [tool] info, and streams text responses.
 */
export async function processEventStream(
  eventStream: { stream: AsyncIterable<{ type: string; properties: unknown }> },
  options: StreamOptions = {}
): Promise<StreamResult> {
  const { verbose = false, onSoftTimeout, softTimeoutMs } = options;

  const writer = new AnalysisLogger(verbose);
  const state: StreamState = {
    responseText: '',
    toolCalls: [],
    hadActivity: false,
    shownTools: new Set<string>(),
    activeSubtasks: new Set<string>(),
    currentMessageRole: '',
  };

  const startTime = Date.now();
  let softTimeoutTriggered = false;

  for await (const event of eventStream.stream) {
    const eventType = event.type as string;
    const props = event.properties as Record<string, unknown>;

    // Check soft timeout (if configured) - external process handles hard timeout
    if (!softTimeoutTriggered && softTimeoutMs && onSoftTimeout) {
      const elapsedMs = Date.now() - startTime;
      if (elapsedMs > softTimeoutMs) {
        softTimeoutTriggered = true;
        writer.writeTimeout();
        const shouldContinue = await onSoftTimeout();
        if (!shouldContinue) {
          return { responseText: state.responseText, completed: false, toolCalls: state.toolCalls, hadActivity: state.hadActivity };
        }
      }
    }

    // Skip heartbeats
    if (eventType === 'server.heartbeat') continue;

    // Handle session errors
    if (eventType === 'session.error') {
      writer.writeError(props);
    }

    // Track message role from message.updated events
    if (eventType === 'message.updated') {
      const message = props.message as { role?: string } | undefined;
      if (message?.role) {
        state.currentMessageRole = message.role;
      }
    }

    // Verbose logging
    if (verbose) {
      const info = getVerboseEventInfo(eventType, props);
      writer.writeVerboseEvent(eventType, info);
    }

    // Handle part updates
    if (eventType === 'message.part.updated') {
      handlePartUpdated(props as unknown as PartEventProps, writer, state, verbose);
    }

    // Check for completion
    if (isIdleEvent(eventType, props)) {
      writer.finish(state.responseText);
      return { responseText: state.responseText, completed: true, toolCalls: state.toolCalls, hadActivity: state.hadActivity };
    }
  }

  return { responseText: state.responseText, completed: false, toolCalls: state.toolCalls, hadActivity: state.hadActivity };
}
