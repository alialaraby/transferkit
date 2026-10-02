# Human-first onboarding guide enhancement plan

**Status:** Phase 0 complete; Phases 1–5 pending. The [Phase 0 acceptance baseline](ONBOARDING_HUMAN_STORY_PHASE0_BASELINE.md) records cross-repository answer keys and measurements. This follows the existing [repository-only deep guide work](ONBOARDING_DEEP_GUIDE_PLAN.md). Its source traces, evidence rules, personal workspace, and safe regeneration remain the foundation. Milestone 9's real unfamiliar-engineer assessment is still open.

## Why this change is needed

The current guide is good at showing *where code is* and *what a bounded static trace saw*. It is weak at answering the first questions of a solo newcomer: **What does this repository do? What are its important things? How does work enter, move, and finish? Which path should I read for my task?** The [B2C reference guide](B2C_BACKEND_HUMAN_ONBOARDING_REFERENCE.md) demonstrates the desired reading experience, but its shipment vocabulary and lifecycle are examples, not a template to hard-code.

In the current pipeline, `onboarding-journey-selection.ts` scores method counts, checks, writes, and continuations; `onboarding-concepts.ts` ranks entities by nearby calls; `onboarding-guide.ts` renders those selections largely as declarations and events. `onboarding-repository-notes.ts` extracts a short README paragraph and nearby comments. None of these creates a repository-level purpose, groups related paths into a supported workflow, or explains why a developer should read one path before another. The B2C guide therefore has 807 lines and 359 links while leaving the newcomer to assemble the system story.

## Target result

The first screen of `ONBOARDING.md` should orient a newcomer in plain language, then lead them from a relevant question to evidence. Use this order when the evidence permits:

1. **What this repository appears to do:** purpose, deliverable or service, inputs and outputs, and the limits of the claim.
2. **A small mental model:** three to five important records, actors, or artifacts and how they relate. Explain a term only when repository prose or behavior supports its meaning; otherwise give its code role and ask for business meaning.
3. **How work moves:** one representative path from an entry to an observable result, then a second genuinely distinct path or an alternate/failure path. State whether paths are causally connected, share state, or are merely related by name.
4. **Where and when to look:** a task-to-file/test map, a safe first investigation, setup prerequisites and exact blockers.
5. **What still needs a person:** business intent, ownership, operational recovery, and other facts that source cannot establish.

Put exhaustive traces, entity fields, module inventories, and secondary route candidates in a collapsed reference appendix. Keep every source claim inspectable. The guide may be short for a sparse or unsupported repository; it must never fill gaps with a plausible invented story.

### Generic shape, not a universal lifecycle

The same questions apply to a service, CLI, library, frontend, worker, or data job, but the nouns differ. A service may read as request → rule → state → response/event; a CLI as command → input → transformation → file/output; a library as public API → internal operation → return/error; a worker as trigger → handler → state/output. Select a shape only from observed entry and output evidence. If the repository is mixed or its purpose is unclear, show multiple candidate entry points and say what is unknown. NestJS, TypeORM, shipments, and invoices are never prerequisites for an intelligible guide.

## Evidence and writing rules

- **Every substantive sentence has provenance.** Use a small claim record carrying source locations and one of: repository statement, code observation, conservative inference, owner-supplied context, or unknown. A citation must support the *whole* sentence, not merely contain a matching symbol.
- **Keep causality strict.** A call edge, matched queue publication/handler, or explicit data dependency can connect steps. Shared entity names, imports, and chronological guesses make *related paths*, not a continuous workflow. State whether a write, notification, or external effect was attempted; do not assert runtime success from source alone.
- **Explain code in human terms without inventing policy.** “This check rejects a shipment already assigned to a fleet” is supportable from a guard. “The fleet has accepted commercial responsibility” requires a documented business rule or owner statement. Names alone do not define a business actor.
- **Use owner knowledge deliberately.** Reuse existing owner-editable `System context` and `Verified local setup` areas. Label owner statements and their author/date only when supplied; preserve them byte-for-byte across rescans. If owner context conflicts with code, show both and ask for review.
- **Respect repository boundaries.** Read only checked-in text/code needed for selected claims; skip secrets and values. Generation never installs dependencies, starts apps, runs migrations, or calls external services. The core remains framework independent; scanners emit evidence, standards choose and connect it, renderers format it, and CLI orchestrates.
- **Keep the first screen small.** Measure whether a reader can answer the five newcomer questions from the opening without expanding the appendix. Use size as a readability signal, not as proof of usefulness.

## Ordered implementation checklist

### Phase 0 — Lock a cross-repository acceptance set

- [x] Capture the current generated guide and a short human reference for **B2C, Debtbox, a plain Node app, a non-Nest CLI or library, a worker/job, and a sparse or unsupported-language repository**. Reuse existing fixtures where suitable; add only minimal new ones.
- [x] For each repository, write five answer-key questions: purpose, important concepts, one normal path, an alternate/independent path, and first change/test/observation. Mark which answers are source-supported, owner-supplied, or genuinely unknown.
- [x] Record baseline first-screen word count, guide size, selected paths, broken/unsupported claims, run time and peak RSS. Keep the B2C human guide as a **style and utility reference**, not as an expected string or universal domain model.

**Gate:** A reviewer can identify what a better guide must answer for each repository without assuming that every repository has HTTP routes, database entities, or a full lifecycle.

### Phase 1 — Build a cited repository story inventory

- [ ] Discover a small set of likely purpose statements from project-specific README sections and relevant checked-in docs. Detect starter/boilerplate text and avoid promoting it to project purpose. Inspect manifests, executable entry points, public APIs, commands, handlers, tests and configuration as corroborating evidence.
- [ ] Represent repository role, entry points, important data/artifacts, outputs, external boundaries, and safe observation candidates as typed, bounded claims with provenance and uncertainty. Keep this structured state separate from Markdown.
- [ ] Identify a few central terms from repeated use across entries and outputs, then attach only supported descriptions. An entity declaration alone gives a code role, not business meaning. Preserve exact evidence for rejected or ambiguous descriptions.

**Gate:** On B2C, the inventory can support “shipment is central” and distinguish vendor/fleet/driver relations without defining their business contracts. On a CLI/library it identifies commands/public APIs and outputs. On a sparse repo it gives a useful inventory plus explicit questions, with no invented purpose.

### Phase 2 — Connect and select stories, not just deep traces

- [ ] Group paths by *supported* shared state, call/event continuation, or documented workflow. Record edge type: direct call, possible asynchronous continuation, shared artifact, documented relation, or unproven association.
- [ ] Choose a representative entry and complementary path for newcomer coverage: where work starts, a key decision, state/output, and a failure or alternate path. Let a documented purpose and core record weigh more than raw method/branch count. Retain `--focus` for a developer's specific question.
- [ ] Do not force a single sequence. If creation, callback, and invoice are independent entry points touching the same record, show them as separate chapters around that record. If an edge is missing, state the first unsupported boundary and what to inspect next.
- [ ] Keep deep trace limits and negative cases: no false path joining, callback execution, transaction completion, provider delivery, or dynamic target certainty.

**Gate:** B2C selection explains shipment creation/assignment and distinguishes mobile status from external callbacks; Debtbox selects a coherent ownership-relevant path; a CLI/library follows its own input-to-output shape. Selected paths may differ when repository evidence differs, but each selection has a recorded reason.

### Phase 3 — Render the human reading path

- [ ] Introduce a short “What this repo does” and “How to read it” opening from Phase 1 claims, with visible inference/unknown labels where needed.
- [ ] Replace the opening entity inventory with a three-to-five-term glossary: term, code role, supported meaning, and why the newcomer will encounter it. Move relation and field lists to the appendix.
- [ ] Render each selected story as **why this path matters → trigger/input → decision → state or output → alternate exit → external boundary → where to change/test**, using brief prose and nearby grouped citations. Keep the raw event trace available in collapsed details.
- [ ] Add a task-to-file/test map and one safe first investigation chosen from actual code and test evidence. Do not say tests are absent merely because the current trace did not discover them.
- [ ] Keep setup specific: engine/version and meaningful declared dependencies, documented versus verified commands, safe observation, and blockers. Preserve the current guide markers, snapshot reconciliation, owner sections, and all personal workspace data.

**Gate:** A reviewer answers the five Phase 0 questions from the opening and stories without reading the appendix. Every behavioral sentence is supported by its cited code or clearly labeled as a repository/owner statement or inference. No human edit disappears on regeneration.

### Phase 4 — Align personal learning with the story

- [ ] Make the existing stable `v2:` exercises point to the new mental model, selected stories, change map, and safe observation. Keep their IDs, checked boxes, notes, questions, evidence and legacy progress intact.
- [ ] When source selection changes, preserve completed work and flag stale links. A checked exercise remains self-reported progress, never a competence certificate.

**Gate:** A newcomer can record what they understood, tried, and still need to ask without copying the whole guide. Sync and conflict tests continue to protect both Markdown and structured progress.

### Phase 5 — Independent accuracy, utility, and performance review

- [ ] Run all acceptance repositories from disposable snapshots. Compare old/new answers, guide size and first-screen readability, generation time, peak RSS, and exact citations. Manually inspect every material claim in the featured stories against source; record omissions and misleading wording.
- [ ] Ask an unfamiliar engineer to do repository-only tasks with and without the guide, using the existing [assessment protocol](ONBOARDING_PHASE6_ACCEPTANCE.md#unfamiliar-engineer-task-protocol--pending). Record correctness, irrelevant searches/questions, first safe observation or blocker, and misleading claims. A code-only self-review cannot close this gate.
- [ ] Fix material false claims and navigation failures before changing Milestone 9 status. Compare on multiple repository shapes; success on B2C and Debtbox alone is insufficient for the generic claim.

**Gate:** The new guide improves answer correctness or reduces irrelevant search/questions for actual newcomers across the evaluated shapes, has no material false behavioral claim, preserves human edits, and stays within the existing time/RSS budgets or documents an explicit reviewed exception. Keep the milestone open if no engineer is available.

## Deliberate limits

This plan does not add hosted services, implicit AI, runtime execution, new language-specific deep tracers, or a business ontology. A non-TypeScript repository can still get a useful overview from its own documentation, manifests, public entry points, tests, and artifacts; unsupported inner behavior remains a cited gap. Optional AI prose may be considered later only as an opt-in rewrite of vetted claims, never as a source of new facts.

Phase 0 is complete. The next implementation request can start **Phase 1 only**; later phases depend on its cited inventory, so the B2C example cannot quietly become the product template.
