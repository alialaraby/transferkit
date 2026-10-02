# Human-first onboarding — Phase 0 acceptance baseline

**2026-10-03.** This is a local planning and evaluation artifact. It locks the examples and answer keys for the [human-first plan](ONBOARDING_HUMAN_STORY_PLAN.md); it does not certify the current guide or close Milestone 9. The generated guides were made in disposable copies and are reproducible with:

```text
npm run build
python3 experiments/onboarding-phase6-regression.py \
  --out /tmp/<new-directory> \
  --debtbox /path/to/debtbox-backend \
  --madar /path/to/b2c-backend
```

This run used TransferKit HEAD `cb7c25e3e371` **with existing uncommitted onboarding changes**; the built CLI bundle SHA-256 was `379501c91fc9a921ac4455224aa6b57c1a8c06d2bf79f3e809021fa34fd348ad`. Debtbox was archived at `e0267736a40a3181aae1c463782fe0f0436975c7`; B2C at `79cc98e534a95a2a316c3464281619fb86a12d99`. No evaluated application, dependency installer, container, migration, or endpoint was run. The results and complete generated Markdown from this run are in `/tmp/tk-human-phase0-20261003-verified/`; the script can recreate them if temporary files are removed.

## Baseline measurements

“Opening words” counts the generated **Start here + System map** text after removing markup and link targets. Time is one local first run of `tk onboard guide`; peak RSS is macOS `wait4` child `ru_maxrss`. These are indicators, not performance benchmarks. All checked Markdown source links resolve to a file and line in their disposable snapshot; that check does not prove the sentence is true.

| Case | Guide bytes | Opening words | Featured source journeys | Guide time | Peak RSS | Source links / broken | Guide SHA-256 prefix |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Plain Node app | 2,985 | 82 | 0 | 0.151 s | 134.0 MiB | 2 / 0 | `6187bd05d292` |
| Nest queue + scheduled worker | 8,101 | 76 | 2 | 0.310 s | 187.2 MiB | 42 / 0 | `f46b829ae799` |
| Branch/transaction negative fixture | 10,824 | 79 | 2 | 0.321 s | 194.3 MiB | 70 / 0 | `33c5e769b38a` |
| Non-Nest Event Count CLI | 2,999 | 86 | 0 | 0.148 s | 115.0 MiB | 2 / 0 | `9f7e0ad88deb` |
| Sparse Python CSV utility | 2,845 | 71 | 0 | 0.150 s | 123.3 MiB | 1 / 0 | `43e539d8fd20` |
| Debtbox | 90,145 | 122 | 4 | 1.282 s | 302.5 MiB | 337 / 0 | `03c6ced17676` |
| B2C backend | 99,899 | 123 | 4 | 6.425 s | 712.9 MiB | 359 / 0 | `155f8e88edb3` |

The extra branch fixture protects existing path precision during later narrative changes. B2C and Debtbox remain below the earlier 2× time and 1 GiB RSS budgets on this run. Larger guides have short openings but require the reader to infer relationships from long journeys.

**Representative current output:** B2C begins its map with “Bootstrap: src/main.ts creates AppModule” and selected controller → service targets; its first featured journey is fleet assignment. The CLI quotes “reads a newline-delimited JSON event file and prints a count for each event type” but then says “No source journey was selected” and “No supported route candidate was found.” The Python case quotes its README purpose yet also asks how to start the app despite the documented `python3 compare.py` command. These are short excerpts from the generated files identified by the hashes above, not proposed wording.

## Answer keys and short human references

These are **reviewer keys**, not text for the generator to copy. “Purpose” below is either a checked-in statement or a bounded reading of code. The five questions in each case are: (1) purpose, (2) important concepts, (3) normal path, (4) alternate or independent path, and (5) first change/test/observation. The improvement gate is that a newcomer can find supported answers quickly and sees unsupported answers labeled as questions.

### B2C backend — large delivery service

**Human reference:** [B2C newcomer working guide](B2C_BACKEND_HUMAN_ONBOARDING_REFERENCE.md). It reads the repository around a shipment and separates internal mobile-driver actions from external fleet callbacks. Business terminology and operational ownership remain owner questions.

1. **Purpose:** Source supports a service coordinating B2C shipment creation, assignment, progress, and related financial workflows; no credible project-purpose paragraph exists in the starter README. `src/module/shipment/services/shipment-b2c.service.ts:648`, `src/module/fleet/services/mobile-fleet.service.ts:67`, `src/module/integrations/integrations.service.ts:630`, `src/module/invoice/invoice.service.ts:723`.
2. **Concepts:** Shipment, its history, vendor, fleet/driver, transaction and invoice have distinct code roles. Business definitions of vendor/customer/seller need an owner. `src/module/data/entity/shipment.entity.ts:103,157,250,293,364,387,402,434`.
3. **Normal path:** B2C creation checks duplicate identifiers; a mobile fleet assignment checks shipment/fleet/driver eligibility and writes assignment/history; driver pickup checks status and vendor configuration. These are separate entry points around the same shipment, not a proven automatic call chain. `shipment-b2c.service.ts:663–717`, `mobile-fleet.service.ts:78–239`, `pickup.service.ts:150–251`.
4. **Alternate/independent path:** An external fleet webhook has fleet/AWB/history gates and may return early; cancellation/RTO handling differs from the mobile-driver path. Invoice updates are a separate financial workflow. `integrations.service.ts:630–780`, `invoice.service.ts:723–840`.
5. **First action:** For an assignment rule, inspect controller → service guards → shipment/history → related tests. For a safe observation, read `GET /health-check` only in an approved local environment; it proves an HTTP response, not dependency health. `mobile-fleet.controller.ts:22–40`, `mobile-fleet.service.ts:67–149`, `src/module/health-check/health-check.controller.ts:20–29`.

**Current guide gap:** It features fleet assignment, webhook, pickup and invoice as independent traces but omits shipment creation from the featured set and gives no explanation of their relationship. Its starter README yields no project description. A review of selected decisions and source citations found no material false branch or transaction assertion; the main failure is story omission and reading burden, not a demonstrated false runtime claim.

### Debtbox — debt and consent paths

**Human reference:** The [illustrative Debtbox fixture](ONBOARDING_V2_DEBTBOX_FIXTURE.md) gives a short source-backed debt creation/consent story. It is a design target, not measured newcomer success or an owner-approved business mission.

1. **Purpose:** Code supports merchant debt creation, customer consent, payment status and related notifications. Broader product mission and business priority are not established by repository evidence. `src/module/debt/debt.controller.ts:37,54`, `src/module/payment/payment.controller.ts:50`.
2. **Concepts:** Merchant, customer, debt, debt consent and payment are distinct records/roles; the exact commercial meaning is an owner question. `src/module/debt/debt.service.ts:100–155,267–302`.
3. **Normal path:** Debt creation validates merchant/customer/business, rejects a pending duplicate, then attempts separate debt, consent and notification saves. `debt.service.ts:104–199`.
4. **Alternate path:** Consent checks ownership, pending status and expiry. Acceptance sets active and may attempt signature/Sanad work; rejection sets cancelled. A caught signature-upload error does not prove that all effects completed. `debt.service.ts:273–356`.
5. **First action:** Start with the matching controller and service, then inspect affected repositories and tests before changing a guard. A local run requires verified prerequisites; the generated guide has no verified execution. `debt.controller.ts:37–80`, `debt.service.ts:100,267`.

**Current guide gap:** It selects payment status first and renders debt creation and consent as separate long traces; it does not state their shared record and business question up front. Prior Phase 6 spot checks found no material false branch/transaction claim in selected excerpts; a full owner review is still needed for business meaning.

### Plain Node app — supported source, no TypeScript trace

**Human reference:** The project is a small parcel-status HTTP service. `src/server.js:1–22` creates `/health` and a `/parcels/` lookup over an in-memory `Map`; `README.md:3–5` documents `npm start` and `PORT`. It has no persistent store in this fixture.

1. **Purpose:** Health and parcel-status lookup, as stated by README and visible in source.
2. **Concepts:** A parcel ID maps to an in-memory status; there is no domain entity or database declaration.
3. **Normal path:** A request to `/parcels/parcel-1` finds the map entry and returns status with 200 (`src/server.js:10–17`).
4. **Alternate path:** Missing parcel returns 404; unmatched route returns 404 (`src/server.js:13–20`).
5. **First action:** Change or test route behavior in `src/server.js`; `npm start` is documented but was not run for this baseline.

**Current guide gap:** It quotes the README and names the entry file but gives no source journey, route behavior, or change location. “No supported route candidate” describes scanner coverage, not the absence of HTTP behavior.

### Nest queue + scheduled worker — no credible product purpose

**Human reference:** This is a neutral test fixture. Its README is a Nest starter, so no business purpose should be invented. `ParcelController.dispatch` calls a service that reads a repository and publishes a literal `assign-parcel` job to `parcel-jobs`; a separately scheduled `ParcelJobs.inspect` also reads the repository. The matching worker declares an empty `process` body, so no job effect is established. `controller.ts:5–12`, `service.ts:10–20`, `worker.ts:3–7`, `scheduled.ts:6–10`.

1. **Purpose:** Unknown beyond exercising route, queue and schedule declarations; starter README cannot supply one.
2. **Concepts:** Parcel repository, queue publication, worker registration and scheduled inspection are code roles, not a verified business flow.
3. **Normal path:** The dispatch route delegates to the service; the service read precedes a literal queue `add` attempt (`controller.ts:8–10`, `service.ts:12–15`).
4. **Alternate/independent path:** `other-jobs` and dynamic job names are not a proven continuation to the `parcel-jobs` worker. The scheduled read is independent, not a result of dispatch (`service.ts:16–19`, `scheduled.ts:7–10`).
5. **First action:** To change the publication, inspect `service.ts` and `worker.ts`; to change the schedule, inspect `scheduled.ts`. No runtime queue processing or test result was verified.

**Current guide gap:** It correctly labels a possible continuation and a separate scheduled handler, but does not explain why these are separate starting points in one short paragraph. The README is correctly not promoted to project purpose.

### Non-Nest Event Count CLI — input to output

**Human reference:** The fixture reads a newline-delimited JSON file and prints sorted counts by event `type`, without a database or network call. `README.md:3–5`, `src/cli.js:1–29`. Its story is command → file → parse/validate → count → stdout, not an HTTP route or entity lifecycle.

1. **Purpose:** Count event types in a local JSONL file, from README and source.
2. **Concepts:** Input path, event `type`, count map and stdout are the important artifacts (`src/cli.js:4–24`).
3. **Normal path:** With a file path, it reads nonempty lines, parses JSON, counts types and prints sorted results (`src/cli.js:9–24`).
4. **Alternate path:** Missing input prints usage and sets exit code 2; malformed JSON or non-string `type` prints an error and sets exit code 1 (`src/cli.js:5–7,14–27`).
5. **First action:** Inspect `src/cli.js` for validation/output changes; the documented command needs a file argument. A disposable JSONL input can be used for a safe first observation if a person chooses to run it.

**Current guide gap:** It quotes the purpose and entry file, yet asks which test/install commands exist and shows `npm run start` without the required file argument. “No route candidate” is irrelevant to a CLI; no change or failure path is offered.

### Sparse Python CSV utility — unsupported language, honest fallback

**Human reference:** The README states that a small Python script compares item counts in two CSV files and writes nonzero differences to stdout. `compare.py:5–18` shows dictionary loading and `actual − expected` for each item. Deployment, owner and tests are not documented.

1. **Purpose:** Compare expected and actual CSV counts, from `README.md:3` and `compare.py:5–18`.
2. **Concepts:** Two input CSV files, `item` and `count` columns, and difference rows. There is no supported Node/Nest entity model.
3. **Normal path:** Given two paths, load both dictionaries and print each nonzero difference in sorted item order (`compare.py:10–18`).
4. **Alternate path:** Missing arguments exit with usage; invalid file/column/count can raise an error because there is no local handling (`compare.py:5–12`).
5. **First action:** Inspect `compare.py` and the documented invocation in `README.md:5`; a person may use disposable CSV files for a safe observation. Test command and real data source remain unknown.

**Current guide gap:** It quotes the README but says “confirm the application start command” even though the README provides one. Its route-candidate language is irrelevant, and it gives no input/output or change explanation. This is a product usefulness gap rather than a proven false behavioral claim.

## Negative cases and review boundary

- Do not turn a starter README into a business purpose (Nest worker, B2C).
- Do not join B2C creation, mobile assignment, external webhook and invoice into a single automatic call chain; their shared shipment record is a supported relationship, their chronology is not established for every case.
- Do not say Debtbox consent acceptance, signature storage or notification succeeded from static calls. Preserve the rejected/expired branches.
- Do not describe an empty worker body as having processed a parcel or a scheduled read as caused by a queue publication.
- Do not describe in-memory Node/CLI/Python fixtures as having a database, or treat “no Nest route candidate” as “the repo has no entry point.”
- Do not assert tests are absent when only trace-adjacent test discovery failed. Distinguish **not found by this scan** from **verified absent**.

The small fixture source was read directly for these keys. For B2C and Debtbox, the prior [Phase 6 spot check](ONBOARDING_PHASE6_ACCEPTANCE.md#accuracy-and-readability-review) validated selected entry/decision citations, while this baseline reviewed representative paths and guide omissions. It is not a complete manual audit of every statement in the two large generated guides. The real unfamiliar-engineer comparison remains pending.
