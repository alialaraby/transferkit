import { expect, it } from "vitest";

import type { OnboardingStoryEvidence } from "@transferkit/core";

import { selectOnboardingStoryInventory } from "./onboarding-story.js";

it("ranks a repeated central record without inventing its business meaning", () => {
  const source = { file: "src/shipment.ts", line: 4 };
  const evidence: OnboardingStoryEvidence = {
    claims: [
      {
        kind: "entry",
        name: "ShipmentController.create",
        text: "POST /shipments is declared on ShipmentController.create.",
        basis: "code-observation",
        evidence: [source],
      },
      {
        kind: "entry",
        name: "ShipmentController.assign",
        text: "POST /shipments/:id/assign is declared on ShipmentController.assign.",
        basis: "code-observation",
        evidence: [source],
      },
    ],
    terms: [
      {
        name: "Fleet",
        codeRole: "declared data entity",
        evidence: [source],
        relationCount: 1,
        relations: [],
      },
      {
        name: "Shipment",
        codeRole: "declared data entity",
        evidence: [source],
        relationCount: 7,
        relations: [{ property: "fleet", target: "Fleet", evidence: [source] }],
      },
    ],
    rejectedDescriptions: [
      {
        text: "NestJS starter repository",
        evidence: [{ file: "README.md", line: 3 }],
        reason: "generic starter text",
      },
    ],
  };
  const inventory = selectOnboardingStoryInventory(evidence);
  expect(inventory.terms[0]?.name).toBe("Shipment");
  expect(inventory.terms[0]?.meaning).toBeUndefined();
  expect(inventory.terms[0]?.relations[0]?.target).toBe("Fleet");
  expect(inventory.purpose).toBeUndefined();
  expect(inventory.unknowns).toContain(
    "The repository purpose is not established by project-specific prose.",
  );
  expect(inventory.rejectedDescriptions[0]?.evidence[0]?.file).toBe(
    "README.md",
  );
});
