# TransferKit

TransferKit is a local-first CLI for engineering handover and developer onboarding. It turns repository evidence into a shared ownership checklist and a separate, source-cited newcomer guide. Static findings are starting points for people to verify; TransferKit does not run the target application.

## Install

Requires Node.js 18 or newer.

```bash
npm install --global transferkit
tk --help
```

Run commands from the root of the repository you want to examine.

## Handover

```bash
tk handover plan
# Review suggested IDs and HANDOVER.md with the current owner.
tk handover sync
tk handover status
```

`plan` scans the repository, refreshes suggestions in `.transferkit/transfer.json`, and creates `HANDOVER.md` when it is missing. Suggested items cover ownership topics, actions, risks, open work, and verification. Review them with the team, edit the checklist, then run `sync` to import supported Markdown edits. `status` reports remaining work.

Use `tk handover plan accept <item-id>` or `reject <item-id>` to review a suggestion; `rename`, `priority`, `move`, and `add` let you adapt the plan. `tk handover evidence` prints cited scanner findings. `tk handover scan` refreshes suggestions without creating a checklist. `tk handover init` creates optional project metadata; it is not required before `plan`.

## Onboarding

```bash
tk onboard guide
tk onboard workspace
tk onboard plan
# Read ONBOARDING.md and record findings in .transferkit.local/ONBOARDING.md.
tk onboard task v2:trace-flow in-progress
tk onboard sync
tk onboard status
```

`guide` creates a shared `ONBOARDING.md` with a repository overview, key code terms, separate entry journeys, change and test locations, setup clues, and citations. Use `tk onboard guide --focus OrderController.submit` to inspect a supported symbol. Detailed source traces remain in an appendix; inferred connections and unverified outcomes are labeled.

`workspace` creates a personal checklist once and preserves later edits. Update its checkboxes or use `task` with `not-started`, `in-progress`, `completed`, or `skipped`; `sync` imports checkbox edits. If guide paths change, `plan` and `status` flag stale links without discarding personal progress. Completion is self-reported, not a competence certificate.

## Release notes — 0.3.0 candidate

This release adds human-first onboarding stories and personal exercises aligned with them. Handover keeps its structured v3 plan and Markdown sync from 0.2.0. Long scans and guide generation show progress in interactive terminals. See [CHANGELOG.md](CHANGELOG.md) for details.

TransferKit scans locally, makes no implicit AI or network calls, and does not upload source code. Dynamic behavior, business intent, and documented setup commands still need human verification. For the full command guide and limitations, see the [project README](https://github.com/alialaraby/transferkit#readme).
