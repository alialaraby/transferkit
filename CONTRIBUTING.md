# Contributing to TransferKit

Thanks for helping improve TransferKit. Keep contributions small, testable, and aligned with the project's local-first ownership-transfer purpose.

## Local setup

Use Node.js 24 LTS and npm:

```sh
npm ci
```

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

Keep technology-specific detection in scanners, domain rules in core, and presentation rules in renderers or the CLI.

## Tests

Add or update focused tests with behavioral changes. Scanner tests should use the smallest practical input under `fixtures/`. Before opening a pull request, run all development commands listed above.

## Scope and focus

Keep each change limited to one clear purpose. Avoid unrelated refactoring, speculative abstractions, premature dependencies, or features that are not required by the change. Preserve package boundaries and update public documentation when a public contract or workflow changes.
