import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { createProjectState, serializeProjectState } from "@transferkit/core";

const stateDirectoryName = ".transferkit";
const projectFileName = "project.yaml";

export type InitializationResult =
  | { status: "initialized"; projectFile: string }
  | { status: "already-initialized"; projectFile: string };

export async function initializeHandover(
  workingDirectory: string,
  now: Date = new Date(),
): Promise<InitializationResult> {
  const stateDirectory = join(workingDirectory, stateDirectoryName);
  const projectFile = join(stateDirectory, projectFileName);

  await mkdir(stateDirectory, { recursive: true });

  const projectName = await deriveProjectName(workingDirectory);
  const contents = serializeProjectState(createProjectState(projectName, now));

  try {
    await writeFile(projectFile, contents, { encoding: "utf8", flag: "wx" });
    return { status: "initialized", projectFile };
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      const existingState = await stat(projectFile);
      if (existingState.isFile()) {
        return { status: "already-initialized", projectFile };
      }
    }

    throw error;
  }
}

async function deriveProjectName(workingDirectory: string): Promise<string> {
  try {
    const packageJson = await readFile(
      join(workingDirectory, "package.json"),
      "utf8",
    );
    const metadata: unknown = JSON.parse(packageJson);

    if (hasProjectName(metadata)) {
      return metadata.name.trim();
    }
  } catch {
    // Missing or invalid package metadata is not an initialization failure.
  }

  return basename(workingDirectory) || "project";
}

function hasProjectName(value: unknown): value is { name: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    value.name.trim().length > 0
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
