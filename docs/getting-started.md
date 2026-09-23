# Getting started

TransferKit runs inside the repository whose ownership is being transferred. It stores shared handover state separately from personal onboarding progress.

## Install from source

Until the npm release is published:

```bash
git clone https://github.com/alialaraby/transferkit.git
cd transferkit
npm ci
npm run build
npm link --workspace @transferkit/cli
```

Verify the command with `tk --help`, `tk handover --help`, and `tk onboard --help`.

## Build the handover

From the target repository:

```bash
tk handover init
tk handover scan
tk handover evidence
tk handover interview
tk handover audit
tk handover export
```

Initialization creates `.transferkit/project.yaml`. Scanning records the current system model in `.transferkit/handover.json`. Evidence output shows why each repository finding was produced. The interview saves each accepted answer as it proceeds and supports `skip` and `cancel`.

Export writes a topic-based Markdown package under `.transferkit/handover/`; use `tk handover export --single` to generate `HANDOVER.md` instead.

## Start onboarding

```bash
tk onboard plan
tk onboard status
tk onboard task <task-id> in-progress
tk onboard task <task-id> completed
```

Onboarding progress is stored under `.transferkit.local/`, which TransferKit's repository ignores by default. The plan remains useful when human handover knowledge is incomplete by distinguishing repository-derived facts from unknown context.

## Handling errors safely

Invalid persisted state, malformed `package.json`, unsupported schema versions, scanner failures, and filesystem errors return a non-zero exit code with a concise message. TransferKit does not print raw stack traces during normal CLI use.

Back up shared state before editing it manually. TransferKit validates state on read and rejects structurally invalid files rather than silently repairing them.
