# Architecture

TransferKit is a local-first TypeScript CLI. Structured state is authoritative; Markdown and terminal output are derived views.

## Processing pipeline

```text
Repository
    ↓
Scanners
    ↓
Findings + Evidence
    ↓
Model Builder
    ↓
System Model
    ↓
Requirements
    ↓
Gaps
    ↓
Knowledge
    ↓
Audit / Export / Onboarding
```

1. **Repository:** Source files and repository configuration are read locally.
2. **Scanners:** Technology-specific code performs deterministic detection.
3. **Findings + Evidence:** Each observation carries its source and explanation.
4. **Model Builder:** Scanner-specific observations become stable domain entities.
5. **System Model:** `.transferkit/handover.json` persists discovered entities and human knowledge.
6. **Requirements:** Standards select expected knowledge for each entity kind.
7. **Gaps:** Core logic compares requirements with current knowledge.
8. **Knowledge:** The CLI interview captures a small number of high-value answers.
9. **Outputs:** Audits, Markdown exports, and onboarding plans consume structured state.

Generated Markdown never becomes an alternate state store. Personal onboarding progress is persisted separately in `.transferkit.local/`.

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

## Persistence

Shared state uses schema-versioned files under `.transferkit/`. Readers validate structure and reject unsupported versions. Explicit migration entry points provide the boundary for future migrations; schema version 1 has no historical predecessor.

Writes use temporary files followed by rename where state can be updated repeatedly. Generated export files are replaceable outputs. Unrelated user files in the export directory are preserved.

## Privacy and failure boundaries

Repository scanning has no implicit network or AI integration. Environment detection stores names rather than values. Human answers resembling common secrets are rejected before persistence, and renderers redact common credential patterns as a final safeguard.

Filesystem, scanner, configuration, and state-validation failures cross the CLI boundary as concise user-facing errors. Underlying error causes remain available internally without exposing stack traces by default.
