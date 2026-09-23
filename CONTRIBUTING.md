# Contributing to TransferKit

TransferKit is a TypeScript/npm workspace. Contributions should stay focused, deterministic, and consistent with its local-first ownership-transfer purpose.

## Local setup

Requirements:

- Node.js 22 or newer
- npm 10 or newer

```sh
git clone https://github.com/alialaraby/transferkit.git
cd transferkit
npm ci
npm run build
```

## Repository structure

- `packages/core` — framework-independent domain types and logic
- `packages/scanners` — repository inspection and technology-specific detection
- `packages/standards` — handover requirements and question planning
- `packages/renderers` — human-readable output generation
- `packages/cli` — commands, terminal interaction, and orchestration
- `fixtures` — deterministic repositories used by scanner and workflow tests
- `docs` — public user and contributor documentation
- `examples` — public command-oriented examples

## Development commands

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Run `npm run format` to apply the shared Prettier configuration.

## Package responsibilities

- `packages/core` contains framework-independent domain concepts and logic. It must not depend on another TransferKit package.
- `packages/scanners` inspects repositories and emits findings and evidence.
- `packages/standards` defines the knowledge TransferKit expects.
- `packages/renderers` formats structured state for people.
- `packages/cli` handles terminal interaction and orchestrates the other packages.

Dependencies point toward core; circular dependencies are not allowed. Keep technology-specific detection in scanners, domain rules in core, and presentation rules in renderers or the CLI. See [architecture](docs/ARCHITECTURE.md) for the complete information flow.

## Tests

Prefer behavior-focused assertions, real filesystem fixtures, and deterministic inputs. Avoid mocking source parsing when a small fixture can express the behavior. Add focused negative coverage for malformed or unsupported inputs.

Tests live beside their implementation as `*.test.ts`. Use `fixtures/realistic-nestjs` for combined integration behavior and smaller fixtures for isolated edge cases.

## Adding or changing a scanner

Keep scanner scope narrow and evidence-based:

1. Confirm the technology or pattern belongs in the scanner layer.
2. Add the smallest realistic fixture that demonstrates positive and negative behavior.
3. Emit the existing `Finding` and `Evidence` contracts; do not create a parallel model.
4. Record source paths and line numbers when available.
5. Avoid guesses when source information is dynamic or ambiguous.
6. Test the scanner independently and through `scanRepository` when it affects the combined scan.

Do not add network calls, transmit source, or collect environment-variable values.

## Pull requests

- Keep one clear purpose per pull request.
- Explain user-visible behavior and architectural impact.
- Include tests for changed behavior and update public documentation when contracts change.
- Avoid unrelated cleanup, speculative abstractions, and unnecessary dependencies.
- Confirm typecheck, lint, tests, and build pass.
- Never commit real credentials, private repository content, generated local onboarding state, or unpublished planning material.
