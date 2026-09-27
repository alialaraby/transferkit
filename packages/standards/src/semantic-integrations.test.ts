import { describe, expect, it } from "vitest";
import type { Finding } from "@transferkit/core";
import {
  discoverSemanticIntegrations,
  providerFromName,
} from "./semantic-integrations.js";

describe("semantic provider identity", () => {
  it("recognizes provider owners without naming generic transports", () => {
    expect(providerFromName("NafathService")).toBe("Nafath");
    expect(providerFromName("SanadService")).toBe("Sanad");
    expect(providerFromName("HyperPayClient")).toBe("HyperPay");
    expect(providerFromName("EmailProviderService")).toBe("Email Provider");
    expect(providerFromName("HttpService")).toBeUndefined();
    const findings: Finding[] = [
      {
        id: "one",
        kind: "integration",
        data: { owner: "NafathService" },
        evidence: [{ file: "src/nafath/nafath.service.ts", line: 1 }],
      },
      {
        id: "two",
        kind: "integration",
        data: { owner: "NafathService" },
        evidence: [{ file: "src/nafath/nafath.service.ts", line: 8 }],
      },
      {
        id: "generic",
        kind: "integration",
        data: { owner: "HttpService" },
        evidence: [{ file: "src/http.ts", line: 3 }],
      },
      ...(
        ["SanadService", "HyperPayClient", "EmailProviderService"] as const
      ).map((owner) => ({
        id: owner,
        kind: "integration",
        data: { owner },
        evidence: [{ file: `src/${owner.toLowerCase()}.ts`, line: 1 }],
      })),
    ];
    const integrations = discoverSemanticIntegrations(findings);
    expect(
      integrations.find((item) => item.provider === "Nafath")?.callSites,
    ).toHaveLength(2);
    expect(
      integrations.find((item) => item.identity === "UNKNOWN")?.findings,
    ).toHaveLength(1);
    expect(integrations.map((item) => item.provider)).toEqual(
      expect.arrayContaining(["Nafath", "Sanad", "HyperPay", "Email Provider"]),
    );
  });
});
