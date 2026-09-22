# TransferKit Architecture

TransferKit is a local-first CLI that turns repository evidence and human knowledge into structured ownership-transfer information. Structured data is the source of truth; human-readable documents are generated views of that state.

## Repository structure

```text
packages/       TransferKit workspace packages
  cli/          command-line entrypoints and orchestration
  core/         framework-independent domain concepts and logic
  scanners/     repository and technology detection
  standards/    expected knowledge definitions
  renderers/    human-readable output formatting
fixtures/       small repositories used as automated test inputs
examples/       human-facing usage examples, when added
docs/           public project documentation
```

Fixtures are test data and may be deliberately incomplete. Examples are intended for people to read and run; the two should not be mixed.

## Package boundaries

The allowed dependency direction is:

```text
                 cli
          /       |       \
   scanners   standards   renderers
          \       |       /
                 core
```

- `core` owns reusable domain concepts and deterministic domain behavior. It must not depend on another TransferKit package or contain framework-specific concepts.
- `scanners` inspect repositories and report findings with supporting evidence. They do not render documentation, interview users, or decide whether knowledge is complete.
- `standards` describe what knowledge is expected without encoding how a technology is detected.
- `renderers` turn structured state into human-readable output without owning domain rules.
- `cli` coordinates application behavior and terminal interaction while keeping domain logic in the appropriate package.

Dependencies must point toward `core`; circular package dependencies are not allowed.

## Information flow

```text
repository
    ↓
scanner
    ↓
findings + evidence
    ↓
canonical system model
    ↓
CLI and renderers
```

A scanner records what it can support with repository evidence. Core logic combines those structured observations into a framework-independent model. Later consumers operate on that model rather than reparsing generated Markdown or relying on scanner-specific representations.

## Design principles

### Structured data first

Persisted structured state is authoritative. Markdown and other presentation formats are outputs and must not become an alternate state store.

### Local first

Repository analysis and project state stay local by default. Core workflows must not require a hosted service, and source code must not be transmitted implicitly.

### Framework-independent core

Framework and technology details belong at the scanner boundary. Core types and rules should express software ownership concepts without depending on NestJS, RabbitMQ, or any other specific implementation technology.
