import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { traceRoute } from "./onboarding-trace-spike.mjs";

const fixture = resolve("experiments/fixtures/nest-trace");

test("resolves cited route, local helper, and cross-file provider methods", () => {
  const trace = traceRoute(fixture, "controller.ts", "submit");
  assert.deepEqual(
    trace.methods.map((method) => method.symbol),
    [
      "OrderController.submit",
      "OrderService.submit",
      "OrderRepository.find",
      "OrderService.validate",
      "OrderRepository.save",
      "NotificationService.send",
    ],
  );
  assert.match(
    trace.methods[0].events[0].detail,
    /declared OrderService\.submit @ order\.service\.ts:\d+/u,
  );
  assert.match(
    trace.methods[1].events.find((event) =>
      event.detail.includes("this.validate"),
    ).detail,
    /OrderService\.validate @ order\.service\.ts:\d+/u,
  );
  assert.match(
    trace.methods[1].events.find((event) =>
      event.detail.includes("this.notifications.send"),
    ).detail,
    /NotificationService\.send @ providers\.ts:\d+/u,
  );
  assert.ok(
    trace.methods[1].events.every(
      (event) => !event.detail.includes("constructor"),
    ),
  );
});

test("keeps exclusive branches and catch distinct, and marks unsupported dispatch", () => {
  const trace = traceRoute(fixture, "controller.ts", "submit");
  const events = trace.methods[1].events;
  assert.deepEqual(
    events.find((event) => event.detail.includes('order.status = "accepted"'))
      .conditions,
    ["when accepted"],
  );
  assert.deepEqual(
    events.find((event) => event.detail.includes('order.status = "rejected"'))
      .conditions,
    ["else accepted"],
  );
  assert.deepEqual(
    events.find((event) =>
      event.detail.includes('order.status = "notification-failed"'),
    ).conditions,
    ["catch"],
  );
  assert.ok(trace.gaps.some((gap) => gap.reason.includes("dynamic dispatch")));
  assert.ok(
    trace.gaps.some((gap) =>
      gap.reason.includes("normalize: project free function call unsupported"),
    ),
  );
  assert.ok(
    trace.gaps.some((gap) =>
      gap.reason.includes(
        "this.dispatcher.send: ambiguous provider implementation",
      ),
    ),
  );
  assert.ok(
    !trace.methods.some((method) => method.symbol.startsWith("Dispatcher.")),
  );
});
