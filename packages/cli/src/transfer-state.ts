import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import {
  parseTransferState,
  serializeTransferState,
  type Transfer,
} from "@transferkit/core";

export const transferStateFileName = ".transferkit/transfer.json";

export async function readTransferState(
  workingDirectory: string,
): Promise<Transfer | undefined> {
  try {
    return parseTransferState(
      await readFile(join(workingDirectory, transferStateFileName), "utf8"),
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeTransferState(
  workingDirectory: string,
  transfer: Transfer,
): Promise<void> {
  const contents = serializeTransferState(transfer);
  const file = join(workingDirectory, transferStateFileName);
  await mkdir(dirname(file), { recursive: true });
  const temporaryFile = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporaryFile, "wx", 0o600);
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryFile, file);
  } catch (error) {
    await unlink(temporaryFile).catch(() => undefined);
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
