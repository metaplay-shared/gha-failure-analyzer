import { describe, it, expect } from 'vitest';
import { AIAnalysisSchema, getAIAnalysisJsonSchema, type AnalysisResult } from '../../lib/types.js';
import { formatAnalysisMarkdown } from '../../lib/output-formatter.js';

describe('analyzer structured-output contract', () => {
  // The summary schema accepts 1-5 bullets (prefer 3) so a near-miss (2 or 4 bullets) is
  // accepted instead of silently rejected.
  describe('summary schema bounds', () => {
    const withSummary = (n: number) => ({
      summary: Array.from({ length: n }, (_, i) => `bullet ${i}`),
      details: 'details',
    });

    it.each([1, 2, 3, 4, 5])('accepts a %i-bullet summary', (n) => {
      expect(AIAnalysisSchema.safeParse(withSummary(n)).success).toBe(true);
    });

    it.each([0, 6])('rejects a %i-bullet summary', (n) => {
      expect(AIAnalysisSchema.safeParse(withSummary(n)).success).toBe(false);
    });
  });

  // getAIAnalysisJsonSchema() is the contract handed to opencode's `format: json_schema`
  // (exposed as the built-in StructuredOutput tool). It must stay derived from AIAnalysisSchema.
  describe('getAIAnalysisJsonSchema', () => {
    const schema = getAIAnalysisJsonSchema();

    it('produces a draft-07 object schema', () => {
      expect(schema.type).toBe('object');
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    });

    it('requires summary and details, and declares all analysis properties', () => {
      expect(schema.required).toEqual(expect.arrayContaining(['summary', 'details']));
      const properties = schema.properties as Record<string, unknown>;
      for (const key of ['summary', 'attribution', 'details', 'confidence', 'is_flaky']) {
        expect(properties).toHaveProperty(key);
      }
    });

    it('describes a StructuredOutput payload that AIAnalysisSchema accepts round-trip', () => {
      // A payload shaped per the JSON schema (what the model emits via StructuredOutput) must
      // validate against the Zod schema we re-check it with after extraction.
      const payload = {
        summary: ['botclient failed to bind port 8585', 'port already held by the server', 'use distinct ports'],
        details: '## Root cause\nPort collision between server and botclient.',
        confidence: 'high' as const,
        is_flaky: false,
      };
      expect(AIAnalysisSchema.safeParse(payload).success).toBe(true);
    });
  });

  // A null analysis must be surfaced loudly in the job summary instead of rendering an empty
  // report that looks like success.
  describe('null-analysis observability', () => {
    const nullResult: AnalysisResult = {
      repository: 'metaplay/sdk',
      runId: 27985552037,
      workflowName: 'Run Idler Integration tests for develop',
      status: 'failure',
      failures: [{ job: 'tests', step: 'Run integration tests', message: 'failed' }],
      analysis: null,
      analyzedAt: '2026-06-23T00:00:00Z',
    };

    it('renders an "Analysis Unavailable" section explaining the missing result', () => {
      const markdown = formatAnalysisMarkdown(nullResult);
      expect(markdown).toContain('## Analysis Unavailable');
      expect(markdown).toContain('structured analysis');
    });
  });
});
