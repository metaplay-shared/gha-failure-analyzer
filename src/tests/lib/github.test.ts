import { describe, it, expect, vi } from 'vitest';
import { parseRepository, getGitHubToken } from '../../lib/github.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => { throw new Error('gh not available'); }),
}));

describe('github', () => {
  describe('parseRepository', () => {
    it('should parse owner/repo format', () => {
      const result = parseRepository('octocat/hello-world');
      expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
    });

    it('should handle dots in repo name', () => {
      const result = parseRepository('owner/repo.name');
      expect(result).toEqual({ owner: 'owner', repo: 'repo.name' });
    });
  });

  describe('getGitHubToken', () => {
    it('should return token from environment', () => {
      const token = getGitHubToken();
      expect(token).toBe('test-token');
    });

    it('should throw if token not set and gh CLI unavailable', () => {
      const originalToken = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;

      expect(() => getGitHubToken()).toThrow('GITHUB_TOKEN environment variable is required');

      process.env.GITHUB_TOKEN = originalToken;
    });

    it('should fall back to gh auth token when env var not set', async () => {
      const originalToken = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;

      const { execFileSync } = await import('node:child_process');
      vi.mocked(execFileSync).mockReturnValueOnce('gh-cli-token\n');

      expect(getGitHubToken()).toBe('gh-cli-token');

      process.env.GITHUB_TOKEN = originalToken;
    });
  });
});
