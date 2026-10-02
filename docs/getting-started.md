# Getting started

TransferKit runs inside the repository whose ownership is being transferred. Shared handover state and the generated guide can be reviewed by a team; personal onboarding progress stays in a separate local workspace.

## Install

Node.js 18 or newer is required. Install the published CLI with:

```bash
npm install --global transferkit
```

To install from source instead:

```bash
git clone https://github.com/alialaraby/transferkit.git
cd transferkit
npm ci
npm run build
npm link --workspace transferkit
```

Verify the command with `tk --help`, `tk handover --help`, and `tk onboard --help`. Then change to the repository you want to examine.

## Build the handover

```bash
cd /path/to/your/repository
tk handover plan
# Review the suggested IDs and edit HANDOVER.md with the current owner.
tk handover sync
tk handover status
```

`handover plan` scans the repository, records suggestions in `.transferkit/transfer.json`, and creates `HANDOVER.md` if it is missing. Review suggestions before a meeting: `tk handover plan accept <item-id>` and `reject <item-id>` make explicit decisions; `rename`, `priority`, `move`, and `add` cover adjustments. Edit the generated checklist to record what was actually discussed, then run `sync` to import supported edits. `status` reports open work.

`tk handover evidence` prints the cited findings behind scanner suggestions. `tk handover scan` refreshes suggestions without creating a checklist; it is optional immediately before `plan`, which already scans. `tk handover init` creates optional `.transferkit/project.yaml` metadata. Existing legacy `.transferkit/handover.json` data is not converted or deleted by the v3 commands.

## Start onboarding

```bash
tk onboard guide
tk onboard workspace
tk onboard plan
# Read ONBOARDING.md; write notes and observations in .transferkit.local/ONBOARDING.md.
tk onboard task v2:trace-flow in-progress
tk onboard sync
tk onboard status
```

`guide` builds a shared, source-cited reading path through the repository. It begins with project purpose when documented, or a bounded source-level overview when it is not. Stories separate selected entries and label unsupported connections and runtime effects. Use `tk onboard guide --focus <route-or-symbol>` to inspect a supported entry.

`workspace` creates a personal checklist once and does not overwrite it. Check a box in the Markdown file and run `sync`, or set status directly with `task`. The stable `v2:` exercises ask you to explain the system map, compare source journeys, record a safe observation or blocker, and identify ownership questions. `plan` and `status` flag stale links if selected guide entries change. Completed exercises are self-reported progress.

Personal files are stored under `.transferkit.local/`. Add that directory to the target repository's ignore rules if it is not already ignored. Onboarding does not consume v3 Transfer completion state; it may still display legacy onboarding progress separately when present.

## Handling errors safely

Invalid persisted state, malformed `package.json`, unsupported schema versions, scanner failures, and filesystem errors return a non-zero exit code with a concise message. TransferKit does not print raw stack traces during normal CLI use.

Back up shared state before editing it manually. TransferKit validates state on read and rejects structurally invalid files rather than silently repairing them. Generated setup commands are documentation or declarations, not verified execution; check prerequisites before running them.
