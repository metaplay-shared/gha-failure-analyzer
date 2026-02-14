# gha-failure-analyzer

AI-powered analysis of failed GitHub Actions workflow runs using the [OpenCode SDK](https://opencode.ai/docs/sdk/). Runs as a CLI for local use or as a GitHub Action for automated analysis.

## Run Locally

```bash
pnpm install
```

A GitHub token with `repo` and `actions:read` scopes is required. If you're logged in with the GitHub CLI (`gh`), the token is picked up automatically. Otherwise set `GITHUB_TOKEN`:

```bash
export GITHUB_TOKEN=<token>
```

Run commands:

```bash
# Analyze a failed workflow run (uses ../sdk as working directory by default)
pnpm dev analyze https://github.com/owner/repo/actions/runs/123456789

# Point at a different repo
pnpm dev analyze <url> --repo-path /path/to/repo

# List failed runs for a repository
pnpm dev list -r owner/repo
```

### Options

```
analyze <url>
  -p, --repo-path <path>   Repository root for AI analysis context (default: ../sdk)
  --raw                    Output raw markdown without terminal formatting
  -t, --timeout <minutes>  Soft timeout for AI analysis (default: 15)
  -v, --verbose            Show detailed progress
  -q, --quiet              Suppress output except errors

list -r <owner/repo>
  -l, --limit <count>      Maximum runs to list (default: 10)
  -w, --workflow <name>    Filter by workflow name
  -v, --verbose            Show detailed progress
  -q, --quiet              Suppress output except errors
```

### Environment Variables

| Variable         | Description                                                                 |
|------------------|-----------------------------------------------------------------------------|
| `GITHUB_TOKEN`   | GitHub API token (auto-detected from `gh auth token` when running locally)  |
| `OPENCODE_MODEL` | AI model in `provider/model` format (default: `opencode/kimi-k2.5-free`)   |

## Development

```bash
pnpm dev analyze <url>    # Run without building
pnpm test                 # Run tests
pnpm lint                 # Lint code
```

### test-opencode

Tests MCP tool integration by summarizing markdown files. Simulates many of the real analyzer operations (OpenCode client, MCP tool server, event streaming) in a simpler command for faster iteration during development.

```bash
pnpm dev test-opencode -p ./my-repo
```

### Building

```bash
pnpm build              # Compile TypeScript
pnpm build:action       # Bundle GitHub Action with ncc into dist/
```

After making changes, rebuild and commit `dist/` for the GitHub Action:

```bash
pnpm build:action
git add dist/
```

## GitHub Action

### Inputs

| Input           | Required | Default | Description                                              |
|-----------------|----------|---------|----------------------------------------------------------|
| `github-token`  | Yes      |         | GitHub token for API access                              |
| `run-id`        | No       |         | Workflow run ID (auto-detected from workflow_run event)   |
| `repository`    | No       |         | Repository owner/repo (defaults to current)              |
| `soft-timeout`  | No       | `15`    | Soft timeout in minutes for AI analysis                  |
| `slack-token`   | No       |         | Slack Bot OAuth token for sending notifications          |
| `slack-channel` | No       |         | Slack channel ID to post notifications to                |

### Outputs

| Output            | Description                       |
|-------------------|-----------------------------------|
| `summary`         | AI-generated failure summary      |
| `recommendations` | JSON array of recommendations     |

### Example Workflow

```yaml
name: Analyze Failures
on:
  workflow_run:
    workflows: ['CI']
    types: [completed]

jobs:
  analyze:
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: metaplay/gha-failure-analyzer@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## License

[Apache-2.0](LICENSE)
