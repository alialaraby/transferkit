import { describe, expect, it } from "vitest";
import { scanRepository } from "@transferkit/scanners";
import {
  addCustomHandoverItem,
  createTransfer,
  mergeSuggestedPlan,
  moveHandoverItem,
  reviewHandoverItem,
} from "@transferkit/core";
import { suggestTransferPlan, transferSectionTitles } from "./transfer-plan.js";

describe("v3 plan suggestions", () => {
  it("starts with the approved sections and multiple ownership-transfer item types", () => {
    const plan = suggestTransferPlan([]);
    expect(plan.sections.map((section) => section.title)).toEqual(
      transferSectionTitles,
    );
    expect(new Set(plan.items.map((item) => item.type))).toEqual(
      new Set([
        "WALKTHROUGH",
        "OWNERSHIP",
        "OPEN_WORK",
        "RISK",
        "VERIFY",
        "ACTION",
      ]),
    );
    expect(plan.items).toHaveLength(16);
  });

  it("uses realistic repository evidence without producing one item per finding", async () => {
    const findings = await scanRepository("fixtures/realistic-nestjs");
    const plan = suggestTransferPlan(findings);
    const sectionItems = (title: string) => {
      const section = plan.sections.find(
        (candidate) => candidate.title === title,
      )!;
      return section.itemIds.map((id) =>
        plan.items.find((item) => item.id === id)!,
      );
    };
    const architecture = sectionItems("System & Architecture")[0]!;
    expect(architecture.title).toContain("Debt, Payment, Shipment");
    expect(architecture.checklist.map((point) => point.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("PostgreSQL"),
        expect.stringContaining("AppModule → PaymentModule"),
        expect.stringContaining("HyperPay"),
      ]),
    );
    expect(architecture.repositoryContext[0]?.path).toBe("src/app.module.ts");
    const domainItems = sectionItems("Business Domains");
    expect(domainItems.map((item) => item.title)).toEqual([
      "Walk through the Debt domain",
      "Walk through the Payment domain",
      "Walk through the Shipment domain",
    ]);
    const payment = domainItems.find((item) => item.title.includes("Payment"))!;
    expect(payment.checklist.map((point) => point.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("POST /payments/callback"),
        expect.stringContaining("PaymentController → PaymentService"),
        expect.stringContaining("HyperPay"),
        expect.stringContaining("PaymentJobs.reconcilePayments"),
      ]),
    );
    expect(payment.repositoryContext[0]?.path).toBe(
      "src/payment/payment.module.ts",
    );
    const flows = sectionItems("Critical Business Flows");
    expect(flows.map((item) => item.title)).toEqual([
      "Walk through Debt creation",
      "Walk through Debt lookup",
      "Walk through Payment creation",
      "Walk through Payment callback handling",
      "Walk through Payment recovery and reconciliation",
    ]);
    expect(
      flows
        .find((item) => item.title.includes("Payment creation"))
        ?.checklist.map((point) => point.text),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("POST /payments"),
        expect.stringContaining("PaymentService"),
        expect.stringContaining("HyperPay"),
      ]),
    );
    expect(
      flows
        .find((item) => item.title.includes("callback"))
        ?.checklist.map((point) => point.text)
        .join(" "),
    ).toContain("duplicate delivery");
    expect(
      flows
        .find((item) => item.title.includes("recovery"))
        ?.checklist.map((point) => point.text)
        .join(" "),
    ).toContain("safe rerun");
    const jobs = sectionItems("Async Processing & Scheduled Jobs");
    expect(
      jobs.some(
        (item) =>
          item.title.includes("reconcile payments") &&
          item.checklist.some((point) => point.text.includes("0 2 * * *")),
      ),
    ).toBe(true);
    expect(
      jobs.some((item) => item.title.includes("reconcile shipments")),
    ).toBe(true);
    expect(jobs.every((item) => item.repositoryContext.length > 0)).toBe(true);
    const providers = sectionItems("External Services");
    expect(providers.map((item) => item.title)).toEqual([
      "Walk through Partner integration",
      "Walk through HyperPay integration",
    ]);
    expect(
      providers
        .find((item) => item.title.includes("HyperPay"))
        ?.checklist.map((point) => point.text),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Detected operations: POST"),
        expect.stringContaining("Related domain: Payment"),
      ]),
    );
    expect(
      plan.items.some((item) =>
        item.title.includes("Explain the main business domains"),
      ),
    ).toBe(false);
    expect(
      plan.items.some((item) =>
        item.title.includes("critical business flows and failure paths"),
      ),
    ).toBe(false);
    expect(sectionItems("Deployment & Infrastructure")).toHaveLength(1);
    expect(
      plan.items.some(
        (item) => item.type === "OWNERSHIP" && /partner/iu.test(item.title),
      ),
    ).toBe(true);
    expect(plan.items.some((item) => item.type === "VERIFY")).toBe(true);
    expect(plan.items.length).toBeLessThan(30);
    expect(plan.items.map((item) => item.title).join(" ")).not.toMatch(
      /axios|HttpService|fetch/iu,
    );
    expect(
      plan.items
        .flatMap((item) => item.repositoryContext)
        .every((context) => context.path !== "package.json"),
    ).toBe(true);
    const again = suggestTransferPlan([...findings].reverse());
    expect(
      again.items
        .map((item) =>
          item.provenance.kind === "SUGGESTED"
            ? item.provenance.suggestionId
            : "",
        )
        .sort(),
    ).toEqual(
      plan.items
        .map((item) =>
          item.provenance.kind === "SUGGESTED"
            ? item.provenance.suggestionId
            : "",
        )
        .sort(),
    );
    expect(suggestTransferPlan([]).items).toHaveLength(16);
  });

  it("preserves reviewed suggestions while new understanding adds pending work", async () => {
    const findings = await scanRepository("fixtures/realistic-nestjs");
    const first = suggestTransferPlan(
      findings.filter(
        (finding) =>
          !finding.evidence.some((evidence) =>
            evidence.file.startsWith("src/payment/"),
          ),
      ),
    );
    let reviewed = mergeSuggestedPlan(
      createTransfer("project", "owner").plan,
      first,
    );
    const existing = reviewed.items.find(
      (item) =>
        item.provenance.kind === "SUGGESTED" &&
        item.provenance.suggestionId === "domain:debt",
    )!;
    reviewed = reviewHandoverItem(reviewed, existing.id, "reject");
    const architecture = reviewed.items.find(
      (item) =>
        item.provenance.kind === "SUGGESTED" &&
        item.provenance.suggestionId === "architecture",
    )!;
    reviewed = reviewHandoverItem(reviewed, architecture.id, "accept");
    reviewed = reviewHandoverItem(
      reviewed,
      architecture.id,
      "rename",
      "Owner's architecture review",
    );
    const domainSection = reviewed.sections.find(
      (section) => section.title === "Business Domains",
    )!;
    reviewed = moveHandoverItem(
      reviewed,
      existing.id,
      domainSection.id,
      domainSection.itemIds.length + 1,
    );
    reviewed = addCustomHandoverItem(
      reviewed,
      domainSection.id,
      "Manual transfer decision",
      "ACTION",
      "CRITICAL",
    );
    const final = reviewed.items.find(
      (item) =>
        item.provenance.kind === "SUGGESTED" &&
        item.provenance.suggestionId === "final",
    )!;
    reviewed = {
      ...reviewed,
      items: reviewed.items.map((item) =>
        item.id === final.id
          ? {
              ...item,
              type: "ACTION",
              status: "DONE",
              completion: { performed: true },
            }
          : item,
      ),
    };
    const rescanned = mergeSuggestedPlan(
      reviewed,
      suggestTransferPlan(findings),
    );
    expect(
      rescanned.items.find((item) => item.id === existing.id)?.provenance,
    ).toMatchObject({ decision: "REJECTED" });
    expect(
      rescanned.items.find((item) => item.id === architecture.id)?.title,
    ).toBe("Owner's architecture review");
    expect(
      rescanned.items.find(
        (item) =>
          item.provenance.kind === "SUGGESTED" &&
          item.provenance.suggestionId === "domain:payment",
      )?.provenance,
    ).toMatchObject({ decision: "PENDING" });
    expect(
      rescanned.items.filter(
        (item) =>
          item.provenance.kind === "SUGGESTED" &&
          item.provenance.suggestionId === "domain:debt",
      ),
    ).toHaveLength(1);
    expect(
      rescanned.sections
        .find((section) => section.id === domainSection.id)
        ?.itemIds.slice(0, domainSection.itemIds.length),
    ).toEqual(
      reviewed.sections
        .find((section) => section.id === domainSection.id)
        ?.itemIds.slice(0, domainSection.itemIds.length),
    );
    expect(rescanned.items.find((item) => item.id === final.id)?.status).toBe(
      "DONE",
    );
    expect(
      rescanned.items.some(
        (item) =>
          item.title === "Manual transfer decision" &&
          item.provenance.kind === "MANUAL",
      ),
    ).toBe(true);
  });

  it("keeps unidentified HTTP calls explicitly unknown without naming a client library as provider", () => {
    const plan = suggestTransferPlan([
      {
        id: "http-call",
        kind: "integration",
        data: { client: "axios" },
        evidence: [{ file: "src/http.ts", line: 8 }],
      },
    ]);
    const external = plan.sections.find(
      (section) => section.title === "External Services",
    )!;
    const items = external.itemIds.map((id) =>
      plan.items.find((item) => item.id === id)!,
    );
    expect(items.map((item) => item.title)).toEqual([
      "Identify unknown outbound integrations",
    ]);
    expect(items[0]?.repositoryContext[0]?.path).toBe("src/http.ts");
    expect(items[0]?.title).not.toMatch(/axios|fetch|HttpService/iu);
  });
});
