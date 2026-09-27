# Example ownership-transfer workflow

This example shows representative output for a NestJS service. Exact findings depend on the repository.

```console
$ tk handover init
Initialized TransferKit in /work/shipment-platform/.transferkit/project.yaml

$ tk handover scan
Scanned repository: 5 findings, 18 suggestions pending review. Use: tk handover plan

$ tk handover plan
Handover Plan: 18 items, 18 pending review, 0 done.
Generated HANDOVER.md.

# Review and edit HANDOVER.md in your IDE, then synchronize it.
$ tk handover sync
Synced HANDOVER.md

$ tk handover status
shipment-platform Handover
0 / 18 complete

$ tk onboard plan
Onboarding Plan

Knowledge source: repository and human handover.
...

$ tk onboard task understand-system:consumer:shipments completed
Updated understand-system:consumer:shipments to completed.

$ tk onboard status
Understand the System   1/1
Trace It                0/1
```

`HANDOVER.md` is the editable handover workspace. Its supported edits synchronize to `.transferkit/transfer.json`. Personal onboarding progress is stored separately in `.transferkit.local/`.
