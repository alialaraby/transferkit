import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderPersonalOnboarding } from "@transferkit/renderers";
import { personalOnboardingExercises } from "@transferkit/standards";
import { initializePersonalOnboardingState } from "./personal-onboarding-sync.js";

const personalFileName = ".transferkit.local/ONBOARDING.md";
const existsMessage = `${personalFileName} already exists; it was left untouched. Edit it directly, then run 'tk onboard sync' to import checkbox changes.`;

export async function generateOnboardingWorkspace(
  directory: string,
): Promise<string> {
  const file = join(directory, personalFileName);
  try {
    await stat(file);
    throw new Error(existsMessage);
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }

  let guide: string;
  try {
    guide = await readFile(join(directory, "ONBOARDING.md"), "utf8");
  } catch (error) {
    if (hasCode(error, "ENOENT"))
      throw new Error(
        "Shared ONBOARDING.md is missing; run 'tk onboard guide' before creating a personal workspace.",
      );
    throw error;
  }
  const sections = new Map<string, string>();
  for (const match of guide.matchAll(
    /^<!-- tk:onboard:section ([a-z0-9-]+) begin -->\n([\s\S]*?)^<!-- tk:onboard:section \1 end -->$/gmu,
  )) {
    if (sections.has(match[1]!))
      throw new Error(
        "Shared ONBOARDING.md has duplicate section markers; repair it before creating a workspace.",
      );
    sections.set(match[1]!, match[2]!);
  }
  if (sections.size === 0)
    throw new Error(
      "Shared ONBOARDING.md has no TransferKit section markers; run 'tk onboard guide' to create a managed guide first.",
    );
  const explained = /^### /mu.test(sections.get("explained-flow") ?? "");
  const candidates = /^### /mu.test(sections.get("candidate-flows") ?? "");
  const exercises = personalOnboardingExercises(
    new Set(sections.keys()),
    explained,
    candidates,
  );
  await mkdir(join(directory, ".transferkit.local"), { recursive: true });
  try {
    await stat(join(directory, ".transferkit.local/onboarding-v2.json"));
    throw new Error(
      "Personal v2 progress already exists; restore .transferkit.local/ONBOARDING.md before creating a new workspace.",
    );
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
  try {
    await writeFile(file, renderPersonalOnboarding(exercises), {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if (hasCode(error, "EEXIST")) throw new Error(existsMessage);
    throw error;
  }
  await initializePersonalOnboardingState(directory);
  return `Generated ${personalFileName} with ${exercises.length} repository-only exercises. Legacy JSON progress was not changed.`;
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
