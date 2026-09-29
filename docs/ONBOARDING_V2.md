# Onboarding v2 — Product and Design Specification

**Status: design target, with Milestone 9 slices in progress.** The maintainer has confirmed that Handover v3 passed its Debtbox Current Owner validation gate. The [illustrative Debtbox fixture](ONBOARDING_V2_DEBTBOX_FIXTURE.md) defines the desired reading experience; it is not current CLI output.

## Goal and modes

Help an engineer unfamiliar with a repository discover its structure, trace meaningful behavior, try to run and change it, and record what remains unknown. **Repository-only onboarding is a complete independent workflow**: scanning, the reusable guide, exercises, personal progress, and visible unknowns work without a handover file or a Current Owner. Missing handover must never block guide creation or turn repository findings into invented human context.

When a v3 Transfer is available, selected Handover Items may **enrich** the same journey. Link each related item by its stable item ID, retain its provenance and current status, and show relevant person-supplied context alongside repository evidence. An item can add business intent, operational steps, ownership, risks, or open questions; it cannot silently override observed code. Unrelated, incomplete, or absent items leave the repository-only guide usable. Handover completion and personal learning completion remain independent.

## Two Markdown surfaces and state

- Root `ONBOARDING.md` is the reusable, team-shareable **system guide**. It explains what the repository supports and where to investigate. Stable section anchors let people link to the same architecture, flow, operations, and unknowns sections. It contains no personal progress or private notes. It is reviewable through Git.
- `.transferkit.local/ONBOARDING.md` is each engineer's **personal workspace**: outcome-based exercises, checkboxes, notes, questions, and evidence of work. Each exercise links to a guide section; it does not copy the entire guide. It remains local and uncommitted by default.
- Personal structured state under `.transferkit.local/` holds stable exercise IDs, status, evidence references, and the synchronization snapshot needed to reconcile Markdown edits. The personal Markdown workspace is editable, not a disposable export. Checkbox changes and CLI progress changes synchronize in both directions. Preserve free-form prose and unknown sections. If both representations edit the same supported field differently, surface a conflict with both values and require an explicit resolution; never silently overwrite either side. A rescan must preserve personal work even if a suggested exercise disappears, and should expose stale links.
- The guide's generated portions come from repository evidence and optional linked Transfer context. Human edits to a shared guide require a preservation/reconciliation policy before implementation; regeneration must not erase prose silently.

## Content and evidence contract

The guide should start with a concise system overview, entry point, major modules, data stores, integrations, background work, and important architecture relationships. Show a **few explained end-to-end flows**, chosen for learning value, with entry point, validation/decisions, persistence, side effects, and possible gaps. Describe setup and operations from checked-in evidence, and keep unknowns prominent. Avoid flat dependency lists and unsupported call graphs.

Every material statement should carry a source label: **observed in code**, **inferred**, **supplied by a person**, or **runtime unverified**. Observed claims cite repository-relative files, symbols, or lines where available. Inferences state their basis and uncertainty. Person-supplied context links to its Handover Item ID when applicable. Commands found in a README or Compose file are documented commands, not proof they work. Use **runtime unverified** until someone actually executes and records a result. Do not invent business purpose, production behavior, verified run commands, successful recovery, or competence scores.

The personal workspace turns the guide into exercises with an objective, starting guide link and evidence, concrete outcome, and space for notes, questions, and completion evidence. Examples: explain debt creation and consent with failure boundaries; run the service and record the actual result; trace payment to payout; identify what is needed to practice recovery. A checkbox is self-reported progress, not proof of system behavior or ownership readiness. An engineer or organization decides readiness.

### First personal workspace slice: progress compatibility

The personal workspace has four fixed `v2:` exercise IDs based on learning outcomes, not source locations or legacy plan tasks. Its canonical state and last-synced checkbox snapshot live in `.transferkit.local/onboarding-v2.json`; `tk onboard sync` imports checkboxes and `tk onboard task <v2-id> <status>` updates the matching checkbox without replacing prose. With a managed guide and personal workspace, `plan` shows the v2 exercises and `status` leads with v2 progress and questions. The older `.transferkit.local/onboarding-progress.json` keeps its schema, task IDs, statuses, and timestamps; legacy progress appears in a separate status section, and the legacy plan remains the fallback when v2 files are absent. There is no automatic one-to-one mapping from repository-specific legacy tasks to broader v2 exercises. A future migration must use an explicit, versioned mapping for genuinely matching tasks, retain unmapped records and timestamps, and surface ambiguous matches for review. A checked v2 box records self-reported completion only; Notes, Questions, and Evidence do not change status. An existing personal Markdown file is never regenerated over human edits.

## Implementation sequence and acceptance

1. Review the illustrative Debtbox acceptance fixture against supplied source-inspection evidence.
2. Analyze current scanner, plan, state, CLI, and rendering capabilities against this specification. Record what can be reused and what is missing.
3. Implement the smallest **repository-only guide** slice that produces useful overview, relationships, one explained flow, setup limits, and unknowns from evidence.
4. Add the personal workspace and structured progress synchronization with stable exercise identity, prose preservation, and surfaced conflicts.
5. Add optional v3 Handover Item enrichment by stable ID without making it a dependency of repository-only use.
6. Validate with a real newcomer, first repository-only and then with handover context when available. Measure useful understanding, ability to trace and run, questions left open, and misleading claims.

Milestone 9 remains in progress until implementation and real newcomer validation are done. The earlier onboarding implementation remains historically accurate: it creates a staged plan from repository findings and legacy handover knowledge, and stores JSON progress locally. The current guide and personal workspace slices add separate Markdown surfaces and checkbox synchronization; v3 Item enrichment remains planned.
