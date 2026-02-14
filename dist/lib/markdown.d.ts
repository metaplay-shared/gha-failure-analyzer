/**
 * Interface for markdown rendering.
 * Allows swapping implementations or using passthrough for testing/non-TTY.
 */
export interface MarkdownRenderer {
    render(markdown: string): string;
}
/**
 * Create a terminal markdown renderer.
 * Uses marked + marked-terminal for ANSI formatting.
 */
export declare function createTerminalRenderer(): MarkdownRenderer;
/**
 * Create a passthrough renderer that returns markdown unchanged.
 */
export declare function createPassthroughRenderer(): MarkdownRenderer;
export interface RendererOptions {
    /** Force raw output without terminal formatting */
    forceRaw?: boolean;
}
/**
 * Get the appropriate renderer based on environment.
 * Returns terminal renderer for TTY, passthrough for piped output.
 */
export declare function getRenderer(options?: RendererOptions): MarkdownRenderer;
/**
 * Convenience function to render markdown with auto-detected renderer.
 */
export declare function renderMarkdown(markdown: string, options?: RendererOptions): string;
//# sourceMappingURL=markdown.d.ts.map