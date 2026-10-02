# Onboarding v2 — Product and Design Specification

**Status: Milestone 9 in progress.** The repository-only guide now includes bounded source-backed journeys, concepts, setup evidence, and change points. The personal workspace has four stable `v2:` exercises, Markdown/JSON checkbox sync, and v2-aware plan/status. Fixture regression and source spot checks are recorded in the [Phase 6 acceptance record](ONBOARDING_PHASE6_ACCEPTANCE.md); a real unfamiliar-engineer comparison is still pending. The [illustrative Debtbox fixture](ONBOARDING_V2_DEBTBOX_FIXTURE.md) remains a design target, not current CLI output.

## Goal and modes

Help an engineer unfamiliar with a repository discover its structure, trace meaningful behavior, try to run and change it, and record what remains unknown. **Repository-only onboarding is a complete independent workflow**: scanning, the reusable guide, exercises, personal progress, and visible unknowns work without a handover file or a Current Owner. Missing handover must never block guide creation or turn repository findings into invented human context.

When a v3 Transfer is available, selected Handover Items may **enrich** the same journey. Link each related item by its stable item ID, retain its provenance and current status, and show relevant person-supplied context alongside repository evidence. An item can add business intent, operational steps, ownership, risks, or open questions; it cannot silently override observed code. Unrelated, incomplete, or absent items leave the repository-only guide usable. Handover completion and personal learning completion remain independent.

## Two Markdown surfaces and state

- Root `ONBOARDING.md` is the reusable, team-shareable **system guide**. It explains what the repository supports and where to investigate. Stable section anchors let people link to the same architecture, flow, operations, and unknowns sections. It contains no personal progress or private notes. It is reviewable through Git.
- `.transferkit.local/ONBOARDING.md` is each engineer's **personal workspace**: outcome-based exercises, checkboxes, notes, questions, and evidence of work. Each exercise links to a guide section; it does not copy the entire guide. It remains local and uncommitted by default.
- Personal structured state under `.transferkit.local/` holds stable exercise IDs, status, evidence references, and the synchronization snapshot needed to reconcile Markdown edits. The personal Markdown workspace is editable, not a disposable export. Checkbox changes and CLI progress changes synchronize in both directions. Preserve free-form prose and unknown sections. If both representations edit the same supported field differently, surface a conflict with both values and require an explicit resolution; never silently overwrite either side. A rescan must preserve personal work even if a suggested exercise disappears, and should expose stale links.
- The current guide's generated portions come from repository evidence. Managed section markers and a generation snapshot preserve unrelated human prose and surface conflicting edits; an existing unmarked guide is not overwritten. Later layouts must retain this reconciliation behavior. Optional linked Transfer context remains future work.

## Content and evidence contract

The guide should start with a concise system overview and a map of supported entry points, modules, data stores, integrations, background work, and relationships. A curated concepts section should distinguish data shapes from business meanings. Show a few complementary, connected journeys where source permits, each with entry, inputs, decisions and alternate exits, visible read/write attempts, helper or job continuations, gaps, and relevant code/tests to inspect for a change. Describe setup and operations from checked-in evidence, and keep precise unknowns prominent. Sparse repositories may have fewer journeys. Avoid flat dependency lists, invented business purpose, and unsupported call graphs.

Every material statement should carry a source label: **observed in code**, **inferred**, **supplied by a person**, or **runtime unverified**. Observed claims cite repository-relative files, symbols, or lines where available. Inferences state their basis and uncertainty. Person-supplied context links to its Handover Item ID when applicable. Commands found in a README or Compose file are documented commands, not proof they work. Use **runtime unverified** until someone actually executes and records a result. Do not invent business purpose, production behavior, verified run commands, successful recovery, or competence scores.

The personal workspace turns the guide into exercises with an objective, starting guide link and evidence, concrete outcome, and space for notes, questions, and completion evidence. Exercises should ultimately use the selected concepts and journeys to ask for an explanation, a likely change point, and a recorded local observation or exact blocker. A checkbox is self-reported progress, not proof of system behavior or ownership readiness. An engineer or organization decides readiness.

### First personal workspace slice: progress compatibility

The personal workspace has four fixed `v2:` exercise IDs based on learning outcomes, not source locations or legacy plan tasks. Its canonical state and last-synced checkbox snapshot live in `.transferkit.local/onboarding-v2.json`; `tk onboard sync` imports checkboxes and `tk onboard task <v2-id> <status>` updates the matching checkbox without replacing prose. With a managed guide and personal workspace, `plan` shows the v2 exercises and `status` leads with v2 progress and questions. The older `.transferkit.local/onboarding-progress.json` keeps its schema, task IDs, statuses, and timestamps; legacy progress appears in a separate status section, and the legacy plan remains the fallback when v2 files are absent. There is no automatic one-to-one mapping from repository-specific legacy tasks to broader v2 exercises. A future migration must use an explicit, versioned mapping for genuinely matching tasks, retain unmapped records and timestamps, and surface ambiguous matches for review. A checked v2 box records self-reported completion only; Notes, Questions, and Evidence do not change status. An existing personal Markdown file is never regenerated over human edits.

## Implementation sequence and acceptance

The initial repository-only guide and personal workspace slices are implemented. Follow the ordered [deep guide slices](ONBOARDING_DEEP_GUIDE_PLAN.md) for acceptance fixtures, bounded tracing, concepts and continuations, setup, adaptive exercises, guide regeneration, and a real repository-only newcomer assessment. The four existing `v2:` IDs and legacy progress must survive later improvements.

### Slice 0 acceptance cases

These are source-grounded assertions for tracing and rendering review. Use the neutral source under `fixtures/onboarding-deep-guide/` and the small JavaScript app under `fixtures/onboarding-plain-node/`. Positive claims must cite the listed source; negative claims must remain absent or be explicit gaps. Test semantic claims and citations rather than whole Markdown whitespace.

| Case | Required claim and citation | Forbidden claim |
| --- | --- | --- |
| Early throw | `service.ts:44` throws when `valid` is false; later calls are on a different path. | The invalid path reads, saves, queues, or returns an order. |
| Exclusive branch | `service.ts:47-50` assigns either priority or standard status under distinct conditions. | Both status assignments happen on one path. |
| Repeated helper | Both call sites at `service.ts:52-53` link to `OrderService.recordAttempt` at `service.ts:69`. | One invocation is silently collapsed, or constructor injection becomes a call. |
| Local manager alias | `service.ts:54-62` records a query-runner alias, write-like `manager.save`, and separate commit/catch/finally calls. The interface at `service.ts:18-27` has no implementation body. | A write committed, rollback succeeded, or all branches ran. `CacheSnapshot.save` at `service.ts:65` is database persistence. |
| Possible continuation | Enqueue call `service.ts:64` and handler registration `worker.ts:7-10` share `assign-order`; `worker.ts:9` returns before the read when the ID is empty. | The job ran, an empty ID reads a record, or `ArchiveWorker` at `worker.ts:14-16` is connected to this enqueue. |
| Plain Node overview | `src/server.js:1-22` exposes a health path and in-memory parcel lookup; `README.md:3-5` documents `npm start`. | A database, verified run, business purpose beyond the README, or a NestJS flow is invented. |

Before calling a guide slice readable, a reviewer should locate each selected journey's entry, at least one cited decision or explicit lack of one, an alternate exit where present, the first unsupported edge, and likely change/test files within the journey section. Every substantive behavioral sentence should be verifiable at its cited source. Keep broad inventories out of the opening section; if a small fixture lacks evidence for a journey, say so rather than filling space. This is a reviewer rubric, not an automated understanding score.

Milestone 9 remains open until the deep repository-only guide and personal workspace pass their gates and an unfamiliar engineer completes the repository-only assessment. If no engineer is available, report that gate as pending. Milestone 10 separately evaluates handover-assisted onboarding and broader real-world outcomes. Optional v3 Item enrichment remains a separate later addition, never a prerequisite for repository-only use.
