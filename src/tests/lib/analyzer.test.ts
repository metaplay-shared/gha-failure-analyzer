import { describe, it, expect } from 'vitest';
import { synthesizeAnalysisFromText } from '../../lib/analyzer.js';
import { AIAnalysisSchema, type AnalysisResult } from '../../lib/types.js';
import { formatAnalysisMarkdown } from '../../lib/output-formatter.js';

describe('analyzer recovery and schema changes', () => {
  // Change D: summary schema was relaxed from exactly-3 to 1-5 bullets so that a
  // near-miss tool call (2 or 4 bullets) is accepted instead of silently rejected.
  describe('relaxed summary schema (change D)', () => {
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

  // Change B: when the model never calls the tool but produced prose, synthesize a
  // usable analysis from that prose instead of discarding it (returning null).
  describe('prose synthesis fallback (change B)', () => {
    const prose = [
      '# Root cause',
      'The botclient crashed on boot.',
      '- Port 8585 was already bound',
      '- No graceful fallback for EADDRINUSE',
      'Fix: tolerate the bind error.',
    ].join('\n');

    it('produces a schema-valid analysis from freeform prose', () => {
      const result = synthesizeAnalysisFromText(prose);
      expect(AIAnalysisSchema.safeParse(result).success).toBe(true);
    });

    it('preserves the full prose in details and marks low confidence', () => {
      const result = synthesizeAnalysisFromText(prose);
      expect(result.details).toContain('The botclient crashed on boot.');
      expect(result.confidence).toBe('low');
    });

    it('derives 1-3 summary bullets with markdown markers stripped', () => {
      const result = synthesizeAnalysisFromText(prose);
      expect(result.summary.length).toBeGreaterThanOrEqual(1);
      expect(result.summary.length).toBeLessThanOrEqual(3);
      for (const bullet of result.summary) {
        expect(bullet).not.toMatch(/^[\s>#*\-+\d.)]/);
      }
    });

    it('still yields a non-empty summary when prose is blank', () => {
      const result = synthesizeAnalysisFromText('   \n  \n');
      expect(result.summary).toHaveLength(1);
      expect(result.summary[0].length).toBeGreaterThan(0);
      expect(AIAnalysisSchema.safeParse(result).success).toBe(true);
    });
  });

  // Change E: a null analysis must be surfaced loudly in the job summary instead of
  // rendering an empty report that looks like success.
  describe('null-analysis observability (change E)', () => {
    const nullResult: AnalysisResult = {
      repository: 'metaplay/sdk',
      runId: 27985552037,
      workflowName: 'Run Idler Integration tests for develop',
      status: 'failure',
      failures: [{ job: 'tests', step: 'Run integration tests', message: 'failed' }],
      analysis: null,
      analyzedAt: '2026-06-23T00:00:00Z',
    };

    it('renders an "Analysis Unavailable" section explaining the missing tool call', () => {
      const markdown = formatAnalysisMarkdown(nullResult);
      expect(markdown).toContain('## Analysis Unavailable');
      expect(markdown).toContain('report_analysis');
    });
  });
});
