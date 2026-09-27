import { describe, expect, it } from "vitest";

import { createPipedPrompt, dependencies, packageName } from "./index.js";

describe("workspace packages", () => {
  it("resolves the intended CLI dependencies", () => {
    expect(packageName).toBe("@transferkit/cli");
    expect(dependencies).toEqual([
      "@transferkit/core",
      "@transferkit/scanners",
      "@transferkit/standards",
      "@transferkit/renderers",
    ]);
  });

  it("keeps piped answers available until a delayed interactive command requests them", async () => {
    const prompt = createPipedPrompt("1: Settlement purpose\nsave\n");
    await Promise.resolve();
    expect(await prompt("Handover note > ")).toBe("1: Settlement purpose");
    expect(await prompt("Handover note > ")).toBe("save");
    await expect(prompt("Handover note > ")).rejects.toThrow(
      "No piped handover answer remains",
    );
  });
});
