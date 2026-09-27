import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readTransferState } from "./transfer-state.js";
import { planTransfer } from "./plan-transfer.js";
import { runCli } from "./cli.js";

describe("tk handover plan", () => {
  it("persists a reviewable plan and creates a bounded v3 workspace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "transferkit-plan-"));
    await writeFile(join(directory, "package.json"), '{"name":"example"}');
    const summary = await planTransfer(directory);
    const transfer = (await readTransferState(directory))!;
    const document = await readFile(join(directory, "HANDOVER.md"), "utf8");
    expect(summary).toContain("pending review");
    expect(document).toContain("<!-- tk:handover-v3 -->");
    expect(document).toContain(
      `<!-- tk:item ${transfer.plan.items[0]!.id} -->`,
    );
    expect(document).toContain("<!-- tk:context:start -->");
    expect(document).toContain("#### Notes");
    expect(document).not.toContain("#### Open Cases");
    expect(document).not.toContain("#### References");
    expect(document).not.toContain("#### Repository Context");
    expect(document).toContain("- [ ] Complete item");
    expect(document).toMatch(
      /> \*\*(Critical|Recommended|Optional)\*\* · (Walkthrough|Action|Ownership)/u,
    );
    expect(document).not.toContain("Priority: CRITICAL");
    expect(document).not.toContain("### [ ]");
    await planTransfer(directory, "reject", [transfer.plan.items[0]!.id]);
    await planTransfer(directory);
    expect(
      (await readTransferState(directory))!.plan.items[0]!.provenance,
    ).toMatchObject({ decision: "REJECTED" });
    expect(await readFile(join(directory, "HANDOVER.md"), "utf8")).toBe(
      document,
    );
  });

  it("preserves an existing v2-style document", async () => {
    const directory = await mkdtemp(join(tmpdir(), "transferkit-plan-"));
    const legacy =
      "# Example Handover\n\nThis package combines repository evidence and maintainer knowledge for ownership transfer.\n\nHuman notes.\n";
    await writeFile(join(directory, "HANDOVER.md"), legacy);
    expect(await planTransfer(directory)).toContain(
      "v2 generated export preserved",
    );
    expect(await readFile(join(directory, "HANDOVER.md"), "utf8")).toBe(legacy);
    expect(await readTransferState(directory)).toBeDefined();
  });

  it("routes the plan command without changing the legacy export path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "transferkit-plan-"));
    const output: string[] = [];
    const status = await runCli(["handover", "plan"], {
      cwd: directory,
      stdout: (message) => output.push(message),
      stderr: (message) => output.push(message),
    });
    expect(status).toBe(0);
    expect(output.join("\n")).toContain("Generated HANDOVER.md");
    expect(await readTransferState(directory)).toBeDefined();
  });

  it("renders project concepts as reviewable Markdown with bounded evidence", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "transferkit-project-plan-"),
    );
    await cp("fixtures/realistic-nestjs", directory, { recursive: true });
    await planTransfer(directory);
    const document = await readFile(join(directory, "HANDOVER.md"), "utf8");
    expect(document).toContain("## Business Domains");
    expect(document).toContain("### Walk through the Payment domain");
    expect(document).toContain("PaymentController → PaymentService");
    expect(document).toContain("### Walk through Payment callback handling");
    expect(document).toContain("Walk through HyperPay integration");
    expect(document).toContain("Detected schedule: 0 2 * * *");
    expect(document).toContain("<!-- tk:point domain:payment:handoff -->");
    expect(document).toContain("<!-- tk:context:start -->");
    expect(document).not.toContain(
      "Explain the main business domains and responsibilities",
    );
  });
});
