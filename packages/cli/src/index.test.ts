import { describe, expect, it } from "vitest";

import { dependencies, packageName } from "./index.js";

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
});
