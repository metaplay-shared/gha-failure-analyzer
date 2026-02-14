import { beforeAll, afterAll, afterEach } from 'vitest';

// Global test setup
beforeAll(() => {
  // Set up test environment variables
  process.env.GITHUB_TOKEN = 'test-token';
});

afterAll(() => {
  // Clean up
});

afterEach(() => {
  // Reset mocks between tests
});
