import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processEventStream } from '../../lib/opencode.js';

/** Build a fake opencode event stream from a fixed list of events. */
function fakeStream(events: Array<{ type: string; properties: unknown }>) {
  return {
    stream: (async function* () {
      for (const e of events) {
        yield e;
      }
    })(),
  };
}

describe('processEventStream structured-output capture', () => {
  // processEventStream logs progress to the console; silence it so test output stays clean.
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures a completed StructuredOutput tool call by its input, even with empty output', async () => {
    // opencode's StructuredOutput tool carries the analysis in its INPUT; output is just a
    // (possibly empty) confirmation. Capture must not be gated on output being truthy.
    const analysis = { summary: ['a', 'b', 'c'], details: 'x', confidence: 'high' };
    const result = await processEventStream(
      fakeStream([
        { type: 'message.updated', properties: { info: { role: 'assistant' } } },
        {
          type: 'message.part.updated',
          properties: {
            part: {
              type: 'tool',
              id: 'p1',
              tool: 'StructuredOutput',
              state: { status: 'completed', input: analysis, output: '' },
            },
          },
        },
        { type: 'session.idle', properties: {} },
      ]),
      {}
    );

    const captured = result.toolCalls.find((tc) => tc.tool === 'StructuredOutput');
    expect(captured).toBeDefined();
    expect(captured?.input).toEqual(analysis);
    expect(result.hadActivity).toBe(true);
    expect(result.completed).toBe(true);
  });

  it('reports no activity when the stream yields only idle (e.g. missing API key)', async () => {
    // The missing-credentials guard keys off hadActivity, so a no-output run must report false.
    const result = await processEventStream(
      fakeStream([{ type: 'session.idle', properties: {} }]),
      {}
    );
    expect(result.hadActivity).toBe(false);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.completed).toBe(true);
  });
});
