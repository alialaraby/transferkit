# Concepts

## Handover and onboarding

A **handover** is shared system knowledge. It combines facts discovered from the repository with operational context supplied by people. It answers questions such as what components exist, what happens when they fail, how recovery works, and who owns them.

**Onboarding** is personal progress toward understanding and operating that system. TransferKit derives onboarding tasks from the shared model but stores task progress locally for each person.

## Structured state and generated output

Structured files under `.transferkit/` are the source of truth. Generated Markdown is a readable view and can be regenerated. Editing generated Markdown does not update structured state.

`.transferkit.local/` contains personal state and should not be committed.

## Findings and evidence

A scanner emits a finding only when it has concrete evidence. Evidence records the source file, an optional line number, and a short explanation. Run `tk handover evidence` to inspect it.

## Requirements, gaps, and knowledge

Requirements describe the operational knowledge expected for a discovered entity. A gap exists when required knowledge has not been answered. Interview answers become structured knowledge entries; skipped answers remain visible as gaps.

## Deterministic and local-first

TransferKit prefers deterministic analysis over guesses. Dynamic values that cannot be resolved safely are omitted or represented without the unknown detail. Scans and interviews run locally without implicit network or AI calls.
