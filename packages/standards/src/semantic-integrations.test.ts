import { describe, expect, it } from "vitest";
import type { Finding } from "@transferkit/core";
import { discoverSemanticIntegrations } from "./semantic-integrations.js";

function call(id: string, data: Record<string, string>): Finding {
  return {
    id,
    kind: "integration",
    data,
    evidence: [{ file: `src/${id}.ts`, line: 3, description: "HTTP call" }],
  };
}

describe("semantic integrations", () => {
  it("groups calls by observed provider and preserves operations, config, owners and evidence", () => {
    const groups = discoverSemanticIntegrations([
      call("one", {
        client: "axios",
        endpoint: "https://api.hyperpay.com/pay",
        owner: "PaymentService",
        operation: "POST",
        configKey: "HYPERPAY_API_URL",
        authConfigKey: "HYPERPAY_TOKEN",
      }),
      call("two", {
        client: "fetch",
        endpoint: "https://api.hyperpay.com/status",
        owner: "PaymentService",
        operation: "GET",
      }),
      {
        id: "module:payments",
        kind: "application.module",
        data: {
          name: "PaymentsModule",
          providers: "PaymentService",
          controllers: "",
        },
        evidence: [{ file: "src/payments.module.ts", line: 1 }],
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      provider: "api.hyperpay.com",
      identity: "OBSERVED",
      callSites: ["src/one.ts:3", "src/two.ts:3"],
      configuration: ["HYPERPAY_API_URL", "HYPERPAY_TOKEN"],
      relatedModules: ["PaymentService", "PaymentsModule"],
      knownOperations: ["POST", "GET"],
      authenticationEvidence: [
        { file: "src/one.ts", line: 3, description: "HTTP call" },
      ],
    });
  });

  it("uses a named configuration key as an inference and keeps unidentified calls unknown", () => {
    const groups = discoverSemanticIntegrations([
      call("named", { client: "axios", configKey: "NAFATH_BASE_URL" }),
      call("unknown", { client: "fetch" }),
    ]);
    expect(
      groups.map(({ provider, identity }) => [provider, identity]),
    ).toEqual([
      ["NAFATH", "INFERRED"],
      ["Unknown HTTP Integration", "UNKNOWN"],
    ]);
  });
});
