import {
  personalOnboardingExerciseIds,
  type PersonalOnboardingExerciseId,
} from "@transferkit/core";

export interface ExerciseCheckbox {
  id: PersonalOnboardingExerciseId;
  checked: boolean;
  characterIndex: number;
}

export function parsePersonalOnboardingMarkdown(
  source: string,
): ExerciseCheckbox[] {
  const markerPattern = /^<!-- tk:onboard:exercise ([^\s>]+) -->$/gmu;
  const markers = [...source.matchAll(markerPattern)];
  const markerLines = source
    .split(/\r?\n/u)
    .filter((line) => line.includes("<!-- tk:onboard:exercise"));
  if (markers.length !== markerLines.length)
    throw new Error(
      "Personal ONBOARDING.md has a malformed exercise marker; both files were left untouched.",
    );
  const known = new Set<string>(personalOnboardingExerciseIds);
  const seen = new Set<string>();
  const checkboxes: ExerciseCheckbox[] = [];
  for (const marker of markers) {
    const id = marker[1]!;
    if (!known.has(id))
      throw new Error(
        `Unknown personal exercise ID ${id}; both files were left untouched.`,
      );
    if (seen.has(id))
      throw new Error(
        `Duplicate personal exercise ID ${id}; both files were left untouched.`,
      );
    seen.add(id);
    const start = marker.index! + marker[0].length;
    const nextHeading = /^## /gmu.exec(source.slice(start));
    const end = nextHeading ? start + nextHeading.index! : source.length;
    const body = source.slice(start, end);
    const matches = [
      ...body.matchAll(/^- \[([ xX✓✔])\] \*\*Objective:\*\*/gmu),
    ];
    if (matches.length !== 1)
      throw new Error(
        `Exercise ${id} needs exactly one Objective checkbox; both files were left untouched.`,
      );
    checkboxes.push({
      id: id as PersonalOnboardingExerciseId,
      checked: matches[0]![1] !== " ",
      characterIndex: start + matches[0]!.index! + 3,
    });
  }
  for (const id of personalOnboardingExerciseIds)
    if (!seen.has(id))
      throw new Error(
        `Missing personal exercise ID ${id}; both files were left untouched.`,
      );
  return checkboxes;
}

export function updatePersonalOnboardingCheckboxes(
  source: string,
  checkboxes: readonly ExerciseCheckbox[],
  desired: ReadonlyMap<PersonalOnboardingExerciseId, boolean>,
): string {
  let result = source;
  for (const checkbox of [...checkboxes].sort(
    (left, right) => right.characterIndex - left.characterIndex,
  )) {
    const checked = desired.get(checkbox.id);
    if (checked === undefined || checked === checkbox.checked) continue;
    result =
      result.slice(0, checkbox.characterIndex) +
      (checked ? "x" : " ") +
      result.slice(checkbox.characterIndex + 1);
  }
  return result;
}
