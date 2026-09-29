# Illustrative Debtbox onboarding Markdown fixture

**Design target only — not current TransferKit CLI output.** This example uses the supplied Debtbox summary and repository-relative citations from the prior read-only Debtbox evidence report. These citations record that report's source inspection; this fixture involved no new Debtbox inspection, runtime execution, or tests.

## Target: shared `ONBOARDING.md`

### System overview

**Observed in code:** NestJS `main.ts` boots `AppModule`. The repository uses PostgreSQL with TypeORM and Redis-backed Socket.IO. Modules include merchant, customer, debt, payment, Nafath, notifications, and admin. In-process work includes scheduled reminders and a payout job. Integrations found: HyperPay, Nafath, Firebase, Alibaba OSS, and SMTP/Mailgun. Business purpose, deployment topology, and production behavior remain unknown.

<details><summary>Code references to inspect</summary>

- `src/main.ts:31`, `src/main.ts:62`, `src/main.ts:91` — bootstrap and Redis-backed Socket.IO adapter
- `src/app.module.ts:34`, `src/app.module.ts:54` — modules and scheduled work
- `src/module/data/data.module.ts:9`, `src/config/typeorm.config.ts:52` — TypeORM and PostgreSQL
- `src/module/shared/services/hyperpay/hyperpay.client.ts:25`, `src/module/nafath/nafath.service.ts:72` — HyperPay and Nafath
- `src/module/firebase/firebase.actions.service.ts:24`, `src/module/shared/services/alibaba-oss.service.ts:7`, `src/module/shared/services/email/email-provider.service.ts:22` — push, object storage, and email providers

</details>

### Architecture relationships

**Observed in code:** The boot module connects the application modules; TypeORM connects application data to PostgreSQL; Socket.IO uses Redis backing. The reminders and payout job run in process. **Inferred:** the module and provider connections suggest paths through debt, payment, notifications, and external integrations; inspect each path before treating it as a complete call graph.

<details><summary>Code references to inspect</summary>

- `src/app.module.ts:34`, `src/module/data/data.module.ts:9`, `src/config/typeorm.config.ts:52` — module and data relationships
- `src/utilities/redis-io.adapter.ts:20`, `src/module/shared/services/debt-gateway.socket.ts:41` — Redis-backed sockets
- `src/module/debt/debt-notification.service.ts:26`, `src/module/payment/payout-scheduler.service.ts:20` — in-process scheduled work

</details>

### Flow: debt creation and consent

**Observed in code:** A merchant endpoint starts debt creation. Validation and lookups lead to a pending debt and consent, then audit and notification work, with optional push. A customer endpoint checks ownership, status, and expiry. Acceptance sets active; rejection sets cancelled. Acceptance attempts signature storage and Sanad generation. Status changes trigger audit and socket updates.

**Inferred:** Separate saves and a caught signature-upload failure may allow partial outcomes. **Unknown:** Which records and side effects can remain after failure, and what recovery should an operator use? This is a question for tracing and a knowledgeable person, not an asserted production incident.

<details><summary>Code references to inspect</summary>

- `src/module/debt/debt.controller.ts:37`, `src/module/debt/dto/add.debt.ts:20` — merchant entry point and input
- `src/module/debt/debt.service.ts:100`, `src/module/data/entity/debt.entity.ts:53`, `src/module/debt/debt.service.ts:145`, `src/module/debt/debt.service.ts:175`, `src/module/debt/debt.service.ts:201` — checks, pending status, saves, audit, and notification
- `src/module/debt/debt.controller.ts:54`, `src/module/debt/dto/consent-debt.dto.ts:19`, `src/module/debt/debt.service.ts:274`, `src/module/debt/debt.service.ts:296` — customer entry point and consent checks
- `src/module/debt/debt.service.ts:302`, `src/module/debt/debt.service.ts:307`, `src/module/debt/debt.service.ts:325`, `src/module/debt/debt.service.ts:330`, `src/module/debt/debt.service.ts:339`, `src/module/debt/debt.service.ts:356` — status saves, signature failure handling, audit, and socket update
- `src/module/shared/services/sanad/sanad.service.ts:29`, `src/module/shared/services/sanad/sanad.service.ts:74` — Sanad generation

</details>

### Other flows to investigate

**Observed in code:** Payment and payout code, and new-customer onboarding through Nafath, are candidate flows. Their complete end-to-end paths and runtime outcomes are unverified.

<details><summary>Code references to inspect</summary>

- `src/module/payment/payment.controller.ts:16`, `src/module/payment/payment.service.ts:77`, `src/module/payment/payment.service.ts:169`, `src/module/payment/payout-scheduler.service.ts:59` — payment through payout starting points
- `src/module/merchant/merchant.controller.ts:167`, `src/module/merchant/merchant.service.ts:92`, `src/module/merchant/merchant.service.ts:113`, `src/module/nafath/nafath.controller.ts:14` — new-customer Nafath starting points

</details>

### Setup and operations

**Observed in repository documentation/configuration:** README lists npm run, start, and test commands. Compose defines PostgreSQL, Redis, and app services. Full setup is undocumented. **Runtime unverified:** No listed command or Compose configuration has been executed for this fixture. Check the port mapping against the app's default port before giving run instructions. Scheduler behavior, payout behavior, and recovery in production are unknown.

<details><summary>Repository references to inspect</summary>

- `README.md:76`, `README.md:82`, `README.md:95`, `package.json:8` — documented commands and scripts
- `docker-compose.yml:3`, `docker-compose.yml:36`, `Dockerfile:1` — local service definitions and container build
- `src/main.ts:112`, `docker-compose.yml:36` — default app port and Compose mapping to verify

</details>

### Unknowns and person-supplied context

- What is the system's business purpose and which flows matter most? **Unknown; no person-supplied answer.**
- What are the complete setup steps and verified run/test commands? **Runtime unverified.**
- How are partial debt-consent outcomes detected and recovered? **Unknown.**
- Which operational signals and owners cover reminders, payouts, and integrations? **Unknown.**

## Target: personal `.transferkit.local/ONBOARDING.md`

# My Debtbox onboarding

This private workspace links to the [shared system guide](../ONBOARDING.md). Its checkboxes and notes are personal progress, not claims about production or verified operation.

### Exercise: explain debt creation and consent

- [ ] Trace the [debt creation and consent flow](../ONBOARDING.md#flow-debt-creation-and-consent) from merchant endpoint through persistence and side effects, then explain acceptance and rejection.
- Outcome evidence: _Add a short explanation or repository-relative reference after doing the exercise._
- Notes: _Your observations._
- Questions: Can separate saves and a caught signature-upload failure leave a partial outcome? What recovery is intended?

### Exercise: establish a local run

- [ ] Follow the [setup and operations](../ONBOARDING.md#setup-and-operations) evidence, verify prerequisites and port mapping, and record what actually runs.
- Outcome evidence: _Record commands attempted and actual results; none are verified in this fixture._
- Notes: _Your observations._
- Questions: What setup information is missing?

### Exercise: trace another end-to-end path

- [ ] Choose payment through payout or new-customer onboarding through Nafath from [other flows](../ONBOARDING.md#other-flows-to-investigate); explain the path and open gaps.
- Outcome evidence: _Add a diagram or brief trace after investigation._
- Notes: _Your observations._
- Questions: _What needs a person or runtime check?_

### Ownership questions

- [ ] Review the [unknowns](../ONBOARDING.md#unknowns-and-person-supplied-context) with a knowledgeable person and record answers with their source.
- Notes and evidence: _No person-supplied answers are present in this fixture._
