# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev <command>      # Run CLI in development (e.g., pnpm dev analyze <url>)
pnpm build              # Compile TypeScript to dist/
pnpm build:action       # Bundle GitHub Action with ncc to action-dist/
pnpm test               # Run all tests
pnpm test -- src/tests/cli/validators.test.ts  # Run a single test file
pnpm test:coverage      # Run tests with coverage report
pnpm lint               # Run ESLint
```

## Architecture

CLI and GitHub Action for analyzing failed GitHub Actions workflow runs using the OpenCode SDK.

**Dual-mode operation:**
- **CLI mode**: Standalone command-line tool (`src/main.ts` entry)
- **Action mode**: GitHub Action triggered on workflow failures (`src/action/index.ts` entry)

**Entry flows:**
- CLI: `main.ts` → `cli.ts` (Commander setup) → `commands/*.ts`
- Action: `action/index.ts` → `lib/analyzer.ts` → job summary output

**Key layers:**
- `src/commands/` - CLI command implementations (analyze, list)
- `src/lib/` - Business logic (github.ts for GitHub API, analyzer.ts for OpenCode SDK integration, storage.ts for local caching)
- `src/cli/` - CLI infrastructure (command-runner, progress-handler, validators)
- `src/action/` - GitHub Action entry point and summary formatter

**Commands:**
- `analyze <url>` - Analyze a workflow run from GitHub Actions URL (e.g., `https://github.com/owner/repo/actions/runs/123`)
- `list -r <owner/repo>` - List failed workflow runs for a repository

**URL parsing:** `parseRunUrl()` in `src/cli/validators.ts` extracts owner, repo, and runId from GitHub Actions URLs.

**Storage:** Workflow data is cached in `.ci-analyzer/{runId}/` with `summary.json` and `logs/*.log` files.

## GitHub Action

The `action-dist/` directory contains the bundled action (must be committed). Action metadata is in `action.yml`.

**Inputs:** `github-token` (required), `run-id`, `repository`
**Outputs:** `summary`, `recommendations`

## Environment Variables

- `GITHUB_TOKEN` - Required for GitHub API access

## Tech Stack

- ES modules (`"type": "module"`)
- TypeScript with strict mode
- Commander for CLI parsing
- Vitest for testing
- `@opencode-ai/sdk` for AI analysis
- `@octokit/rest` for GitHub API
- `@vercel/ncc` for bundling the GitHub Action
