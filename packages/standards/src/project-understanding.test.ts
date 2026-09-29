import { describe, expect, it } from "vitest";
import { scanRepository } from "@transferkit/scanners";
import type { Finding } from "@transferkit/core";
import { understandProject } from "./project-understanding.js";

describe("deterministic Project Understanding", () => {
  it("filters operational and admin modules and normalizes plural business modules", () => {
    const names = [
      "Health",
      "InternalTest",
      "Data",
      "Dashboards",
      "Customer",
      "Customers",
      "Debt",
      "Debts",
    ];
    const findings: Finding[] = names.map((name) => ({
      id: `module:${name}`,
      kind: "application.module",
      data: { name: `${name}Module`, controllers: "", providers: "" },
      evidence: [
        { file: `src/${name.toLowerCase()}/${name.toLowerCase()}.module.ts` },
      ],
    }));
    findings.push({
      id: "admin-customers",
      kind: "application.module",
      data: { name: "CustomersModule" },
      evidence: [{ file: "src/admin/customers/customers.module.ts" }],
    });
    const model = understandProject(findings);
    expect(model.domains.map((domain) => domain.name)).toEqual([
      "Customer",
      "Debt",
    ]);
    expect(model.candidateFlows).toEqual([]);
    expect(
      model.operationalCapabilities.find(
        (capability) => capability.kind === "ADMIN_ENDPOINTS",
      )?.componentIds,
    ).toContain("admin-customers");
    const domainRelevant = understandProject([
      ...findings,
      {
        id: "dashboard-entity",
        kind: "database.entity",
        data: { name: "Dashboard" },
        evidence: [{ file: "src/dashboards/dashboard.entity.ts" }],
      },
    ]);
    expect(domainRelevant.domains.map((domain) => domain.name)).toContain(
      "Dashboard",
    );
  });

  it("composes a source-backed route across services without adding unsupported steps", () => {
    const at = (file: string) => [{ file: `src/${file}.ts`, line: 1 }];
    const findings: Finding[] = [
      {
        id: "mod-a",
        kind: "application.module",
        data: {
          name: "OrderModule",
          controllers: "OrderController",
          providers: "OrderService",
        },
        evidence: at("order/order.module"),
      },
      {
        id: "mod-b",
        kind: "application.module",
        data: { name: "PaymentModule", providers: "PaymentService" },
        evidence: at("payment/payment.module"),
      },
      {
        id: "controller",
        kind: "application.controller",
        data: { name: "OrderController" },
        evidence: at("order/order.controller"),
      },
      {
        id: "route",
        kind: "application.route",
        data: {
          controller: "OrderController",
          method: "submitOrder",
          verb: "POST",
          path: "/orders",
        },
        evidence: at("order/order.controller"),
      },
      {
        id: "order-service",
        kind: "application.service",
        data: { name: "OrderService" },
        evidence: at("order/order.service"),
      },
      {
        id: "payment-service",
        kind: "application.service",
        data: { name: "PaymentService" },
        evidence: at("payment/payment.service"),
      },
      {
        id: "entity",
        kind: "database.entity",
        data: { name: "Payment" },
        evidence: at("payment/payment.entity"),
      },
      {
        id: "dep-1",
        kind: "application.dependency",
        data: { source: "OrderController", target: "OrderService" },
        evidence: at("order/order.controller"),
      },
      {
        id: "dep-2",
        kind: "application.dependency",
        data: { source: "OrderService", target: "PaymentService" },
        evidence: at("order/order.service"),
      },
      {
        id: "dep-3",
        kind: "application.dependency",
        data: {
          source: "PaymentService",
          target: "Payment",
          dependencyKind: "repository-entity",
        },
        evidence: at("payment/payment.service"),
      },
    ];
    const model = understandProject(findings);
    const flow = model.candidateFlows.find(
      (item) => item.title === "Order submit order",
    )!;
    expect(flow.domainIds).toEqual(["domain:order", "domain:payment"]);
    expect(flow.steps.map((step) => step.componentId)).toEqual([
      "controller",
      "order-service",
      "payment-service",
      "entity",
    ]);
    expect(flow.steps.every((step) => step.evidence.length > 0)).toBe(true);
    expect(flow.integrationIds).toEqual([]);
    expect(
      model.candidateFlows.some((item) => item.title === "Order lifecycle"),
    ).toBe(false);
    const unresolved = understandProject(
      findings.map((finding) =>
        finding.id === "route"
          ? {
              ...finding,
              data: {
                controller: "OrderController",
                method: "submitOrder",
                verb: "POST",
              },
            }
          : finding,
      ),
    );
    expect(
      unresolved.candidateFlows.find(
        (item) => item.title === "Order submit order",
      )?.entryPoints,
    ).toEqual(["POST OrderController.submitOrder (path unresolved)"]);
  });

  it("distinguishes migration and runtime evidence from general persistence", () => {
    const model = understandProject([
      {
        id: "migration",
        kind: "database.migration",
        data: {},
        evidence: [{ file: "src/migrations/001.sql" }],
      },
      {
        id: "env",
        kind: "environment.template",
        data: {},
        evidence: [{ file: ".env.example" }],
      },
    ]);
    expect(model.operationalCapabilities.map((item) => item.kind)).toEqual([
      "MIGRATIONS",
      "RUNTIME_CONFIGURATION",
    ]);
  });
  it("clusters project domains and retains source-backed relationships and flows", async () => {
    const findings = await scanRepository("fixtures/realistic-nestjs");
    const model = understandProject(findings);
    expect(model.domains.map((domain) => domain.name)).toEqual([
      "Debt",
      "Payment",
      "Shipment",
    ]);
    expect(model.domains.map((domain) => domain.name).join(" ")).not.toMatch(
      /Config|TypeORM|Schedule|HTTP|App/iu,
    );
    const payment = model.domains.find((domain) => domain.name === "Payment")!;
    const debt = model.domains.find((domain) => domain.name === "Debt")!;
    expect(payment.modules).toHaveLength(1);
    expect(payment.controllers).toHaveLength(1);
    expect(payment.services.length).toBeGreaterThan(0);
    expect(payment.entities).toHaveLength(1);
    expect(payment.integrations).toHaveLength(1);
    expect(payment.jobs).toHaveLength(1);
    expect(debt.integrations).toHaveLength(0);
    expect(
      payment.evidence.some(
        (item) => item.file === "src/payment/payment.module.ts",
      ),
    ).toBe(true);
    expect(payment.evidence.every((item) => item.file !== "package.json")).toBe(
      true,
    );

    const relationNames = model.relationships.map((relationship) => ({
      kind: relationship.kind,
      from: model.components.find(
        (component) => component.id === relationship.from,
      )?.name,
      to: model.components.find((component) => component.id === relationship.to)
        ?.name,
    }));
    expect(relationNames).toEqual(
      expect.arrayContaining([
        { kind: "MODULE_IMPORT", from: "AppModule", to: "PaymentModule" },
        {
          kind: "MODULE_PROVIDER",
          from: "PaymentModule",
          to: "PaymentService",
        },
        {
          kind: "CONTROLLER_SERVICE",
          from: "PaymentController",
          to: "PaymentService",
        },
        { kind: "SERVICE_ENTITY", from: "PaymentService", to: "Payment" },
        {
          kind: "SERVICE_INTEGRATION",
          from: "PaymentService",
          to: "hyperpay.example.test",
        },
        { kind: "JOB_SERVICE", from: "PaymentJobs", to: "PaymentService" },
      ]),
    );
    expect(
      model.relationships.every(
        (item) =>
          item.evidence.length > 0 &&
          item.evidence.every((evidence) => evidence.file !== "package.json"),
      ),
    ).toBe(true);
    expect(model.candidateFlows.map((flow) => flow.title)).toEqual(
      expect.arrayContaining([
        "Debt creation",
        "Payment creation",
        "Payment callback handling",
        "Payment recovery and reconciliation",
      ]),
    );
    const paymentFlow = model.candidateFlows.find(
      (flow) => flow.title === "Payment creation",
    )!;
    expect(paymentFlow.entryPoints).toContain("POST /payments");
    expect(paymentFlow.integrationIds).toEqual(payment.integrations);
    expect(paymentFlow.entityIds).toEqual(payment.entities);
    expect(paymentFlow.sourceFindingIds.length).toBeGreaterThan(0);
    expect(paymentFlow.confidence).toBe("CANDIDATE");
    expect(model.operationalCapabilities.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "SCHEDULED_JOBS",
        "MESSAGING",
        "PERSISTENCE",
        "DEPLOYMENT",
        "EXTERNAL_SERVICES",
        "ADMIN_ENDPOINTS",
      ]),
    );
    expect(JSON.stringify(model)).not.toMatch(
      /refund policy|settlement rule|production behavior/iu,
    );
    expect(understandProject(findings)).toEqual(model);
  });

  it("does not infer controller-service relationships from names or shared files", () => {
    const evidence = [{ file: "src/payment/payment.ts", line: 1 }];
    const findings: Finding[] = [
      {
        id: "controller",
        kind: "application.controller",
        data: { name: "PaymentController" },
        evidence,
      },
      {
        id: "service",
        kind: "application.service",
        data: { name: "PaymentService" },
        evidence,
      },
    ];
    const model = understandProject(findings);
    expect(model.relationships).toEqual([]);
    expect(model.domains.map((domain) => domain.name)).toEqual(["Payment"]);
    expect(model.candidateFlows).toEqual([]);
  });

  it("does not promote package-only SDK declarations into source-backed project concepts", () => {
    const model = understandProject([
      {
        id: "sdk",
        kind: "integration",
        data: { client: "stripe", service: "Stripe" },
        evidence: [{ file: "package.json", line: 3 }],
      },
    ]);
    expect(model.components).toEqual([]);
    expect(model.operationalCapabilities).toEqual([]);
    expect(model.domains).toEqual([]);
  });
});
