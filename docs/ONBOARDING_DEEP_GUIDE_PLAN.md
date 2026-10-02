# TransferKit onboarding: deep, evidence-backed system guide

**Implementation plan and Codex prompts · 30 September 2026**

## 1. Product contract

An engineer with no handover should be able to use `tk onboard guide` and the personal onboarding workspace to understand the main concepts and connected behaviors of an unfamiliar Node.js/NestJS repository, locate a likely first change, attempt a local observation, and identify the few questions that code cannot answer. The shared guide must be valuable without a Current Owner, Transfer state, network service, paid API, or AI model. Human context may improve it but cannot be required.

“Understand roughly 60%” is an aspiration, **not** a score emitted by the CLI. Acceptance depends on an unfamiliar engineer explaining important behavior and locating a change correctly. Static analysis cannot establish business intent, production topology, actual runtime effects, or ownership without suitable evidence.

### Known starting point

- Already reported as implemented: shared `ONBOARDING.md`; repository scans and candidate routes; two Debtbox static explained flows; documented setup clues; preservation of human Markdown through managed sections and snapshots; optional owner-written context and verified-setup sections; personal `.transferkit.local/ONBOARDING.md`, four stable `v2:` exercises, local JSON state and Markdown sync; v2-aware `plan` and `status`. Verify all details against current code before changing them. The uploaded guide predates some reported changes.
- Baseline at TransferKit `cb7c25e3`: plain Node fixture has no flow; small Nest fixture has empty handlers; Debtbox has two explanations; Madar B2C has three shallow candidates and no explanation. Madar generation was 5.705 s and 607.3 MiB peak RSS on one local run. These are reference measurements, not universal limits.
- An isolated TypeScript compiler API experiment resolves route-to-method and cross-file declarations. It detects Madar's conditional `queryRunner.manager.save` call sites and a Debtbox local helper, but has no execution-path model, cannot resolve local query-runner methods without dependencies, and loads 1,481 project TS files / approximately 497 MiB for one Madar route. It is **research, not production code**. The project already uses `ts-morph`; no new package is justified by that spike.
- `docs/ONBOARDING_V2.md` and historical `ROADMAP.md` portions may describe earlier status. Current code and current repository docs take precedence. The user considers Handover milestones 7 and 8 complete; this work stays within onboarding.

### Boundaries

- Only Node.js/TypeScript and supported NestJS patterns are promised in this sequence. A plain Node/JavaScript project must receive an honest, useful overview of what is actually discoverable; rich Nest behavior must not be falsely generalized to every Node project. Add a second runtime/framework adapter only after a representative fixture proves the need.
- No mandatory local AI, remote AI, paid service, auto-install, auto-running migrations, containers, or arbitrary project scripts. Existing local compute and libraries are sufficient for this plan.
- Do not change Handover behavior. Optional v3 Handover Item enrichment is a later, independent addition after repository-only onboarding succeeds. Do not block this plan on it.
- Preserve guide prose, managed section conflict handling, personal notes, progress, existing stable IDs, and legacy progress. Never silently overwrite or remap them.
- Scanner output is evidence; it is not the reader-facing product. Accuracy outranks breadth; depth must not turn a possible path into a guaranteed outcome.

## 2. Final user experience and output contract

### CLI journey

1. `tk onboard guide` scans read-only and creates or safely updates a shared root `ONBOARDING.md`. An existing unmarked guide is never overwritten. A concurrent human/generated section conflict is surfaced without changing either version.
2. `tk onboard workspace` creates a personal Markdown workspace linked to stable guide anchors; repeated runs must preserve personal notes and progress or explicitly refuse a destructive reconciliation.
3. `tk onboard plan` shows the learning path for the repository, not a generic inventory of technologies. `tk onboard status` distinguishes self-reported exercise completion, recorded observations, and outstanding questions. `tk onboard sync` and `task` retain their current conflict and checkbox semantics.
4. The guide explains useful code paths without needing a handover file. A user may optionally select a route/symbol to focus on if automatic selection misses their work area; this must not invent a ranking of business importance.

### Shared guide reading order

1. **Start here:** a short orientation from reliable project text and observed interfaces. If the repository does not state its business purpose, describe the technical shape and explicitly leave purpose unknown. No story from names alone.
2. **System at a glance:** entry points, interfaces, data stores, background work, and boundaries. Show only supported relationships; a small diagram is optional when it conveys more than a table.
3. **Concepts:** a curated glossary of entities/data shapes and relationships relevant to selected journeys. Distinguish data shape from the business meaning of a term.
4. **Connected journeys:** several complementary paths where evidence exists. For each: entry, inputs, checks, alternate branches/early exits, state reads and writes, continuations across helpers/modules/queues/jobs, external boundaries, error behavior, exact gaps, and **where to change it** (code and relevant tests). A tiny service may need one journey; a large one may need more than two. No fixed number is a quality metric.
5. **Run and observe:** repository-specific documented prerequisites/commands, contradictions, a safe proposed first observation, and a clear distinction between documented and actually observed results. The shared owner-supplied verified setup remains optional.
6. **Remaining questions:** a short, deduplicated, answerable list derived from concrete gaps. Distinguish code to inspect, runtime to check, and business/operations to ask a person.
7. **Reference appendix:** full inventories of routes, modules, jobs, integrations, and citations in collapsed sections; no first-screen wall of names.

### Illustrative final output (fictional repository)

This compact example shows the expected **substance and order**. `ParcelWorks` and its file locations are fictional; Codex must ground actual golden fixtures in real test source. Large repositories would have more complementary journeys; small ones may have fewer.

```markdown
# Understand ParcelWorks

The README describes a service for delivery requests and fleet assignment
(`README.md:8`). The source exposes shipment and tracking routes, stores
Shipment and Assignment records, and declares an assignment worker.
Production behavior has not been observed.

## Start here

A request creates a pending Shipment. A separate worker may assign a Fleet.
A tracking update can later mark a Shipment delivered. Those are distinct
steps: saving a request does not prove that assignment or delivery occurred.

## Concepts

| Concept | What source establishes | Where it changes |
| --- | --- | --- |
| Shipment | Customer, destination and status fields (`shipment.entity.ts:12`) | Creation service; tracking handler |
| Assignment | Relates shipment, fleet and driver (`assignment.entity.ts:9`) | Assignment worker |

## Journey 1 — Create a shipment

**Entry:** `POST /shipments` → `ShipmentController.create`
(`shipment.controller.ts:28–36`).

1. The controller calls `ShipmentService.create` (`:35` →
   `shipment.service.ts:41`).
2. The service loads the customer and checks the destination. A missing
   customer throws before the save (`shipment.service.ts:46–58`).
3. On the path past those checks, it assigns `PENDING` and awaits a
   repository save (`shipment.service.ts:63–70`).
4. It calls `assignmentQueue.add` with the new ID (`:72–76`). The call is
   visible; worker receipt is unverified.

**If you change this:** inspect the DTO, `ShipmentService.create`, the entity,
the creation test, and the assignment worker that reads the saved ID.

**Gap:** The save precedes the queue call. Source inspection alone cannot say
how an operator handles a saved shipment when the queue call fails.

<details><summary>Code and tests</summary>

- `src/shipment/dto/create-shipment.dto.ts:5–27`
- `src/shipment/shipment.service.ts:41–76`
- `src/shipment/shipment.service.spec.ts:30–104`

</details>

## Journey 2 — Assign a fleet

The requested job name at `shipment.service.ts:73` matches the handler
registration at `assignment.processor.ts:18–22`. This is a possible code
continuation, not proof that the job ran.

The worker loads the Shipment and returns if it is no longer pending (`:25–34`).
It asks `FleetSelectionService` for candidates. Its no-candidate branch does
not create an Assignment (`:37–49`). On a candidate branch it calls
`queryRunner.manager.save` for an Assignment and updates Shipment status
(`:54–71`). Commit, rollback and release calls are present (`:73–88`);
transaction outcomes remain unverified.

**If you change assignment rules:** inspect `FleetSelectionService.select`,
the no-candidate path, Assignment fields, and worker tests.

## Run and observe

The README documents an install and start command. Compose declares Postgres
and Redis and references `.env`. Values and prerequisites are incomplete.
`GET /health` is a declared route (`health.controller.ts:12`), a possible first
check once setup is safe. TransferKit has run no command. Record your attempt
and actual result in `.transferkit.local/ONBOARDING.md`.

## Questions left

1. What should happen if the queue call fails after the Shipment save?
2. Who resolves the no-candidate branch, and how?
3. Where does a newcomer obtain safe local configuration?

<details><summary>Other routes, jobs, modules and source references</summary>
The complete navigable inventory appears here.
</details>
```

The personal file should link to these real guide anchors and contain tasks such as “Explain creation and assignment,” “Locate a safe change,” and “Record a local observation or blocker,” with editable notes, questions and evidence. It must not duplicate the entire shared guide.

### Evidence language

Every substantive generated claim has a source type and navigable repository-relative evidence. Use four distinct meanings:

| Source type | Allowed wording | Disallowed leap |
| --- | --- | --- |
| Code declaration/call | “The method calls `X`”; “the code assigns `status = Y` under condition Z” | “X succeeds”; “the shipment becomes Y in production” |
| Project documentation/comment/test | “The README says …”; “a nearby comment describes …”; “the test expects …” | Treating a statement or test as proof of current runtime behavior |
| Human-supplied/recorded observation | “Owner reports …”; “newcomer ran … and observed …” | Silently merging it with code-derived fact |
| Inference/unresolved edge | “These declarations suggest …”; “the receiver cannot be resolved” | A fabricated method link, provider identity, transaction outcome, or business rule |

An `await` proves only that source awaits a call, not that external delivery succeeded. A `.save` call is a visible write attempt, not a committed write. A `commitTransaction` call is not a verified commit. A matched event publication/handler is a possible continuation, not proof of processing.

## 3. Small internal model required to support the guide

Build the smallest onboarding-specific intermediate representation that holds **path-aware claims** before rendering; do not create a generic whole-product graph framework. Keep core types framework-independent, scanners responsible for source findings, standards responsible for selection/explanation, renderers responsible for Markdown, and CLI responsible for orchestration.

- **Location:** repository-relative path, line range, optional symbol, origin (`code`, `doc`, `test`, `person`, `observation`). Never read secret values into output.
- **Entry:** resolved route/handler, scheduled job, event/queue consumer, or an honest unknown starting point. Stable identity based on normalized route/symbol and source path, not raw line number alone.
- **Call edge:** caller symbol, call site, declared target if uniquely resolved, edge kind (`direct`, `declared target`, `candidate`, `unresolved`), and exact evidence. Constructor injection/module import is a declaration edge, never a call edge. A declared TypeScript method is not a guaranteed runtime override.
- **Path event:** read-like call, write-like call, assignment/status transition, guard, throw, return, catch/finally, external effect, publish/consume, or unsupported construct. Include branch context and source order **within that context**. Record `await` separately. Repeated calls to the same helper retain distinct call sites and calling contexts, even if its body is analyzed once.
- **Gap:** reason, first source location, affected journey and consequences for explanation. Include dynamic dispatch, alias uncertainty, unavailable dependency, recursion/depth/fan-out limit, unsupported control flow, and unverified runtime effect.
- **Journey:** entry plus ordered path segments, distinct branches/exits, cross-file continuation, related entities, tests, source claims, and gaps. No global flattened sequence across mutually exclusive branches.

The tracer must not require a full control-flow theorem prover. Support common `if/else`, guard returns/throws, `try/catch/finally`, and simple call expressions; mark loops, switches, callbacks, dynamic dispatch, and complex expressions as bounded partial coverage unless implemented precisely. A limit stops traversal with a visible gap rather than silently dropping the rest.

## 4. Ordered implementation slices and copy-ready Codex prompts

**Handoff requirement:** Keep this file at `docs/ONBOARDING_DEEP_GUIDE_PLAN.md` in the local TransferKit checkout (or attach it to the Codex task and change the reference accordingly). The short prompts below are **not standalone specifications**. Codex must read the full product contract, internal model, slice deliverable/gate, and cross-cutting checklist before editing. If the file is unavailable, Codex should stop and ask for it rather than implement from a short prompt alone. Copying only one paragraph without the plan is insufficient.

### Progress checklist

Complete one slice and review its gate before starting the next. Check only a slice with a demonstrated passing gate; keep a failed or unrun gate open.

- [x] Phase 1 — Acceptance contract and fixtures
  - [x] Slice 0 — Lock acceptance contract and neutral fixtures
- [x] Phase 2 — Bounded, path-aware tracing (Slices 1–4)
  - [x] Slice 1 — One bounded analysis context
  - [x] Slice 2 — Path-aware trace representation
  - [x] Slice 3 — Cross-file method continuation
  - [x] Slice 4 — Local receiver aliases and transaction-like calls
- [x] Phase 3 — First deep guide and concepts (Slices 5–6)
  - [x] Slice 5 — First deep journey in the guide
  - [x] Slice 6 — Concepts and data effects
- [x] Phase 4 — Continuations, journey selection, and repository context (Slices 7–9)
  - [x] Slice 7 — Continuations across jobs/events/queues
  - [x] Slice 8 — Complementary journey selection and user focus
  - [x] Slice 9 — Repository knowledge and orientation
- [x] Phase 5 — Setup, personal learning path, and reading experience (Slices 10–12)
  - [x] Slice 10 — Practical setup and recorded observation
  - [x] Slice 11 — Adaptive personal learning path
  - [x] Slice 12 — Guide reading UX and regeneration
- [ ] Phase 6 — Regression and newcomer assessment (Slice 13)
  - [ ] Slice 13 — Independent acceptance, regression, and release docs
    - [x] Repeatable fixture and pinned application regression, with measurements and source spot checks
    - [x] CLI/product documentation and unfamiliar-engineer protocol
    - [ ] Real unfamiliar-engineer repository-only comparison and misleading-claim review

The phase boxes summarize progress; the slice gates below control completion. Milestone 9 can close only after the repository-only guide and personal workspace pass their gates and a real unfamiliar engineer completes the repository-only assessment in Slice 13. Milestone 10 separately tests handover-assisted onboarding and broader real-world outcomes. If no engineer is available, record the assessment as pending and leave Milestone 9 open.

Phase 2 gate evidence, including neutral negative cases, Madar/Debtbox excerpts, and measured budgets, is recorded in [the depth baseline follow-up](ONBOARDING_DEPTH_BASELINE.md#phase-2-structured-trace-review-2026-09-30). The structured trace is not rendered in the guide until Slice 5.

Run one prompt at a time. Review the generated guide and acceptance evidence before the next. Each prompt is restricted to its item; do not let Codex pre-implement later slices. Codex should use the **current** checkout as truth, preserve unrelated changes, avoid commits, and report what it actually tested. If a slice's gate fails, fix that slice before moving forward.

For **every** slice, the report back must include: (1) changed files and exact scope; (2) an actual generated or structured before/after excerpt, including a negative case; (3) tests and checks run with results; (4) measured performance when analysis changes; (5) unsupported patterns and remaining gaps; (6) whether the slice's gate passed. A test count or broad “works on Madar” statement alone is insufficient. Use neutral fixtures to prove generic behavior, then real repositories as regression checks. Do not copy private repository source or secrets into the public TransferKit fixtures.

### Slice 0 — Lock the acceptance contract and fixtures

**Deliverable:** Refresh onboarding design and Milestone 9 checklist to reflect the current implementation, the target output above, and the baseline/spike. Add or adapt neutral fixtures for branch exits, helper calls, aliases, transaction-like manager calls, and a cross-boundary continuation. Include a plain JavaScript/Node fixture with source entry point and documented run command, so overview usefulness is tested on more than a package-only fixture. Do not rewrite historical roadmap sections or mark real newcomer validation complete. Capture small golden assertions for *claims and citations*, not a huge whitespace snapshot.

**Gate:** The docs no longer claim existing guide/workspace/sync functionality is merely planned; neutral fixtures encode both positive and negative claims; the plain Node fixture has discoverable source and documented setup; no onboarding production behavior changes.

**Prompt 0**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially the product contract, final output, Slice 0 deliverable/gate, and cross-cutting checklist. Work only on onboarding design/acceptance. Read the current code, docs/ONBOARDING_V2.md, the canonical Milestone 9/10 roadmap sections, and docs/ONBOARDING_DEPTH_BASELINE.md before editing. Align the spec and only those roadmap sections with what is actually implemented; preserve historical ROADMAP content and all unrelated edits. Specify the standalone repository-only guide, connected journeys, concepts, change points, setup limits, precise questions, and separate personal progress. Add small neutral source fixtures/acceptance cases for if/else, early return/throw, repeated helper call, local manager alias, and publication/handler pair, with negative assertions against false sequential paths and invented effects. Add a plain JavaScript/Node source fixture with a documented run command and expected overview claims. Do not implement tracing/rendering yet, edit Handover, mark newcomer validation complete, or commit. Return changed-file list, acceptance cases and negative cases, checks, unresolved questions, and an explicit Slice 0 gate verdict.
```

### Slice 1 — One bounded analysis context

**Deliverable:** Reuse the `ts-morph` Project that `scanRepository` already creates once per scan to resolve selected routes; avoid loading a second TypeScript Program or constructing a project per journey. Preserve source discovery fallback when imports/tsconfig/dependencies are absent. Exclude dependencies/generated code and bound loaded files/methods. Instrument elapsed time and peak RSS in a reproducible local benchmark, not permanent user-facing noise.

**Gate:** Same method resolutions as the spike for a neutral fixture, Madar and Debtbox; missing dependencies do not crash the scan; multiple selected routes reuse the scan's existing Project. On the same machine, target no more than roughly 2× the baseline guide time and under 1 GiB peak for Madar; if missed, record where time/memory went and optimize before further expansion. These are an initial budget, not a universal promise.

**Prompt 1**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially Slice 1 and its gate. Implement only bounded selected-entry resolution using the ts-morph Project already created once in scanRepository. Read the baseline report and isolated spike, then current scanner architecture. Do not load a second Program or add a dependency without measured benefit. Resolve declarations for more than one selected route through this shared context, with explicit file/method/depth/fan-out limits, exclusions, and safe fallback when tsconfig or app dependencies are missing. Do not render deeper guide prose or change Handover. Add focused tests for multi-route reuse and missing-dependency fallback. Measure one-route and multi-route time/RSS on disposable Debtbox/Madar snapshots, compare with the baseline, and report actual figures and any budget failure. Return changed files, before/after resolution, tests, unsupported cases, and an explicit gate verdict. No commit.
```

### Slice 2 — Path-aware trace representation

**Deliverable:** Core trace/event types and scanner implementation for branch/exit-aware events. Keep called helper body separate from call-site context. Handle `if/else`, guard throw/return, `try/catch/finally`, source order, and unsupported constructs conservatively. Record call site and declaration as separate evidence. No generated prose yet.

**Gate:** Fixture proves no event after a guaranteed return/throw is described as occurring on that path; mutually exclusive writes stay separate; repeated helper calls retain two edges; nested argument evaluation is not flattened into an unsupported order; budget/depth stops are visible. Tests include loops/switch as explicit gaps.

**Prompt 2**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially the path-aware model, Slice 2 deliverable/gate, and cross-cutting checks. Implement the smallest path-aware onboarding trace representation, using the reusable analysis context. Include entry identity, call edges with call-site and declared-target evidence, path events with branch context, exits, and explicit gaps. Support common if/else, early return/throw, try/catch/finally, and direct calls. Do not merge exclusive branches into a straight-line story. Analyze a helper body once if useful, but preserve each invocation's call-site/branch context. Unsupported loops, switches, callbacks, or dynamic expressions must produce bounded gaps rather than disappear. Keep the model framework-independent and the scanner responsible for AST behavior. Add neutral positive/negative tests; do not change guide rendering or Handover. Return structured before/after trace including a negative path, tests, unsupported syntax, and explicit gate verdict. No commit.
```

### Slice 3 — Cross-file method continuation

**Deliverable:** Follow uniquely resolved direct calls from a controller into injected concrete services, same-class helpers, and further local methods up to a bounded depth. Retain ambiguity on interfaces, dynamic dispatch, overrides, aliases, and unavailable bodies. Classify repository `get/find/save` names only as read-like/write-like when their target and/or call site supports that label; do not claim I/O happened.

**Gate:** Madar selected route gains cited reads and guard branches; Debtbox fee helper is visible; the neutral interface/dynamic cases remain unresolved; no method-call edges from DI/module import alone; every followed edge has two locations.

**Prompt 3**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially Slice 3 and its gate. Extend only onboarding's structured trace to follow bounded cross-file source method calls using TypeScript symbols: route handler to concrete injected provider, same-class helper, and further local method. Require an unambiguous declared target and retain both call-site and declaration evidence. Keep interface-typed, dynamic, inherited-without-body, external, and ambiguous targets as explicit gaps. Constructor injection and module imports are not calls; a declared target is not proof of runtime dispatch. Test neutral cases and compare the structured trace with Madar MobileFleetService.assignDriverToTruck and Debtbox DebtService.addDebt on disposable source snapshots. Do not yet synthesize a new guide layout or add AI/dependencies. Report new edges and any false edge. No commit.
```

### Slice 4 — Local receiver aliases and transaction-like calls

**Deliverable:** Follow simple local provenance such as `const queryRunner = this.dataSource.createQueryRunner()` far enough to retain call sites for `queryRunner.manager.save`, `commitTransaction`, `rollbackTransaction`, and `release`. If the manager implementation cannot be resolved, mark these calls **write-like/transaction-like with unresolved target**. Do not infer atomicity, commit success, rollback success, or which branches executed. Other common local aliases may be supported only when proven by a neutral fixture.

**Gate:** Madar's three conditional save call sites remain in their respective branch contexts and cite exact source; neutral fixture with a similarly shaped alias works; unrelated `.save` method is not mistaken for confirmed persistence.

**Prompt 4**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially Slice 4 and its gate. Add narrowly proven local receiver provenance to the onboarding trace. Cover a local variable initialized by an injected object call and subsequent chained method calls, as in queryRunner.manager.save; classify visible calls conservatively when an external library body is unavailable. Keep conditional paths, await flags, catch/finally, commit/rollback/release calls and their source evidence separate. Never say a write committed or rollback succeeded. Test a neutral manager-alias fixture plus Madar's assignDriverToTruck; add a negative fixture where an unrelated object's save method must not be described as a database write. Do not touch Handover or write guide prose beyond what is required to expose the structured result. Report exact supported patterns and stop edges. No commit.
```

### Slice 5 — First deep journey in the guide

**Deliverable:** Convert one selected structured trace into readable Markdown: entry, checks, path past checks, alternative paths, visible state/write attempts, external boundary, and exact gaps. Provide “where to change” links for relevant code and tests where discoverable. The candidate fallback must show the useful partial trace and first gap instead of hiding evidence behind an all-or-nothing explanation gate. Preserve guide markers, snapshots, human prose, and conflicts. Do not expand to many journeys yet.

**Gate:** Madar fleet route is more useful than its former controller→service pointer; Debtbox creation remains accurate; empty Nest fixture stays a candidate; a stranger can verify every behavioral sentence at cited source. No fake completed assignment/transaction statement.

**Prompt 5**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially the final output contract and Slice 5 gate. Render exactly one evidence-backed onboarding journey from the new structured trace into ONBOARDING.md. Prefer a selected route with meaningful paths; otherwise show the supported partial path and precise first gap. Include entry, guarded reads, mutually exclusive decisions, attempted writes/effects, error path, source references, and relevant change/test locations. Distinguish declaration, static call, unresolved target, and runtime outcome without repeating boilerplate in every line. Retain existing section IDs or provide safe anchor migration; preserve managed-guide snapshot reconciliation and human prose. Show fresh guide excerpts for Madar fleet assignment, Debtbox debt creation, and a neutral empty handler, and prove they contain no false sequence. Focused tests plus normal build/lint/format. No Handover/ROADMAP edits or commit.
```

### Slice 6 — Concepts and data effects

**Deliverable:** A journey-linked glossary using supported TypeORM entities/columns/relations (and existing data-store findings). Map reads/writes to entities only when types or calls support it. Select concepts touched by featured journeys, show direct relations, and put full inventories in references. Do not equate an entity or field name with its business meaning. For non-TypeORM projects, describe the supported data shapes/store evidence or omit the glossary gracefully.

**Gate:** Debtbox and Madar guides explain which records selected journeys touch; unrelated entities do not flood the first screen; neutral project with two entities and a relation is accurate; plain Node stays honest.

**Prompt 6**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially Slice 6 and its gate. Add a curated Concepts section to onboarding, grounded in TypeORM entity declarations and actual selected-journey read/write references. Capture entity symbol, relevant fields/relations, and cited paths; show how concepts connect to the journey without inventing business definitions or database behavior. Do not list every entity in a large repo in the main section. Support a neutral two-entity fixture, inspect Debtbox and Madar generated excerpts, and keep graceful output for a project with no TypeORM. Preserve guide edits/anchors and do not touch Handover. Test evidence correctness and noise limits; report any relation syntax not supported. No commit.
```

### Slice 7 — Continuations across jobs/events/queues

**Deliverable:** Match an observed publication/enqueue to a declared handler only where a concrete topic/job name, registration, and compatible evidence support the connection. Treat HTTP callbacks as separate entries unless a code-level identifier links them. Connect scheduled work to concepts it actually reads/changes; do not imply it ran because it is scheduled. Stop at ambiguous, dynamic, external, or framework-dependent edges.

**Gate:** Neutral publisher/consumer fixture yields a labeled possible continuation; mismatched or dynamic topic yields no edge; selected Debtbox/Madar examples are connected only where supported; performance budget still holds.

**Prompt 7**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially Slice 7 and its gate. Extend onboarding journeys only across demonstrable asynchronous declarations: enqueue/publish call and matching queue/event handler registration with concrete compatible identifiers. Cite both endpoints and label the link a possible continuation; never claim delivery, ordering across processes, or successful processing. Support one framework pattern actually present in the evaluated repositories plus a neutral fixture; do not build a generic plugin system. Keep scheduled jobs as separate entries unless source provides a defensible data/identifier link. Add negative tests for dynamic/mismatched topics. Show one connected and one deliberately unconnected generated example, with timing/RSS impact. No Handover edits or commit.
```

### Slice 8 — Complementary journey selection and user focus

**Deliverable:** Deterministic selection that rewards source depth and *novel coverage* of entities, entry types, and boundaries, rather than names such as debt, consent, customer, or payment. Avoid picking near-duplicate CRUD routes when a distinct job or integration path teaches more. Allow an optional explicit `--focus` route/symbol selector after verifying current CLI conventions. Selection does not claim business criticality. Tiny repositories may have zero or one supported journey.

**Gate:** Madar no longer shows only three shallow pointers when deeper eligible paths exist; Debtbox retains accurate creation/consent and can add a distinct journey when evidenced; a neutral non-payment fixture selects sensible paths; stable results across repeat scans.

**Prompt 8**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially Slice 8 and its gate. Replace onboarding's fixed name-biased route selection with deterministic evidence-depth and complementarity selection. Choose a small set of distinct journeys that cover different supported entities/entry types/boundaries; scale the count with available evidence instead of hardcoding two explanations. Do not assign business importance from centrality or names. Add an optional user-selected --focus route/symbol only if it fits the existing CLI and can be resolved safely; keep default fully automatic. Test duplicate CRUD routes, distinct job/route paths, neutral names, sparse repos, stable tie-breaking and no Debtbox-specific terms. Show selected and rejected candidates with reasons on Madar, Debtbox, and neutral fixtures. No Handover changes or commit.
```

### Slice 9 — Repository knowledge and orientation

**Deliverable:** Source-attributed project description if credible project documentation exists; relevant explanatory comments, tests, examples, and migration notes next to selected journeys. Comments are source statements, not verified truth. Do not indiscriminately mine every Git commit or copy huge README sections. Filter starter boilerplate, stale/contradictory statements, secrets, generated files, and irrelevant comments. Keep owner-written System context optional and intact.

**Gate:** A neutral fixture with a useful handler comment and a generic starter README surfaces the former and does not present the latter as a bespoke product description; Madar's reconciliation comment is surfaced if that journey is selected, without claiming the comment's operational policy was verified; no unrelated context dump.

**Prompt 9**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially Slice 9 and its gate. Enrich onboarding orientation and selected journeys with relevant checked-in text: a credible project description where present, a nearby explanatory source comment, related tests/examples, and specific migration notes where linked. Attribute each statement to its source; a comment or test is not runtime proof. Suppress obvious starter README boilerplate and unrelated text. Do not read or print secret values, scan all Git history, or invent product purpose. Preserve owner-written System context byte-for-byte. Test a neutral project with a real comment and starter README, then show concise excerpts on available Debtbox/Madar snapshots. No Handover edits or commit.
```

### Slice 10 — Practical setup and recorded observation

**Deliverable:** Improve project-specific setup from README/package scripts, Compose, config examples, migration/seed declarations, and a declared health route. Build a proposed sequence and explicit blockers/contradictions. Do not run commands automatically. Permit personal workspace recording of attempted command, date, observed result, and blocker without claiming shared verification. Preserve optional owner-written verified setup and avoid secrets.

**Gate:** Generic Nest starter commands are labeled generic/documented; Madar/Debtbox prerequisites and contradictions that are actually in the repository appear as questions; no app command runs during `guide`; an attempted observation is attributed to the person, not generated evidence.

**Prompt 10**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially Slice 10 and its gate. Make onboarding's Run and observe section project-specific. Derive only declared services, env variable names (never values), package scripts, migrations/seeds, build prerequisites, and a possible health route from repository files. Distinguish documented steps, inferred ordering, missing prerequisites, and user-recorded observations. Improve the personal workspace so a newcomer can record exact commands attempted, date, result, and blocker in Markdown while preserving current sync/prose behavior; never automatically install, run migrations, start containers, or call an endpoint. Retain owner-written Verified local setup. Test a plain Node repo, a neutral Compose fixture, and available Debtbox/Madar outputs. No Handover edits or commit.
```

### Slice 11 — Adaptive personal learning path

**Deliverable:** Replace the generic four-exercise content with tasks tied to the actual guide: map important concepts, explain two connected journeys where available, locate a hypothetical change point, record a safe observation or blocker, and answer or classify remaining questions. Keep separate shared knowledge and local personal state. Stable exercise identities must survive rescans; migration of existing four `v2:` IDs must be explicit and lossless, or keep them as stable umbrellas with guide-specific subgoals. If a journey disappears, retain work and flag a stale link.

**Gate:** Existing checked boxes, notes, questions, evidence and legacy JSON remain intact; sync conflicts still protect both sides; tasks are meaningful in sparse and complex repos; self-reported completion is never a competence certification.

**Prompt 11**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially Slice 11 and its gate. Align personal onboarding exercises with the new guide's actual concepts, selected journeys, setup and gaps. Before coding, document how the four existing v2 IDs and personal JSON/Markdown progress will migrate or remain stable; implement the smallest lossless strategy. Retain user prose, checkbox sync, conflict detection, legacy progress, and stale-link visibility when a guide changes. Do not infer competence from completion. Test rerun after journey selection changes, existing completed v2 tasks, personal notes and conflicting edits, plus sparse-repo behavior. Show a realistic personal workspace and plan/status output. No Handover edits or commit.
```

### Slice 12 — Guide reading UX and regeneration

**Deliverable:** Final content order, compact orientation, journey-focused headings, readable tables or small Mermaid only where supported, collapsed citation/inventory appendix, stable anchors, and concise language. Generated claims remain reviewable; owner context/verified setup remain clearly human-supplied. Preserve old marked guide sections and snapshots through a defined upgrade/reconciliation path; unmarked guides are never overwritten.

**Gate:** New guide is substantially easier to read without losing depth; generated claims can be verified at references; no human edit disappears on re-generation; stale snapshot/markers and conflicting edits fail safely; `guide` idempotent when source unchanged.

**Prompt 12**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially Slice 12 and its gate. Polish only onboarding's shared Markdown reading experience after the deeper content exists. Order: Start here, system map, concepts, connected journeys, change points, Run and observe, specific questions, collapsed reference appendix. Use clear prose and compact source references; move long module/integration inventories out of the first screen without deleting their evidence. Add a small diagram only when every edge has supported meaning. Preserve existing owner sections, free-form human prose, managed markers, snapshot conflict handling, stable links and idempotent regeneration; define a safe upgrade for older marked guides and refuse unmarked ones. Test human edits, conflicting edits, changed findings and identical reruns. Show complete outputs from one small and one large fixture. No Handover/ROADMAP changes or commit.
```

### Slice 13 — Independent acceptance, regression, and release docs

**Deliverable:** Repeatable fixture regression and a real unfamiliar-engineer assessment, first on repository-only onboarding. Evaluate whether they can explain main concepts, two connected behaviors where present, an alternate/failure path, and likely files for a small change; attempt setup or identify an exact blocker; list remaining questions. Compare with reading the repository without TransferKit. Inspect false statements manually against code. Record first-run time/memory and confidence limits. Update docs and Milestone 9 status only to the level demonstrated. Milestone 10 requires actual newcomer evidence, not Codex simulation. Optional v3 enrichment can be separately planned after repository-only acceptance.

**Gate:** No material false call/branch/transaction assertions in the evaluated guides; an unfamiliar engineer can complete the tasks with fewer irrelevant searches/questions than baseline, and misleading claims are recorded and fixed before calling the work validated. If tests do not show improvement, keep the milestone open and investigate the failure.

**Prompt 13**

```text
Read docs/ONBOARDING_DEEP_GUIDE_PLAN.md in full, especially the newcomer protocol and Slice 13 gate. Perform onboarding-only acceptance and regression. Run the finalized guide/workspace on a small plain Node repo, a neutral Nest fixture, Debtbox, and Madar using disposable snapshots. Compare with docs/ONBOARDING_DEPTH_BASELINE.md: selected journeys, depth, false edges/claims, guide size/readability, time and peak memory. Manually spot-check each material assertion and source citation in selected journeys. Prepare a short unfamiliar-engineer task protocol comparing repository-only reading with TransferKit-assisted reading; run it with a real engineer only if one is actually available, otherwise label it pending and do not claim validation. Record task correctness, change-point identification, first local observation or blocker, remaining business questions, and misleading output. Update onboarding spec, CLI/README docs and only relevant Milestone 9/10 checklist statuses based on evidence. Preserve historical roadmap content; do not touch Handover or commit. Provide generated guide/workspace excerpts, measurements, failures, and exact outstanding acceptance gaps.
```

## 5. Cross-cutting acceptance checklist

Apply after every slice that changes behavior:

- **Truth:** Each generated behavioral claim is supported by cited code/doc/test/person/observation; no unqualified production outcome. No module-import → method-call conversion, no false provider identity, no sequential merge of exclusive branches.
- **Depth:** At least one selected journey on a meaningful repository goes beyond controller→service to decisions and data effects; later, complementary journeys explain distinct paths and supported continuations.
- **Graceful limits:** Empty handlers, missing tsconfig/dependencies, JavaScript/plain Node, dynamic dispatch, unsupported syntax, and sparse repos produce explicit partial coverage or omission, not invented detail or a crash.
- **Generic behavior:** Neutral fixtures must prove each pattern independently of Debtbox and Madar names; no hardcoded route/domain/provider terms.
- **Safety:** Guide generation is read-only with respect to the target application, never executes application code, and never emits env values/secrets. Generated Markdown and state reconciliation protect human work.
- **Stability:** Stable anchors/identities, deterministic selection, repeat generation, existing personal progress, and legacy behavior survive the changes.
- **Performance:** Measure the whole guide pipeline, not an isolated tracing process, on the same large repository/revision and machine; report RSS/time, number of loaded files and selected routes. Record a budget miss as a blocker, not a successful gate.
- **Human utility:** The final acceptance uses newcomer tasks and spot-checked code, not test count, line count, or an external rating alone.

For subjective guide gates, use the [Slice 0 reviewer rubric](ONBOARDING_V2.md#slice-0-acceptance-cases): a reviewer must find a cited decision or explicit lack of one, an alternate exit where present, the first unsupported edge, and likely change/test locations within each selected journey. Check every substantive behavioral sentence against its cited source and keep broad inventories out of the opening section. Report the review result and any exception, rather than declaring a guide “more useful” from length or route count.

### Newcomer evaluation protocol

Recruit an engineer who has not worked on the evaluated repository. Give them the repository and a small, realistic hypothetical change or bug **without** providing a handover. Record the baseline with the repository's ordinary docs, then use a comparable task or another unfamiliar repository with TransferKit; do not imply the two conditions are perfectly controlled if the tasks differ. Avoid coaching during the timed portion.

Use a short answer key prepared by someone who knows the source. Ask the engineer to (1) explain the key records and two distinct paths, (2) identify what happens on one alternate path, (3) point to the files/tests they would inspect for the change, (4) try a safe first observation or identify the exact setup blocker, and (5) list questions requiring a teammate. Score **correct/partly correct/unsupported**, record elapsed time and misleading guide claims, and compare the unanswered questions. A self-reported confidence rating can be collected but is not the acceptance measure. Keep any unresolved business question visible rather than treating it as a failure of code tracing.

## 6. Decisions and stopping rules

1. **No new dependency by default.** The TypeScript compiler API worked in the spike and `ts-morph` already exists in the project. Adopt another library only for a measured missing capability or significant maintainability gain.
2. **Do not build a universal call graph.** Trace a bounded set of selected entries, retain source evidence, and expose gaps. Whole-repository transitive tracing would amplify memory, noise, and incorrect paths.
3. **Do not add more journeys to hide shallow explanations.** If a selected journey cannot say what code checks or changes, inspect the failure edge first. Partial explanation is allowed when precisely bounded.
4. **Do not invent a business story.** Useful technical understanding is achievable from code; business intent is sourced from credible text/humans or remains a specific question.
5. **Keep optional v3 enrichment separate.** Once independent repository-only onboarding is validated, v3 items may add attributed business intent/ownership by stable ID without overriding code evidence or personal progress. That is a later slice, not a prerequisite or part of this implementation sequence.
6. **Pause at an accuracy/performance gate.** Correct the model or reduce scope before proceeding to prose polish. Preserve the baseline report, benchmark scripts, and generated examples as review evidence.
