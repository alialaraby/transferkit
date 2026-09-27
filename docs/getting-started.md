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
tk handover plan
# Review and edit HANDOVER.md in your IDE
tk handover sync
tk handover status
```

Initialization creates `.transferkit/project.yaml`. Scanning refreshes suggested items in `.transferkit/transfer.json`. Planning creates the root-level `HANDOVER.md` workspace. Review suggestions with `tk handover plan`, edit the document, then sync supported edits back to Transfer state. `tk handover evidence` shows the repository evidence behind findings.

Existing `.transferkit/handover.json` files remain available to onboarding and are not converted or deleted by the v3 commands.

## Start onboarding

```bash
tk onboard plan
tk onboard status
tk onboard task <task-id> in-progress
tk onboard task <task-id> completed
```

Onboarding progress is stored under `.transferkit.local/`, which TransferKit's repository ignores by default. Onboarding currently reads repository findings and any existing legacy handover knowledge; it does not consume v3 Transfer completion yet. Its plan remains useful when human handover knowledge is incomplete by distinguishing repository-derived facts from unknown context.

## Handling errors safely

Invalid persisted state, malformed `package.json`, unsupported schema versions, scanner failures, and filesystem errors return a non-zero exit code with a concise message. TransferKit does not print raw stack traces during normal CLI use.

Back up shared state before editing it manually. TransferKit validates state on read and rejects structurally invalid files rather than silently repairing them.
