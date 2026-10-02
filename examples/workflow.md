# Example ownership-transfer workflow

This example shows a typical sequence for a service repository. Exact item IDs, findings, and files depend on the repository.

```console
$ tk handover plan
Handover Plan: 18 items, 18 pending review, 0 done.
Generated HANDOVER.md.

# Review suggestions and edit HANDOVER.md with the current owner.
$ tk handover sync
Synced HANDOVER.md

$ tk handover status
shipment-platform Handover
0 / 18 complete

$ tk onboard guide
Generated ONBOARDING.md from repository evidence. Runtime behavior remains unverified.

$ tk onboard workspace
Generated .transferkit.local/ONBOARDING.md with 4 repository-only exercises. Legacy JSON progress was not changed.

$ tk onboard plan
Onboarding plan
1. Understand the system [not-started] (v2:understand-system)
...

$ tk onboard task v2:trace-flow in-progress
Updated v2:trace-flow to in-progress; personal Markdown and JSON are synchronized.

$ tk onboard status
Onboarding progress
0 / 4 exercises complete (self-reported)
...
```

`HANDOVER.md` is the editable shared checklist; supported edits synchronize to `.transferkit/transfer.json`. `ONBOARDING.md` is a cited guide generated from repository evidence. Each newcomer keeps progress and notes separately in `.transferkit.local/`. Generated explanations and setup commands remain unverified until a person checks the source and runs a safe observation.
