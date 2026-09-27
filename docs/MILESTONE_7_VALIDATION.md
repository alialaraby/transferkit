# Milestone 7 Validation

Date: 2026-09-24

## Coverage re-audit — 2026-09-27

The coverage behavior below supersedes the earlier coverage findings in this document. Milestone 7 remains open; the real Debtbox acceptance test has not been run.

| Area | Result | Current evidence and limit |
| --- | --- | --- |
| Requirement-based coverage | PARTIAL | The plan now separates recorded HUMAN knowledge from coverage. Free-form requirements need an explicit confirmation stored by requirement ID; repository requirements require matching OBSERVED evidence. INFERRED evidence remains uncovered. This is an honest assertion by the outgoing engineer, not semantic proof that the prose is useful. Existing legacy interview answers remain recorded but unconfirmed. |
| Guided workflow | PARTIAL | Numbered answers can be saved without coverage; one confirmation can cover a grouped answer. A later `confirm` action shows saved notes and supports resume. Status repeats incomplete topics, and session progress counts topics addressed separately from coverage. Generic prompt wording and fatigue on a large backend remain untested. |
| Knowledge classification | PARTIAL | OBSERVED, INFERRED, HUMAN, and UNKNOWN remain distinct. Matching observations can establish coverage; inferred identity is shown as unconfirmed. Human notes require an explicit sufficiency decision. |
| Critical business flows | PARTIAL | Suggested flows stay unconfirmed until the maintainer accepts them. A confirmed or manual flow needs purpose, entry point, main path, business rules, failure paths, and retry/recovery, each documented and explicitly confirmed. Every confirmed flow gets its own critical handover requirement, so one complete flow does not hide another incomplete flow. The tool cannot judge the semantic accuracy of confirmed details. |
| Handover Audit v2 | PARTIAL | Audit, status, export, and gap counts consume the same plan coverage. Audit labels saved but unconfirmed knowledge; export labels its maintainer notes as coverage incomplete. Real engineer trust and receiver usefulness remain unvalidated. |

Validation: 142 tests passed across 36 files; typecheck, lint, format check, and Node 25 build passed. A bundled CLI smoke test on a temporary copy of `fixtures/realistic-nestjs` confirmed that a saved unconfirmed answer remains a critical gap, then confirmation closes that requirement and export shows the maintainer note. The earlier 132-test count and piped-input failure below describe the 2026-09-24 snapshot, not this re-audit.

## Decision

**Milestone 7 remains open.** The implementation passes automated checks and a realistic fixture can complete the CLI workflow in an interactive terminal. Several core behaviors are only partial. The roadmap also explicitly requires a handover on Debtbox or another backend that its outgoing engineer knows deeply, followed by that engineer's trust judgment. Neither happened in this audit. `Run Milestone 7 acceptance test` remains unchecked.

The statuses below assess behavior, independently of the existing implementation checkmarks in `docs/ROADMAP.md`.

## Implementation checklist audit

| Checklist item | Result | Concrete evidence and limit |
| --- | --- | --- |
| Handover Standard v2 | PASS | `handover-standard-v2.ts` defines all 24 roadmap areas and critical, recommended, and optional requirements without framework dependencies; `handover-standard-v2.test.ts` checks composition. Individual areas are broad, but the standard is a coverage model rather than a questionnaire. |
| Adaptive handover planning | PARTIAL | `adaptive-handover-plan.ts` combines the standard, findings, saved knowledge, flows, and custom topics; its tests show conditional activation and retained answers. Adaptation is concentrated in messaging, jobs, integrations, and data. It does not model payment-specific callback/reconciliation topics or reprioritize broad areas from evidence. |
| Guided handover workflow | PARTIAL | `guided-handover.ts` and `guided-handover.test.ts` cover start, next, status, resume, skip, and grouped notes. On the fixture, `next` presented a generic “Why it matters” sentence and Architecture showed package/framework evidence before the module finding because it takes the first five references. A note is copied to every requirement in its group without checking whether it covers each one. Piped input to the bundled CLI failed with `Error: readline was closed`; interactive terminal input worked. |
| Requirement-based coverage | PARTIAL | `handover-plan.ts` and `handover-coverage.ts` deterministically count covered, missing, skipped, not applicable, and gaps by priority; tests pass. Because one grouped answer can cover several requirements regardless of its content, counts can overstate actual knowledge transfer. |
| Knowledge classification | PARTIAL | `handover-plan.ts` supports OBSERVED, INFERRED, HUMAN, and UNKNOWN and distinguishes evidence from answers. Observed cadence/endpoint facts suppress those prompts. `semantic-integrations.ts` can classify provider identity as INFERRED, but that inference is not passed to plan observations or shown as an unconfirmed fact in the guided workflow. |
| Repository context | PARTIAL | `handover-context.ts` detects entry points, modules, controllers/routes, services, guards, relations, and log calls, with a focused test; existing scanners supply jobs, messaging, configuration, and deployment files. The fixture's Architecture prompt displayed five generic package/framework references and hid the `AppModule` reference, so relevant project structure did not consistently reach the engineer. |
| Semantic external integrations | PARTIAL | `semantic-integrations.ts` groups by SDK service, static host, or inferred configuration/class name, with explicit unknown identity and grouping tests. The fixture export used `partner.example.test`, never axios/fetch, but provider purpose remains unknown; authentication evidence and related modules are only shallowly derived and are not rendered as a useful integration profile. Repeated call-site evidence fills many topic entries. |
| Critical business flows | PARTIAL | `business-flow.ts`, `business-flows.ts`, and their tests support suggested/manual flows, confirm, rename, ignore, and incremental field documentation. Fixture suggestions were generic consumer/job method names. The base “Critical flows and failure paths” requirement can be answered and marked covered without confirming or documenting any structured flow. No end-to-end business relationship is inferred. |
| Incremental handover sessions | PASS | `handover-state.ts` persists active/paused state, current topic ID, and addressed IDs. `guided-handover.test.ts` covers pause, rescan, and resume; an interactive fixture run paused and resumed on `system-overview.purpose`, then advanced to Architecture. Piped input remains a CLI input limitation. |
| Custom topics | PASS | `addGuidedTopic` persists topics; the planner links them to knowledge; status/audit/export include them. `adaptive-handover-plan.test.ts` and `guided-handover.test.ts` cover the path. |
| Handover Export v2 | PARTIAL | `handover-package-v2.ts` and export tests produce ownership-oriented pages, observed facts, maintainer notes, evidence, gaps, and a single-file version. After one fixture note, the package had 6/46 covered requirements; `remaining-gaps.md` was 112 lines of the 287-line multi-file package. Integration and async pages repeat evidence for unanswered topics, and sections without knowledge/evidence are omitted. Receiver usefulness has not been tested. |
| Handover Audit v2 | PARTIAL | `handover-coverage-audit.ts` groups by area, prioritizes critical gaps, and labels covered, missing human knowledge, missing repository context, skipped, and not applicable; renderer and CLI tests pass. It inherits the grouped-answer overcount, so a “covered” label need not mean the note substantively answers the requirement. |

## Product behavior audit

A temporary copy of `fixtures/realistic-nestjs` was the strongest realistic fixture available. It is a small NestJS shipment service, not a production backend. The bundled CLI ran `handover init`, `scan`, `start`, `status`, `next`, `audit`, `flow list`, and both multi-file and single-file `export`. Interactive `next` saved and `resume` restored a paused session. The original fixture and external repositories were untouched.

| Product question | Result | Fixture observation |
| --- | --- | --- |
| Major areas identified? | PASS | `start` listed 24 standard areas even though scanning found only 19 findings. |
| Sensible order? | PARTIAL | System Overview then Architecture followed critical-first order; the order is mechanical by area and priority, with no maintainer assessment. |
| Important categories prevented from being forgotten? | PARTIAL | Business domains, flows, failure/recovery, ownership, and tribal knowledge remain in the plan. Broad one-line requirements may miss important subtopics. |
| Project-specific repository context? | PARTIAL | Jobs, RabbitMQ, partner host, and Docker appeared; Architecture's first five references were package/framework facts, while `AppModule` was hidden in the prompt. |
| Observable facts not re-asked? | PARTIAL | Cron cadence, consumer name, HTTP operation, endpoint, and database technology were OBSERVED. Broad architecture/codebase prompts still ask for explanations despite related evidence, which may be useful but is not narrowly targeted. |
| Semantic integrations? | PARTIAL | Export used `partner.example.test`, not transport libraries. It did not establish a human-readable provider name or purpose. |
| Critical flows capturable? | PARTIAL | Consumer and job suggestions exist and manual flow capture is tested. The initial flow requirement can be marked covered without a documented flow. |
| Incremental completion? | PASS | Interactive `save` set `Session: paused`; `resume` accepted a note and status showed `Session: active · 1 topics addressed`, with Architecture next. |
| Critical gaps obvious? | PASS | Fixture audit showed 28 critical, 11 recommended, and 1 optional gap after the note, grouped by area. |
| Export useful to receiver? | PARTIAL | The package conveys a maintainer overview and source references, but at this stage it mostly conveys unanswered topics and repeated evidence. No receiver reviewed it. |

## Old failure modes

| Failure mode | Result | Audit finding |
| --- | --- | --- |
| Handover mainly structured around scanner entities | PARTIAL | Top-level plan is standard-led, but conditional areas generate per-consumer, per-job, and per-integration requirements. |
| Axios/fetch shown as integrations | PASS | Provider subject was `partner.example.test`; no axios/fetch labels appeared in the exported package. Legacy persisted scanner entities can still name `NestJS HttpService`, but guided plan/export do not use that as the provider. |
| Generic repeated questions | PARTIAL | One grouped prompt avoids one question per field, yet the “Why it matters” text is generic and evidence repeats across related requirements. |
| Humans asked for observable facts | PARTIAL | Several facts are observed and suppressed; broad topics can still ask the engineer to explain areas for which partial code context exists. |
| Flat technology inventory presented as system understanding | PARTIAL | The system overview contains the maintainer note, but also a simple `NestJS, RabbitMQ, PostgreSQL` technology list with no interpreted relationships. |
| Export dominated by “Missing critical” | PARTIAL | The literal phrase is absent and topic pages include known facts; `remaining-gaps.md` is 112/287 lines after one note, and evidence-only entries repeat heavily. |
| No clear handover order | PASS | `start` names a beginning and `status` names the next area; `next` selects critical requirements first. |
| No practical resume/session behavior | PASS | Interactive terminal pause/resume persisted correctly across processes. Piped answers failed; see limitations. |

## Validation commands and results

- `npm test`: **132 passed across 36 files**.
- `npm run typecheck`: **passed**.
- `npm run lint`: **passed**.
- `npm run format:check`: **passed**.
- `PATH=/opt/homebrew/bin:$PATH npm run build`: **passed** using installed Node.js 25; bundle created at `packages/cli/dist/index.js`. The repository requires Node.js 24 or newer.
- Bundled CLI on a temporary fixture copy: `init`, `scan`, `start`, `status`, `audit`, `flow list`, multi-file `export`, and `export --single` succeeded. `next`/`resume` worked through an interactive terminal. Piping answers to `next`/`resume` failed with `Error: readline was closed`, leaving the session active; this was observed, not fixed during this audit.

## Remaining work before acceptance

1. Prevent a broad or grouped note from automatically counting unrelated requirements as covered; make the coverage claim defensible without turning guidance into a giant questionnaire.
2. Ensure confirmed or manual critical flows, with enough actual business detail, are required before flow coverage is treated as complete. Improve suggested starting points beyond generic method names where deterministic relationships exist.
3. Surface the most relevant structural evidence first and present integration identity, operations, configuration, and authentication context without repeated evidence-only sections. Carry inferred facts into the plan as unconfirmed.
4. Review export with a receiving engineer and refine pages that convey mostly gaps or repeated references.
5. Run the roadmap acceptance test on Debtbox or another backend with its outgoing engineer. Compare the guide with that engineer's own handover list, capture missed areas and false coverage, and ask the roadmap trust question directly. This manual experiment is the final gate; the green fixture checks do not replace it.

The old `tk handover interview` command and entity-oriented state remain for compatibility. The guided commands, audit, and export use the v2 plan; the legacy path was not removed in this audit.
