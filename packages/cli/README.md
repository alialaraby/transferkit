# TransferKit

TransferKit is a local-first CLI for software ownership transfer. It uses repository evidence to suggest a handover plan, then gives the current and next owners a shared `HANDOVER.md` checklist. It also supports a separate personal onboarding plan.

## Install

Node.js 18 or newer is required.

```bash
npm install --global transferkit
tk --help
```

## Handover quick start

Run these commands in the repository being transferred:

```bash
tk handover init
tk handover scan
tk handover plan
# Review the suggestions and edit HANDOVER.md in the repository root
tk handover sync
tk handover status
```

`tk handover plan` writes a structured plan to `.transferkit/transfer.json` and creates `HANDOVER.md` as the meeting checklist. The Markdown guide explains its priorities, checkboxes, notes, and completion fields. Mark the items and required discussion points you covered, then run `tk handover sync` to update the structured state. `tk handover status` reports remaining work. Use `tk handover evidence` to inspect repository findings.

To review a suggestion before the meeting, use `tk handover plan accept <item-id>` or `tk handover plan reject <item-id>`. The plan command also supports renaming, reprioritizing, moving, and adding items.

## Personal onboarding

```bash
tk onboard plan
tk onboard status
tk onboard task <task-id> in-progress
tk onboard task <task-id> completed
```

Personal progress stays in `.transferkit.local/`. Onboarding currently uses repository findings and any legacy handover knowledge; it does not use v3 Transfer completion.

## What's new in 0.2.0

- Handover v3 adds a root-level `HANDOVER.md` workspace with stable item markers and Markdown sync.
- Repository evidence helps group related ownership domains and business flows into handover topics.
- Item headings show priority and special completion type; code references are collapsible and the document includes a meeting guide.
- `tk handover status` tracks item and section progress from structured Transfer state.
- The CLI supports Node.js 18 and newer.

See the [0.2.0 release notes](CHANGELOG.md) for compatibility details and the [repository README](https://github.com/alialaraby/transferkit#readme) for more documentation.

TransferKit runs locally and does not upload source code or make implicit AI calls. Detection is limited to supported static patterns; review suggested topics and evidence before relying on them.
