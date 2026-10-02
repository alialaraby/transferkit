# B2C backend — a newcomer’s working guide

> **Reference example for TransferKit’s human-facing output.** Prepared from the B2C backend source at `79cc98e534a95a2a316c3464281619fb86a12d99` and the repository’s testing guide. This is an engineer’s interpretation of checked-in behavior, not an approved statement of company policy. Paths below are relative to the B2C backend repository. An owner should confirm the business terms and operational procedures before this becomes team documentation.

## The system in two minutes

This service coordinates B2C shipments. A shipment is the record that ties together vendor/customer relations, pickup and drop-off locations, an assigned fleet and possibly a driver, a history of status changes, and the prices later used for invoices. The API is a NestJS application backed by PostgreSQL; some work also enters through RabbitMQ consumers and external integration callbacks. Redis appears in assignment/pricing and other supporting paths. See `src/module/data/entity/shipment.entity.ts:103–170,245–294,331–403,434–438`, `src/main.ts:245–269`, and `src/app.module.ts:180–225`.

The useful mental model is **shipment → assignment → pickup → delivery or exception → financial settlement**. That is a reading order, not a promise that every shipment follows one linear path. Mobile drivers and external fleets report progress through different code paths. Cancellations, missed pickups, future delivery, and return to origin change the path. The status vocabulary is in `src/data/enum/shipment.ts:70–97`; the behavior that accepts a status depends on the entry path.

If you have one hour, read [the domain terms](#five-terms-to-learn), then [the two status paths](#4-delivery-progress-know-which-status-path-you-are-reading), and then [your first safe investigation](#your-first-safe-investigation). Do not start by reading every entity or module.

## Five terms to learn

| Term | What it means for your first investigation | Where to check |
| --- | --- | --- |
| **Shipment** | The central delivery record. It holds current associations and a `latestHistoryAction`, while separate history rows explain how that state was reached. Treat the current field and the history as two views to reconcile when debugging. | `src/module/data/entity/shipment.entity.ts:103,293,364–403`; `src/module/data/entity/shipment-history.entity.ts:24–55` |
| **Vendor, customer, seller** | These are distinct relations in the model. The vendor has configuration that can change pickup requirements; the shipment also has customer and seller-side pickup information. Do not assume the terms are interchangeable or that “customer” always means the recipient. | `src/module/data/entity/shipment.entity.ts:157,232,387`; `src/module/data/entity/vendor.entity.ts:31–80`; `src/module/shipment/services/pickup.service.ts:165–191` |
| **Fleet, driver, truck** | A fleet can be assigned without a driver. Supplying a driver introduces additional membership and truck-type checks; a successful assignment records fleet history and optionally driver history. | `src/module/fleet/services/mobile-fleet.service.ts:67–150,188–239` |
| **AWB and proof** | The AWB is used to identify/validate a shipment at pickup and in external callbacks. Pickup can require an AWB scan, photos, or OTP depending on vendor configuration. | `src/module/shipment/services/pickup.service.ts:60–75,150–225`; `src/module/integrations/integrations.service.ts:653–665` |
| **Price, transaction, invoice** | Shipment transactions carry customer and fleet amounts; invoices have separate customer and fleet types. Changing assignment or invoice logic can affect financial records, so trace the applicable transaction before altering totals. | `src/module/data/entity/shipment-transaction.entity.ts:19–47`; `src/data/enum/invoice.ts:1–18`; `src/module/invoice/invoice.service.ts:760–825` |

### A simple map

```text
Request / queue message / fleet callback
                  ↓
       controller or consumer
                  ↓
        feature service rules
                  ↓
 PostgreSQL shipment + history + related records
                  ↓
  provider update / notification / integration
```

The diagram is a navigation aid. Those side effects are conditional, and the code does not guarantee that a provider update, notification, or integration succeeds just because the database operation did. Start at `src/main.ts:116–150,245–269`, `src/app.module.ts:180–280`, and the selected services below.

## Follow one shipment through the code

### 1. Creation: establish identity before assignment

Start with `ShipmentB2cService.addShipmentB2C` in `src/module/shipment/services/shipment-b2c.service.ts:648`. It checks existing workflow, order-reference, and eRx identifiers before building the shipment and its metadata (`:663–717`). That early duplicate handling matters: when investigating an apparently missing or duplicated request, determine whether the caller got an existing shipment, a rejected conflict, or a new one before looking at downstream assignment. This method is large; read its early identity checks and the resulting saved records first, then follow only the branch for your incident.

**Ask an owner:** Which intake routes and integrations create most production B2C shipments? The code shows multiple entry mechanisms, but repository evidence alone does not rank them by volume or business importance.

### 2. Assignment: a fleet accepts responsibility

`MobileFleetController.assignFleetToShipment` delegates to `MobileFleetService.assignFleetToShipment` (`src/module/fleet/controllers/mobile-fleet.controller.ts:22–40`; `src/module/fleet/services/mobile-fleet.service.ts:67`). The service rejects a missing shipment, an already assigned shipment, or a missing fleet. When a driver is supplied, it also checks that the driver belongs to the fleet, has a truck, and that the truck type is allowed (`mobile-fleet.service.ts:78–149`).

After those checks, the service saves assignment fields, may create or update a shipment transaction using cached pricing, and writes assignment history inside a query-runner transaction (`mobile-fleet.service.ts:151–239`). It commits at `:269`. Driver notification is attempted before that commit (`:244–260`), and a G2G integration call appears after it (`:271–280`). **For debugging, do not assume notification and external integration share the database transaction.** Check the actual outcome of each boundary.

**Example question:** “Why does the fleet see a shipment but the driver does not?” Compare `shipment.fleet`, `shipment.driver`, the last assignment history, driver/truck checks, notification logs, and the external integration path. Do not infer driver assignment from fleet assignment alone.

### 3. Pickup: the mobile driver must satisfy vendor rules

The driver pickup endpoint calls `PickupService.confirmPickup` (`src/module/shipment/controllers/mobile-shipment.controller.ts:501–528`; `src/module/shipment/services/pickup.service.ts:150`). It first loads the shipment and authorizes the driver. Pickup is accepted only from the configured arrival states (`pickup.service.ts:153–162`). Vendor configuration can require an AWB scan, photos, or OTP; helper methods enforce those checks (`:165–191,340–374`).

On the allowed path, the method records pickup evidence and appends `OrderPickedUp` through `ShipmentHistoryService.addNewStatus` (`pickup.service.ts:194–251`). It then tries to update provider status, but logs and swallows that failure (`:252–256`). A later POD OTP notification may also run asynchronously (`:258–269`). **A successful pickup response is evidence of the local path reaching its return; it is not proof that every external provider saw the update.**

**Example question:** “Why is pickup blocked for this driver?” Check the driver authorization, latest status, vendor flags, and pickup evidence in that order. The error shown to the user may reflect a configuration gate rather than a broken endpoint.

### 4. Delivery progress: know which status path you are reading

The internal mobile path uses shipment actions such as pickup and delivery controllers (`src/module/shipment/controllers/mobile-shipment.controller.ts:217–258,425–528`). External fleets can call `IntegrationsController.webhook` (`src/module/integrations/integrations.controller.ts:113–123`), which delegates to `IntegrationsService.webhook` (`integrations.service.ts:630`). These are related ways to update shipment progress, **not one continuous call chain**.

The webhook loads the shipment, checks the fleet/integration type and AWB, and may return early before changing history (`integrations.service.ts:632–665`). It handles cancellations and return-to-origin cases, rejects certain repeated or terminal-state updates, and attempts to insert B2C history (`:689–780`). Some delivered callbacks also calculate price or save proof data; external Shmool shipments have a special proof path (`:797–862`). Provider synchronization failures are logged rather than necessarily reversing the local status (`:863–872`).

**Example question:** “The carrier says delivered, but our UI disagrees.” Start with the callback payload and receipt, then compare fleet identity, AWB, current latest history, attempted history insert, and provider-update logs. A 2xx transport response alone does not establish that a status was accepted; the method has early returns.

### 5. Money: invoices are a separate workflow

`InvoiceService.updateInvoice` is not the next automatic step in the pickup call chain. It is a separate financial workflow (`src/module/invoice/invoice.controller.ts:298–320`; `src/module/invoice/invoice.service.ts:723`). It checks permissions and allowed status transitions, and can recalculate amounts from selected shipments when a draft is edited (`invoice.service.ts:725–825`). Customer and fleet invoices use different transaction fields. Review the invoice type and selected shipment transactions before changing a total or status rule.

## Your first safe investigation

1. **Pick one real question.** Example: “What prevents an already assigned shipment from being assigned through the mobile fleet endpoint?” Read the controller, service guard, and related entity/history fields. Write down the expected error and where it originates. Do not change data.
2. **Run a narrow test before a service.** `package.json` declares `npm test` and `npm run build`; `docs/testing-strategy.md` shows how to run one Jest spec. Prefer a co-located service test for a business rule. Tests are uneven across this large repository, so a missing nearby spec is a prompt to add a characterization test when you change the behavior.
3. **Treat local boot as an environment task.** `package.json` requires Node 24. The `.env.example`, `src/config/typeorm.config.ts`, and `src/main.ts` show PostgreSQL, RabbitMQ, Redis, and Firebase configuration touchpoints. The README still contains Nest starter text, so its generic `npm run start` instructions do not constitute a verified B2C setup. Obtain a sanctioned local environment and test credentials before attempting an application start; never use production data for onboarding.
4. **If a configured local instance is already available, observe only.** `GET /health-check` returns `{ status: 'ok' }` in `src/module/health-check/health-check.controller.ts:20–29`. It shows that the HTTP handler responded, not that every dependency or background consumer works. The DB pool endpoint requires an app key and exposes internal capacity; use it only through the team’s approved access path (`:46–52`).
5. **Record the result.** Note the question, cited files, the command or request actually run, observed result, and any blocker. Separate observations from expected behavior.

## Where to change common behavior

| If the task concerns… | Start here | Check next |
| --- | --- | --- |
| Duplicate or missing B2C shipment creation | `src/module/shipment/services/shipment-b2c.service.ts:648–717` | Calling route/consumer, identity fields, repository query, new test |
| Fleet/driver assignment | `src/module/fleet/services/mobile-fleet.service.ts:67–285` | Controller, fleet/driver repositories, history, pricing cache, notifications |
| Pickup eligibility or evidence | `src/module/shipment/services/pickup.service.ts:150–269` | Vendor `PrimaryConfigs`, driver helper, history service, co-located tests |
| External fleet status | `src/module/integrations/integrations.service.ts:630–900` | Webhook controller, history insert, integration tests, provider logs |
| Invoice transition or amount | `src/module/invoice/invoice.service.ts:723–840` | Invoice type/status enums, transaction fields, invoice tests |

Before editing a status rule, identify whether it is used by the driver app, external webhook, scheduled work, or more than one entry point. A change to a shared enum or history method can affect paths that are not visible from one controller.

## Questions that still need a teammate

- Which vendors and shipment types are the main supported B2C workflows, and what do **vendor**, **customer**, **seller**, and **receiver** mean to the business in each?
- Which service is authoritative when an external carrier status differs from local shipment history? What is the manual recovery path?
- Which provider callbacks and queues are required in a sanctioned local environment? Who owns their test credentials and contract examples?
- What should happen when driver notification, provider update, or post-commit integration fails after local state changes?
- Which team owns invoice rules and approves changes to customer versus fleet pricing?

An engineer can navigate the source without these answers, but should not turn plausible code interpretations into business policy.
