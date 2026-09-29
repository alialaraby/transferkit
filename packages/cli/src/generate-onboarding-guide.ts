import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { renderOnboardingGuide } from "@transferkit/renderers";
import { scanRepository } from "@transferkit/scanners";
import {
  explainCandidateFlows,
  understandProject,
} from "@transferkit/standards";

const snapshotName = ".transferkit/onboarding-guide-snapshot.json";
const unmarkedMessage =
  "ONBOARDING.md has no TransferKit guide markers; it was left untouched. Move it aside, run 'tk onboard guide', then merge your notes back.";
type Snapshot = { version: 1; sections: Record<string, string> };
type Block = { id: string; start: number; end: number; text: string };

export async function generateOnboardingGuide(
  directory: string,
): Promise<string> {
  const file = join(directory, "ONBOARDING.md");
  const existing = await optionalRead(file);
  if (existing !== undefined && !existing.includes("<!-- tk:onboard:section "))
    throw new Error(unmarkedMessage);
  const snapshotFile = join(directory, snapshotName);
  const previous =
    existing === undefined ? undefined : await loadSnapshot(snapshotFile);
  if (existing !== undefined && !previous)
    throw new Error(
      "ONBOARDING.md has TransferKit markers but no valid generation snapshot; it was left untouched. Restore the snapshot before regenerating.",
    );

  const findings = await scanRepository(directory);
  const model = understandProject(findings);
  const proposed = markSections(
    renderOnboardingGuide(
      model,
      findings,
      explainCandidateFlows(model, findings),
    ),
  );
  const generated = parseBlocks(proposed);
  const next: Snapshot = {
    version: 1,
    sections: Object.fromEntries(
      generated.map((block) => [block.id, block.text]),
    ),
  };

  if (existing === undefined) {
    try {
      await writeFile(file, proposed, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (hasCode(error, "EEXIST")) throw new Error(unmarkedMessage);
      throw error;
    }
    await saveSnapshot(snapshotFile, next);
    return "Generated ONBOARDING.md from repository evidence. Runtime behavior remains unverified.";
  }

  const current = parseBlocks(existing);
  const currentIds = new Set(current.map((block) => block.id));
  for (const id of Object.keys(previous!.sections))
    if (!currentIds.has(id))
      throw new Error(
        `Managed section ${id} is missing from ONBOARDING.md; it was left untouched. Restore its markers or resolve the deletion before regenerating.`,
      );
  const generatedById = new Map(
    generated.map((block) => [block.id, block.text]),
  );
  const conflicts: string[] = [];
  const replacements = new Map<string, string>();
  for (const block of current) {
    const baseline = previous!.sections[block.id];
    if (baseline === undefined)
      throw new Error(
        `Managed section ${block.id} has no generation snapshot; ONBOARDING.md was left untouched.`,
      );
    const fresh = generatedById.get(block.id);
    const personChanged = block.text !== baseline;
    const generatorChanged = fresh !== baseline;
    if (personChanged && generatorChanged && block.text !== fresh)
      conflicts.push(
        `Section ${block.id} changed in both places.\n--- Current ONBOARDING.md ---\n${block.text}\n--- Newly generated ---\n${fresh ?? "[section removed by generator]"}`,
      );
    else if (!personChanged && fresh !== undefined)
      replacements.set(block.id, fresh);
    else if (personChanged) next.sections[block.id] = baseline;
  }
  if (conflicts.length)
    throw new Error(
      `ONBOARDING.md was left untouched because regeneration conflicts require resolution:\n${conflicts.join("\n\n")}`,
    );

  let merged = existing;
  for (const block of [...current].reverse()) {
    const replacement = replacements.get(block.id);
    if (replacement !== undefined)
      merged =
        merged.slice(0, block.start) + replacement + merged.slice(block.end);
  }
  for (const block of generated)
    if (!currentIds.has(block.id))
      merged = `${merged.trimEnd()}\n\n${block.text}\n`;
  // A removed section with human edits remains in place and retains its baseline.
  for (const block of current)
    if (!generatedById.has(block.id)) {
      if (block.text === previous!.sections[block.id]) {
        const found = parseBlocks(merged).find((item) => item.id === block.id);
        if (found)
          merged = merged.slice(0, found.start) + merged.slice(found.end);
        delete next.sections[block.id];
      } else next.sections[block.id] = previous!.sections[block.id]!;
    }
  if (merged === existing && JSON.stringify(next) === JSON.stringify(previous))
    return "ONBOARDING.md is already up to date; no files changed.";
  if ((await optionalRead(file)) !== existing)
    throw new Error(
      "ONBOARDING.md changed during regeneration; it was left untouched. Rerun after reviewing the latest file.",
    );
  if (merged !== existing) await atomicWrite(file, merged);
  await saveSnapshot(snapshotFile, next);
  return "Regenerated ONBOARDING.md; human text was preserved. Runtime behavior remains unverified.";
}

function markSections(source: string): string {
  const headers = [...source.matchAll(/^## (.+)$/gmu)];
  if (!headers.length) throw new Error("Generated guide has no sections");
  let marked = source.slice(0, headers[0]!.index);
  for (let index = 0; index < headers.length; index++) {
    const header = headers[index]!;
    const id = header[1]!
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "");
    const body = source
      .slice(header.index, headers[index + 1]?.index ?? source.length)
      .trimEnd();
    marked += `<!-- tk:onboard:section ${id} begin -->\n${body}\n<!-- tk:onboard:section ${id} end -->\n\n`;
  }
  return marked.trimEnd() + "\n";
}

function parseBlocks(source: string): Block[] {
  const markers = [
    ...source.matchAll(
      /^<!-- tk:onboard:section ([a-z0-9-]+) (begin|end) -->$/gmu,
    ),
  ];
  if (!markers.length || markers.length % 2)
    throw new Error(
      "ONBOARDING.md has malformed or unmatched TransferKit markers; it was left untouched.",
    );
  const seen = new Set<string>();
  const blocks: Block[] = [];
  for (let index = 0; index < markers.length; index += 2) {
    const start = markers[index]!;
    const end = markers[index + 1]!;
    if (
      start[2] !== "begin" ||
      end[2] !== "end" ||
      start[1] !== end[1] ||
      seen.has(start[1]!)
    )
      throw new Error(
        "ONBOARDING.md has duplicate or misordered TransferKit markers; it was left untouched.",
      );
    seen.add(start[1]!);
    const stop = end.index! + end[0].length;
    blocks.push({
      id: start[1]!,
      start: start.index!,
      end: stop,
      text: source.slice(start.index!, stop),
    });
  }
  return blocks;
}

async function loadSnapshot(file: string): Promise<Snapshot | undefined> {
  const contents = await optionalRead(file);
  if (!contents) return undefined;
  try {
    const value: unknown = JSON.parse(contents);
    if (
      typeof value === "object" &&
      value !== null &&
      "version" in value &&
      value.version === 1 &&
      "sections" in value &&
      typeof value.sections === "object" &&
      value.sections !== null &&
      Object.values(value.sections).every(
        (section) => typeof section === "string",
      )
    )
      return value as Snapshot;
  } catch {
    /* Invalid snapshots are not used. */
  }
  return undefined;
}

async function saveSnapshot(file: string, snapshot: Snapshot): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await atomicWrite(file, `${JSON.stringify(snapshot, null, 2)}\n`);
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
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
