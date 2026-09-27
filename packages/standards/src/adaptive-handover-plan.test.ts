import { describe, expect, it } from "vitest";
import type { Finding } from "@transferkit/core";
import {
  planAdaptiveHandover,
  suggestBusinessFlows,
} from "./adaptive-handover-plan.js";
import type { BusinessFlow } from "@transferkit/core";

const evidence = (file: string) => [{ file, line: 1 }];
const finding = (id: string, kind: string, data: unknown): Finding => ({
  id,
  kind,
  data,
  evidence: evidence(`${id}.ts`),
});
const requirement = (
  plan: ReturnType<typeof planAdaptiveHandover>,
  areaId: string,
  key: string,
) =>
  plan.areas
    .find(({ id }) => id === areaId)
    ?.requirements.find(({ id }) => id.endsWith(`.${key}`));

describe("adaptive handover planning", () => {
  it("keeps business flow coverage missing until structured critical details are supplied", () => {
    const ready: BusinessFlow = {
      id: "manual:payment",
      name: "Payment lifecycle",
      origin: "manual",
      status: "confirmed",
      details: {
        purpose: "Collect payment for an order",
        entryPoint: "POST /payments",
        mainPath: "Authorize and record payment result",
        businessRules: "Reject duplicate payment requests",
        failurePaths: "Provider timeout leaves a pending payment",
        retryRecovery: "Reconcile pending payments before manual retry",
      },
    };
    const insufficient: BusinessFlow = {
      id: "manual:refund",
      name: "Refund",
      origin: "manual",
      status: "confirmed",
      details: { purpose: "Refund a payment" },
    };
    const suggestion: BusinessFlow = {
      id: "suggested:consumer",
      name: "Suggested",
      origin: "suggested",
      status: "suggested",
      details: {},
    };
    expect(
      requirement(
        planAdaptiveHandover({ findings: [] }),
        "critical-business-flows",
        "flows",
      )?.coverage,
    ).toBe("missing");
    expect(
      requirement(
        planAdaptiveHandover({ findings: [], flows: [suggestion] }),
        "critical-business-flows",
        "flows",
      )?.coverage,
    ).toBe("missing");
    const empty = planAdaptiveHandover({
      findings: [],
      flows: [{ ...insufficient, details: {} }],
    });
    expect(
      requirement(empty, "critical-business-flows", "handover")?.coverage,
    ).toBe("missing");
    const partial = planAdaptiveHandover({
      findings: [],
      flows: [insufficient],
      confirmed: ["critical-business-flows.manual:refund.purpose"],
    });
    expect(
      requirement(partial, "critical-business-flows", "purpose")?.coverage,
    ).toBe("covered");
    expect(
      requirement(partial, "critical-business-flows", "handover")?.coverage,
    ).toBe("missing");
    const readyConfirmed = [
      "purpose",
      "entryPoint",
      "mainPath",
      "businessRules",
      "failurePaths",
      "retryRecovery",
    ].map((field) => `critical-business-flows.manual:payment.${field}`);
    const complete = planAdaptiveHandover({
      findings: [],
      flows: [ready],
      confirmed: readyConfirmed,
    });
    expect(
      requirement(complete, "critical-business-flows", "handover")?.coverage,
    ).toBe("covered");
    const multiple = planAdaptiveHandover({
      findings: [],
      flows: [ready, insufficient],
      confirmed: readyConfirmed,
    });
    expect(
      multiple.areas
        .find(({ id }) => id === "critical-business-flows")
        ?.requirements.filter(
          ({ id, coverage }) =>
            id.endsWith(".handover") && coverage === "covered",
        ),
    ).toHaveLength(1);
    expect(
      multiple.areas
        .find(({ id }) => id === "critical-business-flows")
        ?.requirements.filter(
          ({ id, coverage }) =>
            id.endsWith(".handover") && coverage === "missing",
        ),
    ).toHaveLength(1);
  });

  it("suggests route starting points from deterministic module relationships", () => {
    const flows = suggestBusinessFlows([
      finding("route:payments", "application.route", {
        controller: "PaymentsController",
        method: "create",
        verb: "POST",
        path: "/payments",
      }),
      finding("module:payments", "application.module", {
        name: "PaymentsModule",
        controllers: "PaymentsController",
        providers: "PaymentsService, HyperPayClient",
      }),
    ]);
    expect(flows[0]).toMatchObject({
      name: "POST /payments",
      startingPoints: [
        "PaymentsController",
        "create",
        "PaymentsModule",
        "PaymentsService",
        "HyperPayClient",
      ],
    });
  });
  it("activates evidence-specific messaging, job, integration, and database topics", () => {
    const plan = planAdaptiveHandover({
      findings: [
        finding("messaging.rabbitmq", "messaging", { name: "RabbitMQ" }),
        finding("consumer:orders", "messaging.consumer", {
          name: "OrdersConsumer",
          queue: "orders",
        }),
        finding("scheduled-job:billing", "scheduled-job", {
          name: "Billing.run",
          schedule: "0 3 * * *",
        }),
        finding("integration:pay", "integration", {
          client: "axios",
          endpoint: "https://api.hyperpay.com/pay",
        }),
        finding("database.postgresql", "database", { name: "PostgreSQL" }),
      ],
    });
    expect(plan.areas).toHaveLength(24);
    expect(requirement(plan, "async-processing", "consumers")).toMatchObject({
      coverage: "covered",
      subject: "Messaging",
    });
    expect(requirement(plan, "async-processing", "retries-dlq")?.coverage).toBe(
      "missing",
    );
    expect(
      requirement(plan, "scheduled-jobs", "cadence")?.knowledge,
    ).toContainEqual(
      expect.objectContaining({
        classification: "OBSERVED",
        value: "0 3 * * *",
      }),
    );
    expect(requirement(plan, "scheduled-jobs", "recovery")?.coverage).toBe(
      "missing",
    );
    expect(
      requirement(plan, "external-integrations", "contacts")?.coverage,
    ).toBe("missing");
    expect(requirement(plan, "data-persistence", "technology")?.coverage).toBe(
      "covered",
    );
  });

  it("leaves unrelated conditional areas inactive without dropping the standard", () => {
    const plan = planAdaptiveHandover({ findings: [] });
    for (const id of [
      "async-processing",
      "scheduled-jobs",
      "external-integrations",
      "data-persistence",
    ]) {
      expect(
        plan.areas.find((area) => area.id === id)?.requirements[0]?.coverage,
      ).toBe("inactive");
    }
    expect(requirement(plan, "system-overview", "purpose")?.coverage).toBe(
      "missing",
    );
  });

  it("uses persisted human answers while leaving human-only gaps open", () => {
    const job = finding("scheduled-job:billing", "scheduled-job", {
      name: "Billing.run",
      schedule: "0 3 * * *",
    });
    const plan = planAdaptiveHandover({
      findings: [job],
      confirmed: [`scheduled-jobs.${encodeURIComponent(job.id)}.owner`],
      knowledge: [
        { entityId: job.id, field: "operationalOwner", value: "Platform" },
        { entityId: job.id, field: "criticality", value: "critical" },
      ],
    });
    expect(requirement(plan, "scheduled-jobs", "cadence")?.coverage).toBe(
      "covered",
    );
    expect(requirement(plan, "scheduled-jobs", "owner")?.coverage).toBe(
      "covered",
    );
    expect(requirement(plan, "scheduled-jobs", "purpose")?.coverage).toBe(
      "missing",
    );
    expect(requirement(plan, "scheduled-jobs", "failure")?.coverage).toBe(
      "missing",
    );
    expect(requirement(plan, "scheduled-jobs", "recovery")?.coverage).toBe(
      "missing",
    );
  });

  it("groups calls by deterministic provider identity and names unknown calls explicitly", () => {
    const plan = planAdaptiveHandover({
      findings: [
        finding("call:1", "integration", {
          client: "axios",
          endpoint: "https://api.hyperpay.com/pay",
        }),
        finding("call:2", "integration", {
          client: "fetch",
          endpoint: "https://api.hyperpay.com/refund",
        }),
        finding("call:3", "integration", { client: "axios" }),
        finding("sdk:sanad", "integration", {
          client: "sanad-sdk",
          service: "Sanad",
        }),
      ],
    });
    const providers = plan.areas
      .find(({ id }) => id === "external-integrations")
      ?.requirements.filter(({ id }) => id.endsWith(".purpose"))
      .map(({ subject }) => subject);
    expect(providers).toEqual([
      "api.hyperpay.com",
      "Unknown HTTP Integration",
      "Sanad",
    ]);
    const endpoint = plan.areas
      .find(({ id }) => id === "external-integrations")
      ?.requirements.find(
        ({ subject, id }) =>
          subject === "api.hyperpay.com" && id.endsWith(".endpoint"),
      );
    expect(endpoint?.evidence).toHaveLength(2);
  });

  it("carries inferred provider identity as unconfirmed and leaves its coverage open", () => {
    const plan = planAdaptiveHandover({
      findings: [
        finding("call:nafath", "integration", {
          client: "axios",
          configKey: "NAFATH_BASE_URL",
          owner: "NafathApiService",
        }),
      ],
    });
    const identity = requirement(plan, "external-integrations", "provider");
    expect(identity?.coverage).toBe("missing");
    expect(identity?.knowledge).toContainEqual(
      expect.objectContaining({ classification: "INFERRED", value: "NAFATH" }),
    );
    expect(plan.integrations?.[0]).toMatchObject({
      provider: "NAFATH",
      identity: "INFERRED",
      configuration: ["NAFATH_BASE_URL"],
    });
  });

  it("includes custom topics in coverage using saved knowledge", () => {
    const plan = planAdaptiveHandover({
      findings: [],
      confirmed: ["custom-topics.monthly-settlement"],
      customTopics: [
        {
          id: "monthly-settlement",
          title: "Monthly settlement",
          priority: "critical",
        },
      ],
      knowledge: [
        {
          entityId: "custom-topics.monthly-settlement",
          field: "content",
          value: "Run after close",
        },
      ],
    });
    expect(
      requirement(plan, "custom-topics", "monthly-settlement"),
    ).toMatchObject({
      coverage: "covered",
      priority: "critical",
      knowledge: [{ classification: "HUMAN", value: "Run after close" }],
    });
  });
});
