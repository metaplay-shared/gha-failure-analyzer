// marked-terminal ships no types of its own, and @types/marked-terminal is stale for
// marked v18 (its return type no longer matches MarkedExtension). We only use the
// markedTerminal() factory, whose result is passed straight to `new Marked(...)`, so a
// minimal local declaration typing it as a MarkedExtension is sufficient and accurate.
declare module 'marked-terminal' {
  import type { MarkedExtension } from 'marked';

  export function markedTerminal(
    options?: Record<string, unknown>,
    highlightOptions?: Record<string, unknown>
  ): MarkedExtension;
}
