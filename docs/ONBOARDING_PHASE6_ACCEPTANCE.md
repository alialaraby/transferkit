# Onboarding Phase 6 acceptance record

**2026-10-02 — repository-only regression complete; newcomer assessment pending.** This is a local acceptance record, not a claim that Milestone 9 has passed.

## Repeatable regression

Build TransferKit, then run `python3 experiments/onboarding-phase6-regression.py --out /tmp/<new-directory> --debtbox /path/to/debtbox-backend --madar /path/to/b2c-backend`. The script copies neutral fixtures and archives pinned revisions of the two application repositories into disposable directories. It runs only `tk onboard guide` and `tk onboard workspace`, saving each guide, workspace, and `results.json`. It does not install dependencies or run target applications. Debtbox and Madar paths are optional; omit an unavailable repository and mark that case untested.

| Snapshot | Selected journeys | Guide size | First guide run | Peak RSS |
| --- | ---: | ---: | ---: | ---: |
| Plain Node source fixture | 0 | 2,985 bytes | 0.166 s | 128.6 MiB |
| Neutral Nest queue/scheduled fixture | 2 | 8,101 bytes | 0.316 s | 185.8 MiB |
| Neutral branch/transaction fixture | 2 | 10,824 bytes | 0.326 s | 187.3 MiB |
| Debtbox `e0267736` | 4 | 90,145 bytes | 1.322 s | 300.1 MiB |
| Madar B2C `79cc98e5` | 4 | 99,899 bytes | 6.631 s | 720.9 MiB |

This is one local macOS run, so timings are indicative. Compared with the same pinned Debtbox and Madar revisions in [the original baseline](ONBOARDING_DEPTH_BASELINE.md), guide time is 1.18× and 1.16× respectively; both remain below the 2× and 1 GiB budgets. Guide size rose from 13,383 to 90,145 bytes for Debtbox and from 12,763 to 99,899 bytes for Madar. The opening map stays short and long inventories are collapsed, but a real reader has not yet judged whether the larger journey sections are readable. The new plain Node and neutral Nest fixtures differ from the baseline fixtures, so their run times are not a like-for-like performance comparison.

The plain Node map now quotes the README's health and in-memory lookup description, cites its declared `src/server.js` entry, and leaves runtime behavior unverified. It selects no traced journey because JavaScript bodies are outside the current TypeScript trace scanner. The neutral Nest guide links `ParcelController.dispatch` to a possible queue continuation and selects `ParcelJobs.inspect` separately; the mismatched worker is not connected. The neutral branch guide keeps the invalid-input throw separate from later reads, keeps priority/standard assignments mutually exclusive, lists transaction calls as attempts, and leaves callback/dynamic calls unresolved. Debtbox selects payment status, debt creation, email verification, and consent; Madar selects fleet assignment, webhook, pickup confirmation, and invoice update. These are source coverage choices, not a business-priority ranking.

## Accuracy and readability review

All rendered local source links were checked against the snapshot files and line bounds: 2 plain Node, 42 neutral Nest, 70 neutral branch, 337 Debtbox, and 359 Madar; no broken or out-of-range link was found. The neutral branch guide was reviewed against its entire six-file fixture for branch exits, repeated helper calls, manager alias, queue name matching, and unsupported edges. For each of the eight selected Debtbox/Madar journeys, the entry declaration and the first displayed decision or alternate throw were compared with the cited source. Representative matches: Debtbox payment missing-checkout guard at `payment.service.ts:278`, debt missing-merchant guard at `debt.service.ts:105`, email verification missing-customer guard at `customer-email-verification.service.ts:95`, consent missing-debt guard at `debt.service.ts:276`; Madar fleet missing-shipment guard at `mobile-fleet.service.ts:79`, webhook missing-shipment guard at `integrations.service.ts:649`, pickup status guard at `pickup.service.ts:159`, and invoice permission guard at `invoice.service.ts:725`. No material false call, branch, or transaction assertion was found in those checks. This is a spot check, not a manual reading of every line in the two large guides.

The source-linked journeys present an entry, a decision or an explicit lack of one, alternate exits where traced, an unsupported boundary, and initial change locations. Test locations are described as unestablished where no related test was found. The plain Node guide has only a README-based overview and declared start entry, and explicitly has no selected source journey. Readability remains a reviewer limit for the 90–100 KiB guides, especially their longer journey sections. No application behavior or setup outcome was verified.

## Unfamiliar engineer task protocol — pending

Use a real engineer who has not worked in the selected repository. A source-aware reviewer first prepares a short answer key for two comparable tasks in that repository, including expected record concepts, two paths, an alternate exit, likely change and test files, and a safe observation or exact setup blocker. Keep the answer key separate from the guide and participant.

1. Give the participant one task with repository files only. Record start/end time, source searches, questions asked, answer, first safe observation or blocker, and misleading material encountered.
2. Give a second comparable task with the generated guide and personal workspace available. Record the same data. Alternate task order across participants if more than one engineer is available; with one engineer, report carryover and task-difficulty limits rather than treating the comparison as controlled.
3. For each task ask the engineer to explain the key records and two distinct paths, identify an alternate or failure path, point to files/tests for a small change, try a safe first observation or name its exact blocker, and list questions requiring a teammate. Do not require risky setup commands or credentials.
4. Score each answer **correct**, **partly correct**, or **unsupported** against the prepared key, with citations. Count irrelevant searches and unresolved questions in both conditions. Record any misleading guide claim and fix it before declaring success. A confidence rating may be collected but is not the gate.

No engineer has completed this protocol. Therefore there is no measured repository-only newcomer improvement, and Milestone 9 remains **IN PROGRESS**. Milestone 10's handover-assisted assessment remains separate and untouched.
