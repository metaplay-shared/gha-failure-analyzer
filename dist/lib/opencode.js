import { createOpencode } from '@opencode-ai/sdk';
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
/**
 * Parse model specification from env var.
 * Format: "provider/model" (e.g., "opencode/glm-4.7-free" or "zai-coding-plan/glm-4.7")
 */
function parseModelSpec() {
    const modelSpec = process.env.OPENCODE_MODEL || 'opencode/glm-4.7-free';
    if (modelSpec.includes('/')) {
        const slashIndex = modelSpec.indexOf('/');
        return {
            providerID: modelSpec.slice(0, slashIndex),
            modelID: modelSpec.slice(slashIndex + 1),
        };
    }
    // Legacy: bare model name defaults to opencode provider
    return {
        providerID: 'opencode',
        modelID: modelSpec,
    };
}
/**
 * Create an OpenCode client with standard configuration.
 * Temporarily changes cwd to workingDir so watcher ignores resolve correctly.
 * Prints model configuration and server status.
 */
export async function createOpencodeClient(workingDir) {
    // Parse and display config first
    const model = parseModelSpec();
    console.log(`Model: ${model.providerID}/${model.modelID}`);
    if (workingDir) {
        console.log(`Path: ${workingDir}`);
    }
    console.log('');
    process.stdout.write('Starting server... ');
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
        console.log('done');
        return { ...result, model };
    }
    finally {
        if (workingDir) {
            process.chdir(originalCwd);
        }
    }
}
/**
 * Format tool usage info for display
 */
function formatToolInfo(tool, input) {
    if (!tool || !input)
        return '';
    // Try common property names
    const filePath = input.filePath ?? input.file_path ?? input.path ?? input.file;
    const pattern = input.pattern ?? input.query;
    const command = input.command ?? input.cmd;
    switch (tool) {
        case 'read':
        case 'write':
        case 'edit':
            if (filePath)
                return String(filePath);
            break;
        case 'grep':
        case 'glob':
            if (pattern) {
                const dir = input.path ?? input.directory ?? input.dir;
                return `"${pattern}"${dir ? ` in ${dir}` : ''}`;
            }
            break;
        case 'bash':
            if (command)
                return String(command);
            break;
    }
    // Fallback: show first string value found
    for (const [key, val] of Object.entries(input)) {
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
/**
 * Process an OpenCode event stream with consistent output formatting.
 * Displays [thinking], [tool] info, and streams text responses.
 */
export async function processEventStream(eventStream, options = {}) {
    const { verbose = false, timeoutMs = 30 * 60 * 1000 } = options;
    const log = verbose ? console.log.bind(console) : () => { };
    let responseText = '';
    let currentMode = '';
    let needsNewline = false; // Track if we need a newline before next output
    const shownTools = new Set();
    const activeSubtasks = new Set(); // Track active subagent IDs
    const toolCalls = []; // Track completed tool calls
    const startTime = Date.now();
    for await (const event of eventStream.stream) {
        const eventType = event.type;
        if (Date.now() - startTime > timeoutMs) {
            console.log('\nTimeout waiting for response.');
            return { responseText, completed: false, toolCalls };
        }
        if (eventType === 'server.heartbeat')
            continue;
        // Handle session errors - always print these
        if (eventType === 'session.error') {
            const props = event.properties;
            console.error(`\n[SESSION ERROR]`);
            console.error(JSON.stringify(props, null, 2));
        }
        // Verbose logging with relevant properties
        if (verbose) {
            const props = event.properties;
            let info = '';
            if (eventType === 'session.status' && props.status) {
                const status = props.status.type;
                if (status)
                    info = ` status=${status}`;
            }
            else if (eventType === 'message.updated' && props.message) {
                const m = props.message;
                if (m.role)
                    info = ` role=${m.role}`;
                const text = m.content || m.text;
                if (text)
                    info += `\n    "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`;
            }
            else if (eventType === 'session.diff' && props.diff) {
                const d = props.diff;
                if (d.type)
                    info = ` type=${d.type}`;
                if (d.content)
                    info += `\n    "${d.content.slice(0, 100)}${d.content.length > 100 ? '...' : ''}"`;
            }
            log(`[verbose] Event: ${eventType}${info}`);
        }
        if (event.type === 'message.part.updated') {
            const props = event.properties;
            const part = props.part;
            // Concise part logging
            if (verbose) {
                let partInfo = `type=${part.type}`;
                if (part.tool)
                    partInfo += ` tool=${part.tool}`;
                if (part.state?.status)
                    partInfo += ` state=${part.state.status}`;
                const text = props.delta || part.text;
                if (text) {
                    const preview = text.slice(0, 100).replace(/\n/g, '\\n');
                    partInfo += ` "${preview}${text.length > 100 ? '...' : ''}"`;
                }
                log(`[verbose] Part: ${partInfo}`);
            }
            if (part.type === 'reasoning') {
                if (currentMode !== 'thinking') {
                    if (needsNewline) {
                        process.stdout.write('\n');
                        needsNewline = false;
                    }
                    console.log('[thinking]');
                    currentMode = 'thinking';
                }
            }
            else if (part.type === 'text' && props.delta) {
                if (currentMode !== 'text') {
                    if (needsNewline) {
                        process.stdout.write('\n');
                        needsNewline = false;
                    }
                    process.stdout.write('[response] ');
                }
                currentMode = 'text';
                process.stdout.write(props.delta);
                responseText += props.delta;
                // Track if we need a newline before next non-text output
                needsNewline = !props.delta.endsWith('\n');
            }
            else if (part.type === 'text' && part.text) {
                responseText = part.text;
            }
            else if (part.type === 'tool' && part.tool) {
                const partId = part.id;
                // Input is in state.input, not part.input
                const stateInput = part.state?.input;
                const hasInput = stateInput && Object.keys(stateInput).length > 0;
                const status = part.state?.status;
                // Handle 'task' tool specially - it spawns subagents
                if (part.tool === 'task') {
                    if (hasInput && partId) {
                        if (status === 'running' || status === 'pending' || !status) {
                            // Task started
                            if (!activeSubtasks.has(partId)) {
                                activeSubtasks.add(partId);
                                if (needsNewline) {
                                    process.stdout.write('\n');
                                    needsNewline = false;
                                }
                                const description = stateInput?.description || stateInput?.prompt?.slice(0, 60) || 'Task';
                                console.log(`[subagent] ${description}`);
                                if (verbose) {
                                    log(`[verbose] Task input keys: ${Object.keys(stateInput).join(', ')}`);
                                }
                            }
                        }
                        else if (status === 'completed' || status === 'error') {
                            // Task ended
                            if (activeSubtasks.has(partId)) {
                                activeSubtasks.delete(partId);
                                console.log(`[/subagent]`);
                            }
                        }
                    }
                    currentMode = 'tool';
                }
                else {
                    // Regular tool - show when we have input, dedupe by part ID
                    if (hasInput && partId && !shownTools.has(partId)) {
                        shownTools.add(partId);
                        if (needsNewline) {
                            process.stdout.write('\n');
                            needsNewline = false;
                        }
                        const toolInfo = formatToolInfo(part.tool, stateInput);
                        console.log(`[${part.tool}]${toolInfo ? ' ' + toolInfo : ''}`);
                        // Debug: show all input keys in verbose mode
                        if (verbose && stateInput) {
                            log(`[verbose] Tool input keys: ${Object.keys(stateInput).join(', ')}`);
                        }
                        currentMode = 'tool';
                    }
                    // Capture completed tool call outputs
                    if (status === 'completed' && stateInput) {
                        const stateOutput = part.state?.output;
                        if (stateOutput) {
                            toolCalls.push({
                                tool: part.tool,
                                input: stateInput,
                                output: stateOutput,
                            });
                            if (verbose) {
                                log(`[verbose] Tool completed: ${part.tool} output length=${stateOutput.length}`);
                            }
                        }
                    }
                }
            }
        }
        // Check for completion
        if (eventType === 'session.idle' ||
            (eventType === 'session.status' &&
                event.properties.status?.type === 'idle')) {
            if (needsNewline) {
                process.stdout.write('\n');
                needsNewline = false;
            }
            console.log('Complete.');
            return { responseText, completed: true, toolCalls };
        }
    }
    return { responseText, completed: false, toolCalls };
}
//# sourceMappingURL=opencode.js.map