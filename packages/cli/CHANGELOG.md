# Release notes

## 0.2.0 — Handover v3

### What's new

- A structured ownership-transfer plan drives the root-level `HANDOVER.md` meeting checklist. Items have stable IDs, priorities, explicit completion rules, and repository evidence.
- `tk handover scan` suggests project-specific ownership domains, business flows, integrations, jobs, and operational topics from deterministic repository analysis.
- `tk handover plan` supports review and editing of suggestions before execution. The generated checklist groups related topics and places priority and special item type in the heading.
- `tk handover sync` imports supported edits to checkboxes, notes, section status, and completion fields without replacing unrelated prose. `tk handover status` reports progress from structured Transfer state.
- The generated document includes a usage guide, concise context names, and collapsible code references.
- Node.js 18 and newer are supported by the CLI bundle and its runtime dependencies.

### Compatibility and limitations

- The Handover v3 workflow uses `tk handover init`, `scan`, `plan`, `sync`, `status`, and `evidence`. Earlier guided handover commands such as `interview`, `audit`, and `export` are no longer part of this workflow.
- Existing legacy `.transferkit/handover.json` data remains available to onboarding. Handover v3 uses `.transferkit/transfer.json`; legacy handover state is not automatically converted.
- Onboarding remains a personal workflow and does not yet consume Handover v3 completion state.
- Repository suggestions are based on supported static patterns and need human review. TransferKit makes no implicit AI or network calls.

Requires Node.js 18 or newer. Install with `npm install --global transferkit`.
