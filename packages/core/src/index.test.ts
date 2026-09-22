import { describe, expect, it } from "vitest";

import type { Evidence, Finding } from "./index.js";

describe("finding contracts", () => {
  it("represent scanner-specific data and kinds without defining them in core", () => {
    interface ScannerOwnedData {
      scannerValue: string;
    }

    const evidence: Evidence = {
      file: "scanner-input.txt",
      line: 3,
      description: "A scanner-specific observation",
    };
    const finding: Finding<ScannerOwnedData, "scanner.owned"> = {
      id: "scanner.owned:example",
      kind: "scanner.owned",
      data: { scannerValue: "example" },
      evidence: [evidence],
    };

    expect(finding).toEqual({
      id: "scanner.owned:example",
      kind: "scanner.owned",
      data: { scannerValue: "example" },
      evidence: [evidence],
    });
  });
});
