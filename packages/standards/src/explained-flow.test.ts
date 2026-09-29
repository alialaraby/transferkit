import { expect, it } from "vitest";
import type { Finding, ProjectModel, RouteTrace } from "@transferkit/core";

import { explainCandidateFlows } from "./explained-flow.js";

const evidence = (line: number) => [{ file: "src/order.service.ts", line }];
const model: ProjectModel = {
  domains: [],
  components: [],
  relationships: [],
  operationalCapabilities: [],
  candidateFlows: [
    {
      id: "flow:order",
      title: "Order creation",
      domainIds: [],
      componentIds: [],
      entryPoints: ["POST /orders"],
      integrationIds: [],
      entityIds: [],
      jobIds: [],
      confidence: "CANDIDATE",
      sourceFindingIds: ["route:order"],
      evidence: evidence(1),
      steps: [],
    },
  ],
};
const trace: Finding<RouteTrace> = {
  id: "trace:order",
  kind: "application.route-trace",
  data: {
    routeFindingId: "route:order",
    handler: "OrderController.create",
    serviceMethod: "OrderService.create",
    operations: [
      {
        kind: "call",
        category: "repository",
        target: "OrderRepository",
        method: "find",
        awaited: true,
        evidence: evidence(10),
      },
      { kind: "guard", condition: "!order", evidence: evidence(11) },
      {
        kind: "call",
        category: "repository",
        target: "OrderRepository",
        method: "save",
        awaited: true,
        evidence: evidence(12),
      },
      { kind: "branch", condition: "notify", evidence: evidence(13) },
      {
        kind: "call",
        category: "service",
        target: "NotificationService",
        method: "send",
        conditional: "when notify",
        awaited: true,
        evidence: evidence(14),
      },
    ],
    gaps: ["Delivery unverified."],
  },
  evidence: [{ file: "src/order.controller.ts", line: 6 }, ...evidence(9)],
};

it("assembles a cited partial explanation and leaves weak traces as candidates", () => {
  const explained = explainCandidateFlows(model, [trace]);
  expect(explained).toHaveLength(1);
  expect(
    explained[0]?.steps.map((step) => step.evidence.map((item) => item.line)),
  ).toEqual([[6, 9], [10, 11], [12], [13, 14]]);
  expect(explained[0]?.steps[2]?.text).toContain(
    "awaits a save call through the order repository",
  );
  expect(explained[0]?.steps[3]?.text).toContain(
    "When `notify`, it attempts `NotificationService.send`",
  );
  expect(
    explainCandidateFlows(model, [
      {
        ...trace,
        data: {
          ...trace.data,
          operations: trace.data.operations.filter(
            (item) => item.method !== "save",
          ),
        },
      },
    ]),
  ).toEqual([]);
});

it("explains distinct status branches only with assignments and saves in their method bodies", () => {
  const branchTrace: Finding<RouteTrace> = {
    ...trace,
    data: {
      ...trace.data,
      operations: [
        {
          kind: "call",
          category: "repository",
          target: "RecordRepository",
          method: "find",
          awaited: true,
          evidence: evidence(10),
        },
        { kind: "guard", condition: "!record", evidence: evidence(11) },
        {
          kind: "guard",
          condition: "record.status !== Status.PENDING",
          evidence: evidence(12),
        },
        {
          kind: "assignment",
          target: "record",
          property: "action",
          value: "input.action",
          evidence: evidence(13),
        },
        {
          kind: "call",
          category: "repository",
          target: "RecordRepository",
          method: "save",
          awaited: true,
          evidence: evidence(14),
        },
        {
          kind: "branch",
          condition: "input.action === Action.YES",
          evidence: evidence(15),
        },
        {
          kind: "assignment",
          target: "record",
          property: "status",
          value: "Status.ACTIVE",
          conditional: "when input.action === Action.YES",
          evidence: evidence(16),
        },
        { kind: "branch", condition: "file", evidence: evidence(17) },
        {
          kind: "call",
          category: "service",
          target: "BlobClient",
          method: "upload",
          awaited: true,
          catchDepth: 2,
          conditional: "when input.action === Action.YES; when file",
          evidence: evidence(18),
        },
        {
          kind: "call",
          category: "repository",
          target: "RecordRepository",
          method: "save",
          awaited: true,
          conditional: "when input.action === Action.YES",
          evidence: evidence(19),
        },
        {
          kind: "call",
          category: "service",
          target: "DocumentService",
          method: "ensureGenerated",
          awaited: true,
          conditional: "when input.action === Action.YES",
          evidence: evidence(20),
        },
        {
          kind: "branch",
          condition: "input.action === Action.NO",
          evidence: evidence(21),
        },
        {
          kind: "assignment",
          target: "record",
          property: "status",
          value: "Status.CANCELLED",
          conditional:
            "otherwise input.action === Action.YES; when input.action === Action.NO",
          evidence: evidence(22),
        },
        {
          kind: "call",
          category: "repository",
          target: "RecordRepository",
          method: "save",
          awaited: true,
          conditional:
            "otherwise input.action === Action.YES; when input.action === Action.NO",
          evidence: evidence(23),
        },
        {
          kind: "branch",
          condition: "record.status !== previousStatus",
          evidence: evidence(24),
        },
        {
          kind: "call",
          category: "service",
          target: "AuditService",
          method: "record",
          awaited: true,
          conditional: "when record.status !== previousStatus",
          evidence: evidence(25),
        },
        {
          kind: "call",
          category: "service",
          target: "NotifyClient",
          method: "send",
          awaited: false,
          evidence: evidence(26),
        },
      ],
      gaps: ["Runtime effects unverified."],
    },
  };
  const explained = explainCandidateFlows(model, [branchTrace])[0]!;
  expect(explained.steps).toHaveLength(6);
  expect(explained.steps[3]?.text).toContain(
    "sets `record.status` to `Status.ACTIVE`",
  );
  expect(explained.steps[3]?.text).toContain("attempts `BlobClient.upload`");
  expect(explained.steps[3]?.text).toContain(
    "Upload and generation outcomes remain unverified",
  );
  expect(explained.steps[3]?.text).toContain("inside a nested try/catch");
  expect(explained.steps[4]?.text).toContain(
    "sets `record.status` to `Status.CANCELLED`",
  );
  expect(explained.steps[5]?.text).toContain(
    "NotifyClient.send` without await",
  );
  expect(
    explained.steps.every(
      (step) =>
        (step.citations?.length ?? 0) >= 1 &&
        (step.citations?.length ?? 0) <= 3,
    ),
  ).toBe(true);
  expect(explained.steps[3]?.citations?.map((item) => item.line)).toEqual([
    16, 18, 20,
  ]);
  expect(explained.gaps.some((gap) => gap.includes("untraced"))).toBe(false);
});
