import { cp, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { runCli } from "./cli.js";
import {
  exportHandover,
  handoverExportDirectoryName,
  singleFileExportName,
} from "./export-handover.js";
import { readHandoverState, writeHandoverState } from "./handover-state.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/realistic-nestjs",
);
async function project() {
  const directory = await mkdtemp(join(tmpdir(), "transferkit-export-v2-"));
  await cp(fixture, directory, { recursive: true });
  return directory;
}
async function document(directory: string, name: string) {
  return readFile(join(directory, handoverExportDirectoryName, name), "utf8");
}

describe("handover export v2", () => {
  it("shows unanswered structure and unscoped notes without repeating integration evidence", async () => {
    const directory = await project();
    const state = await readHandoverState(directory);
    state.guided = {
      customTopics: [],
      skipped: [],
      notApplicable: [],
      notes: [
        { areaId: "architecture", value: "The payment boundary needs review" },
      ],
    };
    await writeHandoverState(directory, state);
    await exportHandover(directory);
    const architecture = await document(directory, "architecture.md");
    expect(architecture).toContain(
      "Maintainer context (not counted as coverage)",
    );
    expect(architecture).toContain(
      "topic still to explain; see [remaining gaps]",
    );
    const integrations = await document(directory, "integrations.md");
    expect(integrations).toContain("Identity: partner.example.test (observed)");
    expect(integrations.match(/src\/partner\.client\.ts:12/gu)).toHaveLength(1);
    expect(integrations).toContain("Call sites:");
    expect(integrations).not.toContain("**Known failures**");
  });
  it("organizes observed context, maintainer knowledge, flows, and gaps for ownership transfer", async () => {
    const directory = await project();
    const state = await readHandoverState(directory);
    state.knowledge.push(
      {
        entityId: "system-overview.purpose",
        field: "content",
        value: "Shipments move through fulfillment",
      },
      {
        entityId: "ownership-contacts.owners",
        field: "content",
        value: "Platform team",
      },
    );
    state.guided = {
      customTopics: [
        { id: "settlement", title: "Monthly settlement", priority: "critical" },
      ],
      skipped: [],
      notApplicable: [],
      flows: [
        {
          id: "manual:shipment-lifecycle",
          name: "Shipment lifecycle",
          origin: "manual",
          status: "confirmed",
          details: {
            purpose: "Deliver shipments",
            mainPath: "Receive, route, dispatch",
            failurePaths: "Retry webhook",
          },
        },
      ],
    };
    await writeHandoverState(directory, state);
    await exportHandover(directory);
    const files = await readdir(join(directory, handoverExportDirectoryName));
    expect(files).toEqual(
      expect.arrayContaining([
        "README.md",
        "system-overview.md",
        "architecture.md",
        "business-flows.md",
        "async-and-jobs.md",
        "deployment.md",
        "ownership.md",
        "remaining-gaps.md",
      ]),
    );
    expect(await document(directory, "system-overview.md")).toContain(
      "Shipments move through fulfillment",
    );
    expect(await document(directory, "business-flows.md")).toContain(
      "Shipment lifecycle",
    );
    expect(await document(directory, "business-flows.md")).toContain(
      "Retry webhook",
    );
    expect(await document(directory, "async-and-jobs.md")).toContain(
      "src/shipment.jobs.ts",
    );
    expect(await document(directory, "deployment.md")).toContain("Dockerfile");
    expect(await document(directory, "ownership.md")).toContain(
      "Platform team",
    );
    expect(await document(directory, "remaining-gaps.md")).toContain(
      "maintainer knowledge needed",
    );
    expect(
      (await document(directory, "README.md")).match(/Missing critical/gu),
    ).toBeNull();
  });

  it("supports deterministic single-file output and does not mutate shared state", async () => {
    const directory = await project();
    const before = await readHandoverState(directory);
    const stdout: string[] = [];
    expect(
      await runCli(["handover", "export", "--single"], {
        cwd: directory,
        stdout: (message) => stdout.push(message),
        stderr: () => undefined,
      }),
    ).toBe(0);
    const first = await readFile(join(directory, singleFileExportName), "utf8");
    expect(first).toContain("# Remaining Knowledge Gaps");
    expect(stdout[0]).toContain(singleFileExportName);
    await exportHandover(directory, { single: true });
    expect(await readFile(join(directory, singleFileExportName), "utf8")).toBe(
      first,
    );
    expect(await readHandoverState(directory)).toEqual(before);
  });

  it("removes obsolete generated pages but preserves unrelated notes", async () => {
    const directory = await project();
    await exportHandover(directory);
    await writeFile(
      join(directory, handoverExportDirectoryName, "messaging.md"),
      "old generated page",
    );
    await writeFile(
      join(directory, handoverExportDirectoryName, "notes.md"),
      "keep",
    );
    await exportHandover(directory);
    const files = await readdir(join(directory, handoverExportDirectoryName));
    expect(files).not.toContain("messaging.md");
    expect(files).toContain("notes.md");
  });

  it("redacts secret-like human content", async () => {
    const directory = await project();
    const state = await readHandoverState(directory);
    state.knowledge.push({
      entityId: "system-overview.purpose",
      field: "content",
      value: "Use API_TOKEN=super-secret-value for access",
    });
    await writeHandoverState(directory, state);
    await exportHandover(directory);
    const output = await document(directory, "system-overview.md");
    expect(output).toContain("API_TOKEN=[REDACTED]");
    expect(output).not.toContain("super-secret-value");
  });
});
