# TransferKit

> Engineering handover and onboarding from real repository evidence.

[![npm version](https://img.shields.io/npm/v/transferkit.svg)](https://www.npmjs.com/package/transferkit)
[![CI](https://github.com/alialaraby/transferkit/actions/workflows/ci.yml/badge.svg)](https://github.com/alialaraby/transferkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js 24+](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](package.json)

TransferKit is a local-first CLI for structured software ownership transfer. It discovers supported system components, records evidence, and turns structured project state into practical handover and onboarding workflows.

Software ownership transfers often fail because repository facts, operational context, and a new owner's learning progress are mixed together in documents that quickly become stale. TransferKit separates them:

- **Handover** builds a shared ownership-transfer plan: what the next owner needs to learn, do, verify, and take over.
- **Onboarding** creates a personal learning plan from repository evidence and available handover knowledge. Personal progress stays local and is not shared as project state.

Its current ecosystem support focuses on Node.js and TypeScript backends, with deeper detection for NestJS, RabbitMQ, scheduled jobs, PostgreSQL/TypeORM, outbound HTTP integrations, environment configuration, Docker, and GitHub Actions.

## Install

```bash
npm install --global transferkit
```

Node.js 24 or newer is required. After installation, run `tk --help` to see the available commands.

## Quick start

Run these commands from the repository being transferred:

```bash
tk handover init
tk handover scan
tk handover plan
# Review and edit HANDOVER.md in your IDE
tk handover sync
tk handover status

tk onboard plan
tk onboard status
```

`handover scan` refreshes suggestions in `.transferkit/transfer.json`. `handover plan` creates or reviews the plan and generates root-level `HANDOVER.md`. Edit its checkboxes and supported fields, then run `handover sync` and `handover status`. Use `handover evidence` to inspect repository findings when needed.

To update personal onboarding progress:

```bash
tk onboard task <task-id> in-progress
tk onboard task <task-id> completed
```

See the [workflow example](examples/workflow.md) for representative output and [getting started](docs/getting-started.md) for a fuller walkthrough.

## Local-first and private by default

TransferKit scans files and computes results locally. It does not make implicit AI or network calls, and it does not upload source code. Shared state lives in `.transferkit/`; personal onboarding progress lives in Git-ignored `.transferkit.local/`. Environment detection records variable names, not values.

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

## Project status

TransferKit is early-stage software. State formats and commands may evolve before a stable release. Feedback and focused contributions are welcome through GitHub issues and pull requests.
