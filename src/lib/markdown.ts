import { Marked, type MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';

/**
 * Interface for markdown rendering.
 * Allows swapping implementations or using passthrough for testing/non-TTY.
 */
export interface MarkdownRenderer {
  render(markdown: string): string;
}

/**
 * Terminal renderer using marked + marked-terminal.
 * Converts markdown to ANSI-formatted terminal output.
 */
class TerminalRenderer implements MarkdownRenderer {
  private marked: Marked;

  constructor() {
    // Type assertion needed: @types/marked-terminal is outdated for marked v17
    this.marked = new Marked(markedTerminal() as unknown as MarkedExtension);
  }

  render(markdown: string): string {
    if (!markdown || typeof markdown !== 'string') {
      return '';
    }
    // marked.parse returns string synchronously when async option is not set
    const result = this.marked.parse(markdown) as string;
    // Remove trailing newline that marked-terminal adds
    return result.trimEnd();
  }
}

/**
 * Passthrough renderer that returns markdown as-is.
 * Used for non-TTY output or when rendering is disabled.
 */
class PassthroughRenderer implements MarkdownRenderer {
  render(markdown: string): string {
    if (!markdown || typeof markdown !== 'string') {
      return '';
    }
    return markdown;
  }
}

// Singleton instances
let terminalRenderer: TerminalRenderer | null = null;
let passthroughRenderer: PassthroughRenderer | null = null;

/**
 * Create a terminal markdown renderer.
 * Uses marked + marked-terminal for ANSI formatting.
 */
export function createTerminalRenderer(): MarkdownRenderer {
  if (!terminalRenderer) {
    terminalRenderer = new TerminalRenderer();
  }
  return terminalRenderer;
}

/**
 * Create a passthrough renderer that returns markdown unchanged.
 */
export function createPassthroughRenderer(): MarkdownRenderer {
  if (!passthroughRenderer) {
    passthroughRenderer = new PassthroughRenderer();
  }
  return passthroughRenderer;
}

export interface RendererOptions {
  /** Force raw output without terminal formatting */
  forceRaw?: boolean;
}

/**
 * Get the appropriate renderer based on environment.
 * Returns terminal renderer for TTY, passthrough for piped output.
 */
export function getRenderer(options: RendererOptions = {}): MarkdownRenderer {
  if (options.forceRaw || !process.stdout.isTTY) {
    return createPassthroughRenderer();
  }
  return createTerminalRenderer();
}

/**
 * Convenience function to render markdown with auto-detected renderer.
 */
export function renderMarkdown(markdown: string, options: RendererOptions = {}): string {
  return getRenderer(options).render(markdown);
}
