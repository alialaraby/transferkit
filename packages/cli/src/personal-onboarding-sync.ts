import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  personalOnboardingExerciseIds,
  type OnboardingTaskStatus,
  type PersonalOnboardingExerciseId,
  type PersonalOnboardingExerciseProgress,
  type PersonalOnboardingState,
} from "@transferkit/core";

import {
  parsePersonalOnboardingMarkdown,
  updatePersonalOnboardingCheckboxes,
} from "./personal-onboarding-markdown.js";

const markdownName = ".transferkit.local/ONBOARDING.md";
const stateName = ".transferkit.local/onboarding-v2.json";

export async function initializePersonalOnboardingState(
  directory: string,
): Promise<void> {
  const state = initialState();
  await writeFile(join(directory, stateName), serialize(state), {
    encoding: "utf8",
    flag: "wx",
  });
}

export async function readPersonalOnboardingState(
  directory: string,
): Promise<PersonalOnboardingState | undefined> {
  const source = await optionalRead(join(directory, stateName));
  return source === undefined ? undefined : parseState(source);
}

export async function syncPersonalOnboarding(
  directory: string,
): Promise<string> {
  return reconcile(directory);
}

export async function setPersonalExerciseStatus(
  directory: string,
  id: string,
  status: OnboardingTaskStatus,
): Promise<string> {
  if (
    !personalOnboardingExerciseIds.includes(id as PersonalOnboardingExerciseId)
  )
    throw new Error(`Unknown personal exercise ID ${id}`);
  return reconcile(directory, {
    id: id as PersonalOnboardingExerciseId,
    status,
  });
}

async function reconcile(
  directory: string,
  override?: { id: PersonalOnboardingExerciseId; status: OnboardingTaskStatus },
): Promise<string> {
  const markdownFile = join(directory, markdownName);
  const stateFile = join(directory, stateName);
  const markdown = await optionalRead(markdownFile);
  if (markdown === undefined)
    throw new Error(`No ${markdownName}; run 'tk onboard workspace' first.`);
  const checkboxes = parsePersonalOnboardingMarkdown(markdown);
  const stateSource = await optionalRead(stateFile);
  const state =
    stateSource === undefined ? initialState() : parseState(stateSource);
  const currentById = new Map(state.exercises.map((item) => [item.id, item]));
  const checkboxById = new Map(checkboxes.map((item) => [item.id, item]));
  const nextExercises: PersonalOnboardingExerciseProgress[] = [];
  const nextSnapshot = {} as PersonalOnboardingState["markdownSnapshot"];
  const desired = new Map<PersonalOnboardingExerciseId, boolean>();
  const conflicts: string[] = [];
  let imported = 0;
  for (const id of personalOnboardingExerciseIds) {
    const current = currentById.get(id)!;
    const checkbox = checkboxById.get(id)!;
    const baseline = state.markdownSnapshot[id];
    const proposedStatus =
      override?.id === id ? override.status : current.status;
    const jsonChanged = proposedStatus !== baseline.status;
    const markdownChanged = checkbox.checked !== baseline.checked;
    const agrees =
      proposedStatus === (checkbox.checked ? "completed" : "not-started");
    if (
      (jsonChanged && markdownChanged && !agrees) ||
      (override?.id === id && markdownChanged && !agrees)
    ) {
      conflicts.push(
        `${id}: Markdown checkbox is ${checkbox.checked ? "checked" : "unchecked"}; JSON status is ${proposedStatus}. Last synced: ${baseline.checked ? "checked" : "unchecked"} / ${baseline.status}.`,
      );
      continue;
    }
    const status =
      markdownChanged && !jsonChanged && override?.id !== id
        ? checkbox.checked
          ? "completed"
          : "not-started"
        : proposedStatus;
    if (markdownChanged && !jsonChanged && override?.id !== id) imported++;
    const checked = status === "completed";
    desired.set(id, checked);
    nextExercises.push({
      id,
      status,
      ...(status === "completed"
        ? {
            completedAt:
              current.status === "completed" && current.completedAt
                ? current.completedAt
                : new Date().toISOString(),
          }
        : {}),
    });
    nextSnapshot[id] = { status, checked };
  }
  if (conflicts.length)
    throw new Error(
      `Personal onboarding conflict; both files were left untouched:\n${conflicts.join("\n")}`,
    );
  const next: PersonalOnboardingState = {
    schemaVersion: 1,
    exercises: nextExercises,
    markdownSnapshot: nextSnapshot,
  };
  const nextMarkdown = updatePersonalOnboardingCheckboxes(
    markdown,
    checkboxes,
    desired,
  );
  const stateChanged =
    stateSource === undefined || JSON.stringify(next) !== JSON.stringify(state);
  if (!stateChanged && nextMarkdown === markdown)
    return "Personal onboarding is already synchronized; no files changed.";
  if (
    (await optionalRead(markdownFile)) !== markdown ||
    (await optionalRead(stateFile)) !== stateSource
  )
    throw new Error(
      "Personal onboarding changed during synchronization; both files were left untouched. Rerun after reviewing the latest files.",
    );
  // Markdown first: an interrupted write can be re-imported from the old snapshot.
  if (nextMarkdown !== markdown) await atomicWrite(markdownFile, nextMarkdown);
  if (stateChanged) await atomicWrite(stateFile, serialize(next));
  return override
    ? `Updated ${override.id} to ${override.status}; personal Markdown and JSON are synchronized.`
    : `Synced personal onboarding: ${imported} checkbox change${imported === 1 ? "" : "s"} imported.`;
}

function initialState(): PersonalOnboardingState {
  return {
    schemaVersion: 1,
    exercises: personalOnboardingExerciseIds.map((id) => ({
      id,
      status: "not-started",
    })),
    markdownSnapshot: Object.fromEntries(
      personalOnboardingExerciseIds.map((id) => [
        id,
        { status: "not-started", checked: false },
      ]),
    ) as PersonalOnboardingState["markdownSnapshot"],
  };
}

function parseState(source: string): PersonalOnboardingState {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(
      `Invalid ${stateName}: expected JSON; both files were left untouched.`,
    );
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("exercises" in value) ||
    !Array.isArray(value.exercises) ||
    !("markdownSnapshot" in value) ||
    typeof value.markdownSnapshot !== "object" ||
    value.markdownSnapshot === null
  )
    throw new Error(`Invalid ${stateName}; both files were left untouched.`);
  const state = value as PersonalOnboardingState;
  const ids = state.exercises.map((item) => item?.id);
  if (
    ids.length !== personalOnboardingExerciseIds.length ||
    new Set(ids).size !== ids.length ||
    personalOnboardingExerciseIds.some((id) => !ids.includes(id))
  )
    throw new Error(
      `Invalid ${stateName}: missing or duplicate exercise IDs; both files were left untouched.`,
    );
  for (const item of state.exercises) {
    if (
      !validStatus(item.status) ||
      (item.completedAt !== undefined && typeof item.completedAt !== "string")
    )
      throw new Error(
        `Invalid ${stateName}: unsupported exercise status; both files were left untouched.`,
      );
  }
  for (const id of personalOnboardingExerciseIds) {
    const snapshot = state.markdownSnapshot[id];
    if (
      !snapshot ||
      !validStatus(snapshot.status) ||
      typeof snapshot.checked !== "boolean"
    )
      throw new Error(
        `Invalid ${stateName}: missing sync snapshot for ${id}; both files were left untouched.`,
      );
  }
  return state;
}

function validStatus(value: unknown): value is OnboardingTaskStatus {
  return (
    value === "not-started" ||
    value === "in-progress" ||
    value === "completed" ||
    value === "skipped"
  );
}

function serialize(state: PersonalOnboardingState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

async function atomicWrite(file: string, contents: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
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
