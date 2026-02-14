import { describe, it, expect } from 'vitest';
import {
  validatePositiveInt,
  validateRepository,
  validateRunId,
  parseRunUrl,
  validateRunUrl,
} from '../../cli/validators.js';

describe('validators', () => {
  describe('validatePositiveInt', () => {
    it('should accept positive integers', () => {
      expect(validatePositiveInt('10')).toBe(10);
      expect(validatePositiveInt('1')).toBe(1);
    });

    it('should reject zero', () => {
      expect(() => validatePositiveInt('0')).toThrow('Must be a positive integer');
    });

    it('should reject negative numbers', () => {
      expect(() => validatePositiveInt('-5')).toThrow('Must be a positive integer');
    });

    it('should reject non-numeric strings', () => {
      expect(() => validatePositiveInt('abc')).toThrow('Must be a positive integer');
    });
  });

  describe('validateRepository', () => {
    it('should accept valid owner/repo format', () => {
      expect(validateRepository('octocat/hello-world')).toBe('octocat/hello-world');
      expect(validateRepository('my-org/my.repo')).toBe('my-org/my.repo');
    });

    it('should reject invalid formats', () => {
      expect(() => validateRepository('invalid')).toThrow('Must be in owner/repo format');
      expect(() => validateRepository('too/many/slashes')).toThrow('Must be in owner/repo format');
    });
  });

  describe('validateRunId', () => {
    it('should accept valid run IDs', () => {
      expect(validateRunId('12345')).toBe(12345);
    });

    it('should reject invalid run IDs', () => {
      expect(() => validateRunId('abc')).toThrow('Must be a valid run ID');
      expect(() => validateRunId('0')).toThrow('Must be a valid run ID');
    });
  });

  describe('parseRunUrl', () => {
    it('should parse valid GitHub Actions run URLs', () => {
      const result = parseRunUrl('https://github.com/metaplay/sdk/actions/runs/20904046569');
      expect(result).toEqual({
        owner: 'metaplay',
        repo: 'sdk',
        runId: 20904046569,
      });
    });

    it('should parse URLs with job suffix', () => {
      const result = parseRunUrl('https://github.com/owner/repo/actions/runs/123456/job/789');
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        runId: 123456,
      });
    });

    it('should handle http URLs', () => {
      const result = parseRunUrl('http://github.com/owner/repo/actions/runs/12345');
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        runId: 12345,
      });
    });

    it('should reject invalid URLs', () => {
      expect(() => parseRunUrl('https://github.com/owner/repo')).toThrow('Invalid GitHub Actions URL');
      expect(() => parseRunUrl('https://gitlab.com/owner/repo/actions/runs/123')).toThrow('Invalid GitHub Actions URL');
      expect(() => parseRunUrl('not-a-url')).toThrow('Invalid GitHub Actions URL');
    });
  });

  describe('validateRunUrl', () => {
    it('should return the URL if valid', () => {
      const url = 'https://github.com/metaplay/sdk/actions/runs/20904046569';
      expect(validateRunUrl(url)).toBe(url);
    });

    it('should throw for invalid URLs', () => {
      expect(() => validateRunUrl('invalid')).toThrow('Invalid GitHub Actions URL');
    });
  });
});
