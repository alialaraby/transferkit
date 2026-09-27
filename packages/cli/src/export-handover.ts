import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";

import {
  renderHandoverPackageV2,
  renderSingleFileHandover,
} from "@transferkit/renderers";

import { loadGuidedHandover } from "./guided-handover.js";

export const handoverExportDirectoryName = ".transferkit/handover";
export const singleFileExportName = "HANDOVER.md";

export interface ExportHandoverOptions {
  single?: boolean;
}

export async function exportHandover(
  workingDirectory: string,
  options: ExportHandoverOptions = {},
): Promise<string> {
  if (options.single === true)
    await protectV3Workspace(join(workingDirectory, singleFileExportName));
  const { plan, context } = await loadGuidedHandover(workingDirectory, false);
  const projectName = await packageName(workingDirectory);
  const documents = renderHandoverPackageV2(plan, projectName, context);
  if (options.single === true) {
    const file = join(workingDirectory, singleFileExportName);
    const temporaryFile = `${file}.tmp`;
    await writeFile(temporaryFile, renderSingleFileHandover(documents), "utf8");
    await rename(temporaryFile, file);
    return file;
  }
  const directory = join(workingDirectory, handoverExportDirectoryName);
  await mkdir(directory, { recursive: true });
  const generated = new Set(documents.map(({ fileName }) => fileName));
  for (const document of documents) {
    const file = join(directory, document.fileName);
    const temporaryFile = `${file}.tmp`;
    await writeFile(temporaryFile, document.contents, "utf8");
    await rename(temporaryFile, file);
  }
  for (const fileName of await readdir(directory)) {
    if (generated.has(fileName) || !previousGenerated.has(fileName)) continue;
    await unlink(join(directory, fileName));
  }
  return directory;
}

async function protectV3Workspace(file: string): Promise<void> {
  try {
    const existing = await readFile(file, "utf8");
    if (existing.includes("<!-- tk:handover-v3 -->"))
      throw new Error(
        "Cannot replace the active v3 HANDOVER.md with a legacy export",
      );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
}

const previousGenerated = new Set([
  "overview.md",
  "architecture.md",
  "data.md",
  "messaging.md",
  "integrations.md",
  "operations.md",
  "deployment.md",
  "risks.md",
  "ownership.md",
  "README.md",
  "system-overview.md",
  "business-flows.md",
  "async-and-jobs.md",
  "security.md",
  "failures-and-recovery.md",
  "known-problems.md",
  "work-in-progress.md",
  "custom-topics.md",
  "remaining-gaps.md",
]);

async function packageName(directory: string): Promise<string> {
  try {
    const value: unknown = JSON.parse(
      await readFile(join(directory, "package.json"), "utf8"),
    );
    if (
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      typeof value.name === "string" &&
      value.name.trim()
    )
      return value.name;
  } catch {
    /* Repository scanning reports malformed package metadata separately. */
  }
  return basename(directory);
}
