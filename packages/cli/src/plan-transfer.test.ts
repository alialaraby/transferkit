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
    const guide = document
      .split("## How to use this handover\n")[1]!
      .split("\n---\n")[0]!;
    expect(guide).toContain("_[Critical]_");
    expect(guide).toContain("_[Recommended]_");
    expect(guide).toContain("_[Optional]_");
    expect(guide).toContain("required Cover points");
    expect(guide).toContain("Completion fields");
    expect(guide).toContain("tk handover sync");
    expect(guide).toContain("tk handover status");
    expect(document).toContain(
      `<!-- tk:item ${transfer.plan.items[0]!.id} -->`,
    );
    expect(document).toContain("**Notes**");
    expect(document).not.toContain("#### Open Cases");
    expect(document).not.toContain("#### References");
    expect(document).not.toContain("#### Repository Context");
    expect(document).toContain(
      "### [ ] Explain the system architecture and boundaries _[Critical]_",
    );
    expect(document).toContain(
      "### [ ] Review external service dependencies and failure handling _[Recommended]_",
    );
    expect(document).toContain(
      "### [ ] Assign production and provider ownership to the Next Owner _[Critical · Ownership]_",
    );
    expect(document).toContain(
      "### [ ] Next Owner demonstrates a safe deployment and recovery _[Critical · Verify]_",
    );
    expect(document).toMatch(
      /### \[ \] .+ _\[(Critical|Recommended|Optional)(?: · (Action|Ownership))?\]_/u,
    );
    expect(document).not.toContain("Priority: CRITICAL");
    expect(document).not.toContain("- [ ] Complete item");
    expect(document).not.toContain('<hr style="width: 50%;margin: 0;">');
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
    expect(document).toContain("### [ ] Payment _[Critical]_");
    expect(document).toContain("PaymentController → PaymentService");
    expect(document).toContain("### [ ] Payment lifecycle");
    expect(document).toContain("### [ ] HyperPay");
    expect(document).toContain("Detected schedule: 0 2 * * *");
    expect(document).toContain("<!-- tk:point domain:payment:handoff -->");
    expect(document).toContain("<!-- tk:context:start -->");
    expect(document).toContain("<summary>Code references</summary>");
    expect(document).toContain("**Context:**");
    expect(document).toContain("`PaymentController`");
    expect(document).toMatch(/- `src\/[^`]+`/u);
    const separator = '</br>\n<hr style="width: 50%;margin: 0;">\n</br>';
    const domainSection = document
      .split("## Business Domains\n")[1]!
      .split("\n---\n")[0]!;
    expect(domainSection.match(/<!-- tk:item /gu)?.length).toBeGreaterThan(1);
    expect(domainSection.split(separator).length - 1).toBe(
      domainSection.match(/<!-- tk:item /gu)!.length,
    );
    expect(domainSection).toMatch(
      /<\/details>\n\n<\/br>\n<hr style="width: 50%;margin: 0;">\n<\/br>/u,
    );
    expect(document).not.toContain(
      "Explain the main business domains and responsibilities",
    );
  });
});
