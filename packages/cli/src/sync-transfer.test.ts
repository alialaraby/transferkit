import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "./cli.js";
import { renderTransferHandover } from "@transferkit/renderers";
import { exportHandover } from "./export-handover.js";
import { planTransfer } from "./plan-transfer.js";
import { syncTransfer } from "./sync-transfer.js";
import { readTransferState } from "./transfer-state.js";
import { renderTransferStatus } from "./transfer-status.js";
import { parseTransferMarkdown } from "./transfer-markdown.js";

async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "transferkit-sync-"));
  await writeFile(join(directory, "package.json"), '{"name":"test-service"}');
  await planTransfer(directory);
  return directory;
}
async function document(directory: string): Promise<string> {
  return readFile(join(directory, "HANDOVER.md"), "utf8");
}
async function saveDocument(
  directory: string,
  contents: string,
): Promise<void> {
  await writeFile(join(directory, "HANDOVER.md"), contents);
}
function itemTask(title: string, checked: false): RegExp;
function itemTask(title: string, checked: true): string;
function itemTask(title: string, checked: boolean): RegExp | string {
  const heading = `### ${title.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`;
  if (!checked)
    return new RegExp(
      `(${heading}\\n<!-- tk:item [^\\n]+ -->\\n\\n)- \\[ \\] Complete item`,
      "u",
    );
  return "$1- [x] Complete item";
}

describe("v3 Markdown sync", () => {
  it("accepts every checkbox form and renders section progress and instructions", async () => {
    const directory = await workspace();
    const source = await document(directory);
    expect(source).toContain("**Status:** not started\n**Progress:** 0 / 1");
    expect(source).toContain("Edit this Markdown normally");
    expect(source).toContain("[x], [X], [✓], or [✔]");
    expect(source).toContain("tk handover sync");
    expect(source).toContain("tk handover status");
    for (const mark of ["x", "X", "✓", "✔"]) {
      const edited = source
        .replace("- [ ] Complete item", `- [${mark}] Complete item`)
        .replace(
          "- [ ] Major components and data paths",
          `- [${mark}] Major components and data paths`,
        );
      const state = (await readTransferState(directory))!;
      const result = parseTransferMarkdown(edited, state);
      expect(result.transfer.plan.items[0]?.checklist[0]?.covered).toBe(true);
      expect(result.completionRequests).toBe(1);
      expect(renderTransferHandover(result.transfer)).toContain(
        "- [x] Major components and data paths",
      );
    }
  });

  it("normalizes section status aliases and rejects invalid or premature completion", async () => {
    const directory = await workspace();
    const source = await document(directory);
    const state = (await readTransferState(directory))!;
    const aliases = [
      ["not started", "NOT_STARTED"],
      ["NOT_STARTED", "NOT_STARTED"],
      ["not-started", "NOT_STARTED"],
      ["in progress", "IN_PROGRESS"],
      ["IN_PROGRESS", "IN_PROGRESS"],
      ["in-progress", "IN_PROGRESS"],
      ["blocked", "BLOCKED"],
      ["skipped", "SKIPPED"],
      ["skip", "SKIPPED"],
      ["not applicable", "NOT_APPLICABLE"],
      ["not_applicable", "NOT_APPLICABLE"],
      ["not-applicable", "NOT_APPLICABLE"],
      ["n/a", "NOT_APPLICABLE"],
      ["na", "NOT_APPLICABLE"],
    ] as const;
    for (const [alias, expected] of aliases) {
      const result = parseTransferMarkdown(
        source.replace("**Status:** not started", `**Status:** ${alias}`),
        state,
      );
      const section = result.transfer.plan.sections[0]!;
      if (["BLOCKED", "SKIPPED", "NOT_APPLICABLE"].includes(expected))
        expect(section.status).toBe(expected);
      else expect(section.status).toBeUndefined();
    }
    for (const alias of ["completed", "complete", "done"]) {
      expect(() =>
        parseTransferMarkdown(
          source.replace("**Status:** not started", `**Status:** ${alias}`),
          state,
        ),
      ).toThrow('Cannot complete "System & Architecture"');
    }
    expect(() =>
      parseTransferMarkdown(
        source.replace("**Status:** not started", "**Status:** paused"),
        state,
      ),
    ).toThrow("Invalid section Status");
    const completed = source
      .replace("**Status:** not started", "**Status:** completed")
      .replace("- [ ] Complete item", "- [x] Complete item")
      .replace(
        "- [ ] Major components and data paths",
        "- [x] Major components and data paths",
      )
      .replace("- [ ] Where to start a change", "- [x] Where to start a change")
      .replace("Confirmed: no", "Confirmed: yes");
    expect(
      parseTransferMarkdown(completed, state).transfer.plan.items[0]?.status,
    ).toBe("DONE");
  });

  it("persists blocked, skipped and not applicable sections without counting them complete", async () => {
    const directory = await workspace();
    let source = await document(directory);
    source = source.replace("**Status:** not started", "**Status:** blocked");
    source = source.replace(
      /(## Business Domains\n<!-- tk:section [^\n]+ -->\n\n)\*\*Status:\*\* not started/u,
      "$1**Status:** skipped",
    );
    source = source.replace(
      /(## Critical Business Flows\n<!-- tk:section [^\n]+ -->\n\n)\*\*Status:\*\* not started/u,
      "$1**Status:** n/a",
    );
    await saveDocument(directory, source);
    const message = await syncTransfer(directory);
    const state = (await readTransferState(directory))!;
    expect(
      state.plan.sections.slice(0, 3).map((section) => section.status),
    ).toEqual(["BLOCKED", "SKIPPED", "NOT_APPLICABLE"]);
    expect(message).toContain("System & Architecture: BLOCKED");
    expect(renderTransferStatus(state)).toContain("0 / 15 complete");
    expect(renderTransferStatus(state)).toContain(
      "Critical Business Flows: not applicable (0 / 0)",
    );
    expect(await document(directory)).toContain(
      "**Status:** not applicable\n**Progress:** 0 / 0",
    );
  });
  it("refreshes derived progress after sync and ignores a hand-edited Progress value", async () => {
    const directory = await workspace();
    const source = (await document(directory)).replace(
      "**Progress:** 0 / 1",
      "**Progress:** 99 / 99",
    );
    await saveDocument(directory, source);
    await syncTransfer(directory);
    const refreshed = await document(directory);
    expect(refreshed).toContain("**Progress:** 0 / 1");
    expect(refreshed).not.toContain("99 / 99");
  });
  it("continues to sync existing v3 documents with heading checkboxes and field metadata", async () => {
    const directory = await workspace();
    const original = await document(directory);
    const title = "Confirm transfer tasks and outstanding exceptions";
    const modern = original.match(
      new RegExp(
        `### ${title}\\n<!-- tk:item [^\\n]+ -->\\n\\n- \\[ \\] Complete item\\n\\n> \\*\\*Critical\\*\\* · Action · Pending review`,
        "u",
      ),
    )![0];
    const legacy = modern
      .replace(`### ${title}`, `### [x] ${title}`)
      .replace(
        "\n\n- [ ] Complete item\n\n> **Critical** · Action · Pending review",
        "\n\nPriority: CRITICAL\nType: ACTION\nReview: PENDING",
      );
    const edited = original
      .replace(modern, legacy)
      .replace("Performed: no", "Performed: yes");
    await saveDocument(directory, edited);
    await syncTransfer(directory);
    expect(
      (await readTransferState(directory))!.plan.items.find(
        (item) => item.title === title,
      )?.status,
    ).toBe("DONE");
    expect(await document(directory)).toContain(
      "**Status:** completed\n**Progress:** 1 / 1",
    );
    expect(await document(directory)).toContain(
      "### [x] Confirm transfer tasks and outstanding exceptions",
    );
  });

  it("imports checkboxes, completion fields, notes, metadata, title and priority without touching human prose", async () => {
    const directory = await workspace();
    const before = await document(directory);
    const human =
      "\n## My own section\n\nA complicated note with **bold**, `code`, and [a link](https://example.test).\n\n> Keep this exact prose.\n";
    let edited = before
      .replace("Current Owner: Unassigned", "Current Owner: Ali")
      .replace("Next Owner: ", "Next Owner: Team B");
    edited = edited
      .replace(
        itemTask("Confirm transfer tasks and outstanding exceptions", false),
        itemTask("Confirm transfer tasks and outstanding exceptions", true),
      )
      .replace("Performed: no", "Performed: yes");
    edited = edited
      .replace(
        "### Explain the system architecture and boundaries",
        "### Explain the actual system boundaries",
      )
      .replace(
        "> **Critical** · Walkthrough",
        "> **Recommended** · Walkthrough",
      );
    edited = edited.replace(
      "- [ ] Major components and data paths",
      "- [x] Major components and data paths",
    );
    edited = edited.replace(
      "<!-- tk:notes:start -->\n\n<!-- tk:notes:end -->",
      "<!-- tk:notes:start -->\nHuman explanation.\n\n- Important context\n<!-- tk:notes:end -->",
    );
    edited += human;
    await saveDocument(directory, edited);
    const message = await syncTransfer(directory);
    const state = (await readTransferState(directory))!;
    expect(message).toContain("1 checklist updates");
    expect(state.currentOwner).toBe("Ali");
    expect(state.nextOwner).toBe("Team B");
    expect(
      state.plan.items.find(
        (item) =>
          item.title === "Confirm transfer tasks and outstanding exceptions",
      )?.status,
    ).toBe("DONE");
    expect(
      state.plan.items.find(
        (item) => item.title === "Explain the actual system boundaries",
      )?.checklist[0]?.covered,
    ).toBe(true);
    expect(
      state.plan.items.some((item) =>
        item.notes?.includes("Human explanation."),
      ),
    ).toBe(true);
    expect(await document(directory)).toContain(
      "**Status:** in progress\n**Progress:** 0 / 1",
    );
    expect(await document(directory)).toContain(
      "**Status:** completed\n**Progress:** 1 / 1",
    );
    expect((await document(directory)).endsWith(human)).toBe(true);
    expect(renderTransferStatus(state)).toContain("1 / 16 complete");
    await planTransfer(directory);
    expect(
      (await readTransferState(directory))!.plan.items.find(
        (item) => item.status === "DONE",
      )?.title,
    ).toBe("Confirm transfer tasks and outstanding exceptions");
  });

  it("keeps invalid completion requests incomplete and explains each missing rule", async () => {
    const directory = await workspace();
    let edited = await document(directory);
    edited = edited
      .replace(
        itemTask(
          "Assign production and provider ownership to the Next Owner",
          false,
        ),
        itemTask(
          "Assign production and provider ownership to the Next Owner",
          true,
        ),
      )
      .replace(
        itemTask(
          "Next Owner demonstrates a safe deployment and recovery",
          false,
        ),
        itemTask(
          "Next Owner demonstrates a safe deployment and recovery",
          true,
        ),
      )
      .replace(
        itemTask("Explain the system architecture and boundaries", false),
        itemTask("Explain the system architecture and boundaries", true),
      );
    await saveDocument(directory, edited);
    const message = await syncTransfer(directory);
    expect(message).toContain("3 items remain incomplete");
    expect(message).toContain("Missing: next owner or assignee");
    expect(message).toContain("Missing: successful verification");
    expect(message).toContain("Missing: Major components and data paths");
    expect(
      (await readTransferState(directory))!.plan.items.filter(
        (item) => item.status === "DONE",
      ),
    ).toHaveLength(0);
    expect(await document(directory)).toBe(edited);
  });

  it("preserves state and Markdown on duplicate IDs and malformed blocks", async () => {
    const directory = await workspace();
    const originalState = await readFile(
      join(directory, ".transferkit/transfer.json"),
      "utf8",
    );
    const original = await document(directory);
    const marker = original.match(/<!-- tk:item [^\n]+ -->/u)![0];
    const duplicate = `${original}\n${marker}\n`;
    await saveDocument(directory, duplicate);
    await expect(syncTransfer(directory)).rejects.toThrow(
      "Duplicate item marker",
    );
    expect(await document(directory)).toBe(duplicate);
    expect(
      await readFile(join(directory, ".transferkit/transfer.json"), "utf8"),
    ).toBe(originalState);
    const malformed = original.replace(
      "<!-- tk:context:end -->",
      "<!-- tk:context:broken -->",
    );
    await saveDocument(directory, malformed);
    await expect(syncTransfer(directory)).rejects.toThrow(
      "Malformed context managed block",
    );
    expect(
      await readFile(join(directory, ".transferkit/transfer.json"), "utf8"),
    ).toBe(originalState);
  });

  it("reports missing and manually added items, and preserves reviewed order", async () => {
    const directory = await workspace();
    const before = await document(directory);
    const state = (await readTransferState(directory))!;
    const first = state.plan.sections[0]!.itemIds[0]!;
    const second = state.plan.sections[1]!.itemIds[0]!;
    // Reorder complete section blocks while keeping stable section and item markers.
    const firstStart = before.indexOf("## System & Architecture");
    const secondStart = before.indexOf("## Business Domains");
    const thirdStart = before.indexOf("## Critical Business Flows");
    const reordered =
      before.slice(0, firstStart) +
      before.slice(secondStart, thirdStart) +
      before.slice(firstStart, secondStart) +
      before.slice(thirdStart);
    const edited =
      reordered.replace(`<!-- tk:item ${first} -->`, "") +
      "\n### [ ] Human task without marker\n";
    await saveDocument(directory, edited);
    const message = await syncTransfer(directory);
    expect(message).toContain("was not imported");
    expect(message).toContain(`Item ${first} is absent`);
    const loaded = (await readTransferState(directory))!;
    expect(loaded.plan.sections[0]!.id).toBe(state.plan.sections[1]!.id);
    expect(loaded.plan.items.some((item) => item.id === first)).toBe(true);
    expect(loaded.plan.items.some((item) => item.id === second)).toBe(true);
  });

  it("protects an active v3 workspace from legacy single-file export", async () => {
    const directory = await workspace();
    const original = await document(directory);
    await expect(exportHandover(directory, { single: true })).rejects.toThrow(
      "active v3",
    );
    expect(await document(directory)).toBe(original);
  });

  it("rejects stale Markdown that would undo a CLI review edit", async () => {
    const directory = await workspace();
    const original = await document(directory);
    const itemId = (await readTransferState(directory))!.plan.items[0]!.id;
    await planTransfer(directory, "rename", [itemId, "CLI reviewed title"]);
    const state = await readFile(
      join(directory, ".transferkit/transfer.json"),
      "utf8",
    );
    await expect(syncTransfer(directory)).rejects.toThrow(
      "changed in both state and Markdown",
    );
    expect(await document(directory)).toBe(original);
    expect(
      await readFile(join(directory, ".transferkit/transfer.json"), "utf8"),
    ).toBe(state);
  });

  it("fails safely when a known item moves under a section without a marker", async () => {
    const directory = await workspace();
    const originalState = await readFile(
      join(directory, ".transferkit/transfer.json"),
      "utf8",
    );
    const edited = (await document(directory)).replace(
      "<!-- tk:section section:2 -->",
      "",
    );
    await saveDocument(directory, edited);
    await expect(syncTransfer(directory)).rejects.toThrow(
      "section without a stable marker",
    );
    expect(
      await readFile(join(directory, ".transferkit/transfer.json"), "utf8"),
    ).toBe(originalState);
    expect(await document(directory)).toBe(edited);
  });

  it("preserves a rejected suggestion and a checked item through rescan", async () => {
    const directory = await workspace();
    const initial = (await readTransferState(directory))!;
    const rejected = initial.plan.items[0]!;
    await planTransfer(directory, "reject", [rejected.id]);
    let edited = await document(directory);
    edited = edited
      .replace(
        itemTask("Confirm transfer tasks and outstanding exceptions", false),
        itemTask("Confirm transfer tasks and outstanding exceptions", true),
      )
      .replace("Performed: no", "Performed: yes");
    await saveDocument(directory, edited);
    await syncTransfer(directory);
    await planTransfer(directory);
    const loaded = (await readTransferState(directory))!;
    expect(
      loaded.plan.items.find((item) => item.id === rejected.id)?.provenance,
    ).toMatchObject({ decision: "REJECTED" });
    expect(
      loaded.plan.items.find(
        (item) =>
          item.type === "ACTION" && item.title.includes("Confirm transfer"),
      )?.status,
    ).toBe("DONE");
  });

  it("imports item order within a section by stable markers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "transferkit-order-"));
    await cp("fixtures/realistic-nestjs", directory, { recursive: true });
    await planTransfer(directory);
    const state = (await readTransferState(directory))!;
    const section = state.plan.sections.find(
      (candidate) => candidate.title === "External Services",
    )!;
    expect(section.itemIds.length).toBeGreaterThanOrEqual(2);
    const source = await document(directory);
    const marker = (id: string) => source.indexOf(`<!-- tk:item ${id} -->`);
    const startA = source.lastIndexOf("### ", marker(section.itemIds[0]!));
    const startB = source.lastIndexOf("### ", marker(section.itemIds[1]!));
    const endB = source.indexOf("## Authentication & Security", startB);
    const swapped =
      source.slice(0, startA) +
      source.slice(startB, endB) +
      source.slice(startA, startB) +
      source.slice(endB);
    await saveDocument(directory, swapped);
    await syncTransfer(directory);
    expect(
      (await readTransferState(directory))!.plan.sections
        .find((candidate) => candidate.id === section.id)
        ?.itemIds.slice(0, 2),
    ).toEqual([section.itemIds[1], section.itemIds[0]]);
  });

  it("runs init → scan → plan → edit → sync → status on a realistic fixture", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "transferkit-realistic-sync-"),
    );
    await cp("fixtures/realistic-nestjs", directory, { recursive: true });
    const output: string[] = [];
    const environment = {
      cwd: directory,
      stdout: (message: string) => output.push(message),
      stderr: (message: string) => output.push(message),
    };
    for (const command of ["init", "scan", "plan", "status"])
      expect(await runCli(["handover", command], environment)).toBe(0);
    const before = output.at(-1)!;
    const original = await document(directory);
    await saveDocument(
      directory,
      original
        .replace(
          itemTask("Confirm transfer tasks and outstanding exceptions", false),
          itemTask("Confirm transfer tasks and outstanding exceptions", true),
        )
        .replace("Performed: no", "Performed: yes"),
    );
    expect(await runCli(["handover", "sync"], environment)).toBe(0);
    expect(await runCli(["handover", "status"], environment)).toBe(0);
    expect(before).toContain("0 /");
    expect(output.at(-1)).toContain("1 /");
  });
});
