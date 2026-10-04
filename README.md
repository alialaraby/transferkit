# TransferKit

> Make software ownership transfer easier to inspect, discuss, and continue.

[![npm version](https://img.shields.io/npm/v/transferkit.svg)](https://www.npmjs.com/package/transferkit)
[![CI](https://github.com/alialaraby/transferkit/actions/workflows/ci.yml/badge.svg)](https://github.com/alialaraby/transferkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](package.json)

TransferKit is a local-first CLI for engineering handover and developer onboarding. It reads a repository, records cited findings, and helps people turn those findings into a shared ownership plan and a personal learning path. It does not run the target application or infer business meaning from code alone.

- **Handover** helps the current and next owners agree on what must be explained, verified, transferred, and followed up. Structured state in `.transferkit/transfer.json` drives an editable `HANDOVER.md` checklist.
- **Onboarding** creates a shared `ONBOARDING.md` that introduces the repository, its important code terms, selected entry paths, change points, and setup clues. Each newcomer records their own progress in `.transferkit.local/ONBOARDING.md`.

The scanners currently have their deepest coverage for Node.js and TypeScript backends, including NestJS routes, scheduled work, RabbitMQ and BullMQ declarations, TypeORM, integrations, configuration, Docker, and GitHub Actions. A JavaScript or Python repository can still get a documented overview and entry points; unsupported inner behavior is labeled as a gap.

## Install

Node.js 18 or newer is required.

```bash
npm install --global transferkit
tk --help
```

Run TransferKit **from the root of the repository you want to examine**. Use `tk handover --help` or `tk onboard --help` for command syntax.

## Handover: build a shared ownership plan

```bash
cd /path/to/your/repository
tk handover plan
# Review the suggested item IDs and edit HANDOVER.md with your team.
tk handover sync
tk handover status
```

`handover plan` scans the repository, creates or refreshes suggestions in `.transferkit/transfer.json`, and generates `HANDOVER.md` if it does not exist. The plan lists ownership topics with priority and completion rules. Review each suggestion with a person who knows the system; evidence helps start the conversation but does not certify an answer. The command preserves an existing `HANDOVER.md` so your edits are not overwritten.

The checklist is useful in a handover meeting: mark what was covered, add notes and evidence, then run `handover sync` to import supported edits into structured state. `handover status` shows what remains open. For a closer look at scanner findings, run `tk handover evidence`.

| Command | When to use it |
| --- | --- |
| `tk handover plan` | Create or refresh suggestions and the shared checklist. |
| `tk handover plan accept <item-id>` / `reject <item-id>` | Decide whether a suggested item belongs in this handover. |
| `tk handover plan rename <item-id> <title>` | Give an item a name the team recognizes. |
| `tk handover plan priority <item-id> <CRITICAL\|RECOMMENDED\|OPTIONAL>` | Change the review order. |
| `tk handover plan move <item-id> <section-id> <position>` | Move an item within the plan. |
| `tk handover plan add <section-id> <type> <priority> <title>` | Add a missing human-owned topic. |
| `tk handover sync` / `status` | Import checklist edits and inspect progress. |
| `tk handover scan` / `evidence` | Refresh suggestions without opening a new checklist, or print cited findings. |

`tk handover init` creates optional `.transferkit/project.yaml` metadata. `handover plan` can create its own structured plan without this step.

## Onboarding: learn the repository

```bash
cd /path/to/your/repository
tk onboard guide
tk onboard workspace
tk onboard plan
# Read ONBOARDING.md and record findings in .transferkit.local/ONBOARDING.md.
tk onboard task v2:trace-flow in-progress
tk onboard sync
tk onboard status
```

The shared guide starts with what the repository says it does, or a clearly labeled source-level reading path when that purpose is undocumented. It then points to a small glossary, separate code journeys, likely change and test locations, and safe setup observations. Source links let you check each claim. Detailed traces remain in a collapsed appendix; a cited write call is not proof that a transaction completed.

Use `tk onboard guide --focus OrderController.submit` to regenerate the guide around a supported route or symbol. `tk onboard workspace` creates a **personal** checklist only once; it will not overwrite existing notes. A completed checkbox is self-reported progress. If the selected guide paths change later, `tk onboard plan` and `status` warn about stale links while keeping the newcomer's progress and notes.

| Command | When to use it |
| --- | --- |
| `tk onboard guide [--focus <route-or-symbol>]` | Generate or update the shared, source-cited guide. |
| `tk onboard workspace` | Create a personal learning checklist from the guide. |
| `tk onboard plan` | See the next reading and investigation exercises. |
| `tk onboard task <v2-id> <status>` | Record `not-started`, `in-progress`, `completed`, or `skipped`. |
| `tk onboard sync` / `status` | Import checkbox edits and see progress, questions, and stale links. |

Documented commands in a generated guide are **not verified runs**. Check prerequisites before using them, record the actual result or blocker, and ask an owner when business intent or operating procedures are absent from the repository.

## Release notes — 0.3.0 candidate

- Onboarding guides now lead with a source-backed repository story, a compact glossary, separate selected journeys, a task-to-file map, and a safe first investigation. Raw traces remain available for deeper review.
- Personal onboarding exercises follow that reading path and keep their stable IDs, checkboxes, questions, notes, and evidence when the shared guide changes.
- Handover retains the structured v3 ownership plan, evidence-backed suggestions, editable meeting checklist, and Markdown sync introduced in 0.2.0.
- Long repository scans and guide generation now show a terminal progress indicator in interactive terminals. Redirected output stays clean.

See the [package changelog](packages/cli/CHANGELOG.md) for compatibility details. This release candidate has not been merged or published.

## Files, privacy, and limits

Shared handover state lives in `.transferkit/`; personal onboarding progress lives in `.transferkit.local/`. Add `.transferkit.local/` to the target repository's `.gitignore` to keep personal notes private. Generated Markdown is a view over structured state for handover and a cited output for onboarding. TransferKit does not upload source code or make implicit AI or network calls. Configuration discovery records variable names, not values.

Detection is deterministic and limited to supported static patterns. Dynamic targets, runtime effects, and business meanings may need a person to verify them. Review shared generated files before committing them; the built-in secret checks are lightweight and do not replace repository secret scanning.

## More documentation

- [Getting started](docs/getting-started.md)
- [Concepts](docs/concepts.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Scanner development](docs/scanners.md)
- [Contributing](CONTRIBUTING.md)

TransferKit is early-stage software. State formats and commands may evolve before a stable release.
