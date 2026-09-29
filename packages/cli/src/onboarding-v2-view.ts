import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  OnboardingTaskStatus,
  PersonalOnboardingExercise,
  PersonalOnboardingExerciseId,
} from "@transferkit/core";
import { personalOnboardingExercises } from "@transferkit/standards";

import { parsePersonalOnboardingMarkdown } from "./personal-onboarding-markdown.js";
import { readPersonalOnboardingState } from "./personal-onboarding-sync.js";

export interface OnboardingV2View {
  exercises: PersonalOnboardingExercise[];
  statuses: Record<PersonalOnboardingExerciseId, OnboardingTaskStatus>;
  questions: string[];
  unknowns: string[];
  syncNeeded: boolean;
}

export async function readOnboardingV2View(directory: string): Promise<{
  view?: OnboardingV2View;
  fallbackHint: string;
}> {
  const guide = await optionalRead(join(directory, "ONBOARDING.md"));
  if (guide === undefined)
    return {
      fallbackHint:
        "Create the v2 guide with 'tk onboard guide', then run 'tk onboard workspace'.",
    };
  const sections = managedSections(guide);
  if (sections.size === 0)
    return {
      fallbackHint:
        "The existing ONBOARDING.md has no TransferKit section markers. Move it aside, run 'tk onboard guide', then create a workspace with 'tk onboard workspace'.",
    };
  const personal = await optionalRead(
    join(directory, ".transferkit.local/ONBOARDING.md"),
  );
  if (personal === undefined)
    return {
      fallbackHint:
        "The managed guide exists. Create your v2 workspace with 'tk onboard workspace'.",
    };

  const checkboxes = parsePersonalOnboardingMarkdown(personal);
  const state = await readPersonalOnboardingState(directory);
  const stateById = new Map(state?.exercises.map((item) => [item.id, item]));
  const statuses = Object.fromEntries(
    checkboxes.map(({ id, checked }) => [
      id,
      stateById.get(id)?.status ?? (checked ? "completed" : "not-started"),
    ]),
  ) as OnboardingV2View["statuses"];
  const exercises = personalOnboardingExercises(
    new Set(sections.keys()),
    /^### /mu.test(sections.get("explained-flow") ?? ""),
    /^### /mu.test(sections.get("candidate-flows") ?? ""),
  );
  return {
    view: {
      exercises,
      statuses,
      questions: personalQuestions(personal),
      unknowns: guideUnknowns(sections.get("unknowns") ?? ""),
      syncNeeded:
        !state ||
        checkboxes.some(
          ({ id, checked }) => state.markdownSnapshot[id].checked !== checked,
        ),
    },
    fallbackHint: "",
  };
}

function managedSections(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of source.matchAll(
    /^<!-- tk:onboard:section ([a-z0-9-]+) begin -->\n([\s\S]*?)^<!-- tk:onboard:section \1 end -->$/gmu,
  )) {
    if (result.has(match[1]!))
      throw new Error(
        `Shared ONBOARDING.md has duplicate section ID ${match[1]}`,
      );
    result.set(match[1]!, match[2]!);
  }
  return result;
}

function personalQuestions(source: string): string[] {
  return source.split(/^## /mu).flatMap((part) => {
    if (!part.includes("<!-- tk:onboard:exercise ")) return [];
    const lines = part.split(/\r?\n/u);
    const start = lines.findIndex((line) =>
      ["**Questions**", "### Questions"].includes(line.trim()),
    );
    if (start < 0) return [];
    const end = lines.findIndex(
      (line, index) =>
        index > start && ["**Evidence**", "### Evidence"].includes(line.trim()),
    );
    return lines
      .slice(start + 1, end < 0 ? lines.length : end)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line && line !== "_Add questions for a person or a runtime check._",
      );
  });
}

function guideUnknowns(source: string): string[] {
  return source
    .split(/\r?\n/u)
    .filter((line) => /^- \*\*(?:Unknown|Runtime unverified):\*\*/u.test(line))
    .map((line) => line.slice(2));
}

async function optionalRead(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}
