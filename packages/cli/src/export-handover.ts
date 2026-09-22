import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  auditHandoverKnowledge,
  auditMessagingKnowledge,
} from "@transferkit/core";
import {
  renderHandoverPackage,
  renderMessagingMarkdown,
  renderSingleFileHandover,
} from "@transferkit/renderers";
import {
  handoverRequirements,
  messagingConsumerRequirements,
} from "@transferkit/standards";

import { readHandoverState } from "./handover-state.js";

export const messagingExportFileName = ".transferkit/handover/messaging.md";
export const handoverExportDirectoryName = ".transferkit/handover";
export const singleFileExportName = "HANDOVER.md";

export interface ExportHandoverOptions {
  single?: boolean;
}

const generatedFileNames = [
  "overview.md",
  "architecture.md",
  "data.md",
  "messaging.md",
  "integrations.md",
  "operations.md",
  "deployment.md",
  "risks.md",
  "ownership.md",
] as const;

export async function exportHandover(
  workingDirectory: string,
  options: ExportHandoverOptions = {},
): Promise<string> {
  const state = await readHandoverState(workingDirectory);
  const audit = auditHandoverKnowledge(state, handoverRequirements);
  const messagingAudit = auditMessagingKnowledge(
    state,
    messagingConsumerRequirements,
  );
  const documents = renderHandoverPackage(
    state,
    audit,
    renderMessagingMarkdown(state, messagingAudit),
  );
  if (options.single === true) {
    const file = join(workingDirectory, singleFileExportName);
    const temporaryFile = `${file}.tmp`;
    await writeFile(temporaryFile, renderSingleFileHandover(documents), "utf8");
    await rename(temporaryFile, file);
    return file;
  }
  const directory = join(workingDirectory, handoverExportDirectoryName);
  await mkdir(directory, { recursive: true });

  for (const document of documents) {
    const file = join(directory, document.fileName);
    const temporaryFile = `${file}.tmp`;
    await writeFile(temporaryFile, document.contents, "utf8");
    await rename(temporaryFile, file);
  }

  const currentFiles = new Set(documents.map(({ fileName }) => fileName));
  for (const fileName of generatedFileNames) {
    if (!currentFiles.has(fileName))
      await removeIfPresent(join(directory, fileName));
  }
  return directory;
}

async function removeIfPresent(file: string): Promise<void> {
  try {
    await unlink(file);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
}
