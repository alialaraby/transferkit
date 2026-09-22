import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { auditMessagingKnowledge } from "@transferkit/core";
import { renderMessagingMarkdown } from "@transferkit/renderers";
import { messagingConsumerRequirements } from "@transferkit/standards";

import { readHandoverState } from "./handover-state.js";

export const messagingExportFileName = ".transferkit/handover/messaging.md";

export async function exportHandover(
  workingDirectory: string,
): Promise<string> {
  const state = await readHandoverState(workingDirectory);
  const audit = auditMessagingKnowledge(state, messagingConsumerRequirements);
  const file = join(workingDirectory, messagingExportFileName);
  const temporaryFile = `${file}.tmp`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(temporaryFile, renderMessagingMarkdown(state, audit), "utf8");
  await rename(temporaryFile, file);
  return file;
}
