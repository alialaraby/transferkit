# Release notes

## 0.3.0 — Human-first onboarding (release candidate)

### What's new

- The shared `ONBOARDING.md` now starts with a source-backed repository overview, a compact glossary, selected entry stories, change and test points, and setup observations. Detailed traces remain in a collapsed appendix.
- Onboarding stories distinguish separate entries, documented statements, static trace observations, and unverified runtime outcomes. They do not force an automatic sequence between paths that merely touch the same record.
- Personal `v2:` exercises now follow the guide's mental model, stories, change map, and safe observation. Existing IDs, progress, notes, questions, and evidence remain intact; changed guide selections can surface stale links.
- Interactive terminal commands show delayed progress during repository scans and guide generation. Piped stdout and stderr remain free of spinner frames.
- Handover v3's structured plan, checklist, evidence review, and Markdown sync remain available.

### Compatibility and limits

- `tk handover plan` already performs a scan; running `tk handover scan` immediately before it is optional. `tk handover init` creates separate project metadata and is not needed to create a v3 plan.
- The guide is static evidence, not proof of application behavior or setup success. Business meaning and operational ownership still require a knowledgeable person.
- Generated personal workspace files are never replaced by `tk onboard workspace`; checkbox and structured progress synchronization retains conflict checks.
- No target application, installer, migration, or external service is run during guide generation.

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
