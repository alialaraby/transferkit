# TransferKit

TransferKit is a local-first command-line tool for structured software ownership transfer. It scans a repository for supported system components, records evidence for what it finds, identifies missing operational knowledge, and turns the resulting structured state into handover and onboarding workflows.

Software ownership transfers often fail because repository facts, operational context, and a new owner's learning progress are mixed together in documents that quickly become stale. TransferKit separates them:

- **Handover** builds shared knowledge about the system: what exists, how it operates, who owns it, and what is still unknown.
- **Onboarding** creates a personal learning plan from repository evidence and available handover knowledge. Personal progress stays local and is not shared as project state.

TransferKit is an early-stage project. Its current ecosystem support focuses on Node.js and TypeScript backends, with deeper detection for NestJS, RabbitMQ, scheduled jobs, PostgreSQL/TypeORM, outbound HTTP integrations, environment configuration, Docker, and GitHub Actions.

## Install

TransferKit is not published to npm yet. After the first release, the intended installation command is:

```bash
npm install --global @transferkit/cli
```

For local development today:

```bash
git clone https://github.com/alialaraby/transferkit.git
cd transferkit
npm ci
npm run build
npm link --workspace @transferkit/cli
tk --help
```

Node.js 22 or newer is required.

## Quick start

Run these commands from the repository being transferred:

```bash
tk handover init
tk handover scan
tk handover evidence
tk handover interview
tk handover audit
tk handover export

tk onboard plan
tk onboard status
```

`handover scan` updates structured repository-derived state. `handover evidence` explains each finding with its source file and line where available. `handover interview` asks a small number of high-value questions. `handover export` generates Markdown under `.transferkit/handover/`.

To update personal onboarding progress:

```bash
tk onboard task <task-id> in-progress
tk onboard task <task-id> completed
```

See the [workflow example](examples/workflow.md) for representative output and [getting started](docs/getting-started.md) for a fuller walkthrough.

## Local-first and private by default

TransferKit scans files and computes results locally. It does not make implicit AI or network calls, and it does not upload source code. Shared state lives in `.transferkit/`; personal onboarding progress lives in Git-ignored `.transferkit.local/`. Environment detection records variable names, not values. Obvious secret-like interview answers are rejected, and generated output redacts common credential patterns.

Review generated handover files before committing them. Automated secret protection is deliberately lightweight and is not a replacement for repository secret scanning.

## Documentation

- [Getting started](docs/getting-started.md)
- [Concepts](docs/concepts.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Scanner development](docs/scanners.md)
- [Contributing](CONTRIBUTING.md)

## Current limitations

- Detection is deterministic and limited to supported static patterns.
- Dynamic configuration, computed decorator metadata, and runtime-only behavior may not be discovered.
- Evidence inspection performs a fresh scan rather than reading a persisted evidence index.
- State migrations have an explicit boundary, but no historical migrations exist yet because schema version 1 is the first format.
- npm packages are prepared but not published.

## Project status

TransferKit is pre-release software. State formats and commands should be treated as unstable until the first public release. Feedback and focused contributions are welcome through GitHub issues and pull requests.
