import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  createHandoverState,
  parseHandoverState,
  serializeHandoverState,
  type HandoverState,
} from "@transferkit/core";

export const handoverStateFileName = ".transferkit/handover.json";

export async function readHandoverState(
  workingDirectory: string,
): Promise<HandoverState> {
  const file = join(workingDirectory, handoverStateFileName);
  try {
    return parseHandoverState(await readFile(file, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return createHandoverState();
    }
    throw new Error(`Invalid TransferKit state in ${handoverStateFileName}`, {
      cause: error,
    });
  }
}

export async function writeHandoverState(
  workingDirectory: string,
  state: HandoverState,
): Promise<void> {
  const file = join(workingDirectory, handoverStateFileName);
  const temporaryFile = `${file}.tmp`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(temporaryFile, serializeHandoverState(state), "utf8");
  await rename(temporaryFile, file);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
