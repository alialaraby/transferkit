import {
  evaluateItemCompletion,
  sectionProgress,
  type HandoverItem,
  type SectionStatus,
  type Transfer,
} from "@transferkit/core";

export interface MarkdownSyncResult {
  transfer: Transfer;
  checklistUpdates: number;
  completionRequests: number;
  incomplete: { title: string; missing: string[] }[];
  notices: string[];
}

interface Marker {
  id: string;
  line: number;
}

export function parseTransferMarkdown(
  source: string,
  transfer: Transfer,
): MarkdownSyncResult {
  const lines = source.split(/\r?\n/u);
  if (
    lines.filter((line) => line.trim() === "<!-- tk:handover-v3 -->").length !==
    1
  )
    throw new Error(
      "HANDOVER.md is not a valid v3 workspace (missing or duplicate v3 marker)",
    );
  const sections = markers(lines, "section");
  const items = markers(lines, "item");
  ranges(lines, "context");
  ranges(lines, "notes");
  duplicateIds(sections, "section");
  duplicateIds(items, "item");
  const sectionMap = new Map(
    transfer.plan.sections.map((section) => [section.id, section]),
  );
  const itemMap = new Map(transfer.plan.items.map((item) => [item.id, item]));
  for (const marker of sections)
    if (!sectionMap.has(marker.id))
      throw new Error(`Unknown section marker: ${marker.id}`);
  for (const marker of sections)
    if (!/^## .+/u.test(lines[marker.line - 1] ?? ""))
      throw new Error(
        `Section ${marker.id} needs a heading immediately before its marker`,
      );
  for (const marker of items)
    if (!itemMap.has(marker.id))
      throw new Error(`Unknown item marker: ${marker.id}`);
  const notices: string[] = [];
  let checklistUpdates = 0;
  let completionRequests = 0;
  const incomplete: MarkdownSyncResult["incomplete"] = [];
  const updated = new Map<string, HandoverItem>();
  const observed = new Map<string, string[]>();

  const firstSection = sections[0]?.line ?? lines.length;
  const metadata = lines.slice(0, firstSection);
  const currentOwner = field(metadata, "Current Owner");
  const nextOwner = field(metadata, "Next Owner");
  const targetDate = field(metadata, "Target Date");
  if (currentOwner !== undefined && !currentOwner.trim())
    throw new Error("Current Owner cannot be empty");
  if (targetDate?.trim() && Number.isNaN(Date.parse(targetDate.trim())))
    throw new Error("Invalid Target Date");

  for (let index = 0; index < items.length; index++) {
    const marker = items[index]!;
    const original = itemMap.get(marker.id)!;
    const heading = lines[marker.line - 1]?.match(/^### (.+)$/u);
    if (!heading)
      throw new Error(
        `Item ${marker.id} needs a title heading immediately before its marker`,
      );
    const legacyHeading = heading[1]!.match(/^\[([ xX✓✔])\] (.+)$/u);
    const oldHeadingMetadata = legacyHeading?.[2]?.match(
      /^(.*) · \*\*(Critical|Recommended|Optional)\*\* · (Walkthrough|Action|Ownership|Open work|Risk|Verify|Reference)$/u,
    );
    const headingMetadata = legacyHeading?.[2]?.match(
      /^(.*) _\[(Critical|Recommended|Optional)(?: · (Action|Ownership|Open work|Risk|Verify|Reference))?\]_$/u,
    );
    const section = [...sections]
      .reverse()
      .find((candidate) => candidate.line < marker.line);
    if (!section) throw new Error(`Item ${marker.id} has no section marker`);
    if (
      lines
        .slice(section.line + 1, marker.line - 1)
        .some((line) => /^## [^#]/u.test(line))
    )
      throw new Error(
        `Item ${marker.id} appears under a section without a stable marker`,
      );
    const nextBoundary = Math.min(
      items[index + 1]?.line ?? lines.length,
      sections.find((candidate) => candidate.line > marker.line)?.line ??
        lines.length,
    );
    const body = lines.slice(
      marker.line + 1,
      nextBoundary > marker.line + 1 ? nextBoundary - 1 : nextBoundary,
    );
    validateBlocks(body, marker.id);
    const display = compactMetadata(body, marker.id);
    const type = headingMetadata
      ? (headingMetadata[3] ?? "Walkthrough").toUpperCase().replaceAll(" ", "_")
      : oldHeadingMetadata
        ? oldHeadingMetadata[3]!.toUpperCase().replaceAll(" ", "_")
        : (display?.type ?? fieldBeforeHeading(body, "Type"));
    if (type !== undefined && type !== original.type)
      throw new Error(`Item ${marker.id} type cannot be changed in Markdown`);
    const priority = headingMetadata
      ? headingMetadata[2]!.toUpperCase()
      : oldHeadingMetadata
        ? oldHeadingMetadata[2]!.toUpperCase()
        : (display?.priority ?? fieldBeforeHeading(body, "Priority"));
    if (
      priority !== undefined &&
      !["CRITICAL", "RECOMMENDED", "OPTIONAL"].includes(priority)
    )
      throw new Error(`Invalid priority for item ${marker.id}`);
    const title = (
      headingMetadata?.[1] ??
      oldHeadingMetadata?.[1] ??
      legacyHeading?.[2] ??
      heading[1]!
    ).trim();
    if (!title) throw new Error(`Item ${marker.id} needs a title`);
    let item: HandoverItem = {
      ...original,
      title,
      priority: (priority ?? original.priority) as HandoverItem["priority"],
    };
    const note = block(body, "notes", marker.id);
    if (note !== undefined)
      item = { ...item, notes: note.join("\n").replace(/^\n|\n$/gu, "") };
    const pointLines = body.filter((line) => line.includes("<!-- tk:point "));
    const pointIds = new Set<string>();
    const checklist = item.checklist.map((point) => {
      const matches = pointLines.filter((line) =>
        line.includes(`<!-- tk:point ${point.id} -->`),
      );
      if (matches.length > 1)
        throw new Error(`Duplicate checklist point marker: ${point.id}`);
      if (!matches.length) {
        notices.push(
          `Checklist point ${point.id} is absent from Markdown; retained in Transfer state.`,
        );
        return point;
      }
      const checked = matches[0]!.match(
        /^- \[([ xX✓✔])\] .+ <!-- tk:point ([^\s>]+) -->$/u,
      );
      if (!checked) throw new Error(`Malformed checklist point ${point.id}`);
      pointIds.add(point.id);
      const covered = isChecked(checked[1]!);
      if (covered !== point.covered) checklistUpdates++;
      return { ...point, covered };
    });
    for (const line of pointLines) {
      const match = line.match(/<!-- tk:point ([^\s>]+) -->/u);
      if (!match || !pointIds.has(match[1]!))
        throw new Error(
          `Unknown or malformed checklist point in item ${marker.id}`,
        );
    }
    const coverStart = body.indexOf("#### Cover");
    if (coverStart >= 0) {
      const coverEnd = body.findIndex(
        (line, lineIndex) => lineIndex > coverStart && line.startsWith("#### "),
      );
      for (const line of body.slice(
        coverStart + 1,
        coverEnd < 0 ? body.length : coverEnd,
      ))
        if (/^- \[[ xX✓✔]\] /u.test(line) && !line.includes("<!-- tk:point "))
          notices.push(
            `Unrecognized checklist line in item ${marker.id} was not imported: ${line}`,
          );
    }
    item = { ...item, checklist };
    item = applyCompletionFields(item, body);
    const requested = legacyHeading
      ? isChecked(legacyHeading[1]!)
      : completionCheckbox(body, marker.id);
    if (item.type === "WALKTHROUGH" && !body.includes("#### Completion"))
      item = { ...item, completion: { confirmed: requested } };
    if (requested) {
      if (original.status !== "DONE") completionRequests++;
      const evaluation = evaluateItemCompletion(item);
      if (evaluation.complete) item = { ...item, status: "DONE" };
      else {
        item = {
          ...item,
          status: original.status === "DONE" ? "IN_PROGRESS" : original.status,
        };
        incomplete.push({
          title: item.title,
          missing: evaluation.reasons.map((reason) =>
            reason.code === "REQUIRED_POINT_UNCOVERED"
              ? (item.checklist.find((point) => point.id === reason.pointId)
                  ?.text ?? reason.code)
              : reasonLabel(reason.code),
          ),
        });
      }
    } else if (original.status === "DONE") item = { ...item, status: "TODO" };
    updated.set(item.id, item);
    observed.set(section.id, [...(observed.get(section.id) ?? []), item.id]);
  }

  const knownHeaders = new Set(items.map((marker) => marker.line - 1));
  const notesRanges = ranges(lines, "notes");
  for (let line = 0; line < lines.length; line++) {
    if (
      /^### (?:\[[ xX]\] )?.+/u.test(lines[line]!) &&
      !knownHeaders.has(line) &&
      !notesRanges.some(([start, end]) => line > start && line < end)
    )
      notices.push(
        `Unrecognized item at line ${line + 1} was not imported: ${lines[line]!.slice(4)}`,
      );
  }
  for (const item of transfer.plan.items) {
    if (
      !updated.has(item.id) &&
      !(
        item.provenance.kind === "SUGGESTED" &&
        item.provenance.decision === "REJECTED"
      )
    )
      notices.push(
        `Item ${item.id} is absent from Markdown; retained in Transfer state.`,
      );
  }
  const sectionOrder = sections.map((marker) => marker.id);
  const requestedSections = new Map<string, SectionStatus>();
  for (const marker of sections) {
    const boundary = Math.min(
      items.find((item) => item.line > marker.line)?.line ?? lines.length,
      sections.find((section) => section.line > marker.line)?.line ??
        lines.length,
    );
    const statusLines = lines
      .slice(marker.line + 1, boundary)
      .filter((line) => /^\*\*Status:\*\*/u.test(line));
    if (statusLines.length > 1)
      throw new Error(`Duplicate Status for section ${marker.id}`);
    if (statusLines.length)
      requestedSections.set(
        marker.id,
        parseSectionStatus(
          statusLines[0]!.replace(/^\*\*Status:\*\*/u, "").trim(),
        ),
      );
  }
  const reordered = [
    ...sectionOrder.map((id) => sectionMap.get(id)!),
    ...transfer.plan.sections.filter(
      (section) => !sectionOrder.includes(section.id),
    ),
  ].map((section) => {
    const status = requestedSections.get(section.id);
    const { status: previousStatus, ...sectionWithoutStatus } = section;
    void previousStatus;
    const nextSection = {
      ...sectionWithoutStatus,
      ...(status === "BLOCKED" ||
      status === "SKIPPED" ||
      status === "NOT_APPLICABLE"
        ? { status }
        : {}),
      itemIds: [
        ...(observed.get(section.id) ?? []),
        ...section.itemIds.filter((id) => !updated.has(id)),
      ],
    };
    if (status === "COMPLETED") {
      const progress = sectionProgress(
        nextSection,
        transfer.plan.items.map((item) => updated.get(item.id) ?? item),
      );
      if (progress.incomplete.length)
        throw new Error(
          `Cannot complete "${section.title}":\n${progress.incomplete.map((title) => `- ${title} remains incomplete`).join("\n")}`,
        );
    }
    return nextSection;
  });
  const next: Transfer = {
    ...transfer,
    currentOwner: currentOwner?.trim() ?? transfer.currentOwner,
    ...((nextOwner === undefined ? transfer.nextOwner : nextOwner.trim())
      ? {
          nextOwner: (nextOwner === undefined
            ? transfer.nextOwner
            : nextOwner.trim())!,
        }
      : {}),
    ...((targetDate === undefined ? transfer.targetDate : targetDate.trim())
      ? {
          targetDate: (targetDate === undefined
            ? transfer.targetDate
            : targetDate.trim())!,
        }
      : {}),
    plan: {
      ...transfer.plan,
      sections: reordered,
      items: transfer.plan.items.map((item) => updated.get(item.id) ?? item),
    },
  };
  if (nextOwner !== undefined && !nextOwner.trim()) delete next.nextOwner;
  if (targetDate !== undefined && !targetDate.trim()) delete next.targetDate;
  const baseline = transfer.markdownSnapshot;
  if (baseline) {
    const currentSnapshot = snapshotTransfer(transfer);
    const editedSnapshot = snapshotTransfer(next);
    if (
      baseline.metadata !== currentSnapshot.metadata &&
      editedSnapshot.metadata !== currentSnapshot.metadata
    )
      throw new Error(
        "Transfer metadata changed in both state and Markdown; resolve the conflict before sync",
      );
    for (const item of transfer.plan.items) {
      if (!updated.has(item.id)) continue;
      if (
        baseline.items[item.id] !== undefined &&
        baseline.items[item.id] !== currentSnapshot.items[item.id] &&
        editedSnapshot.items[item.id] !== currentSnapshot.items[item.id]
      )
        throw new Error(
          `Item ${item.id} changed in both state and Markdown; resolve the conflict before sync`,
        );
    }
  }
  next.markdownSnapshot = snapshotTransfer(next);
  return {
    transfer: next,
    checklistUpdates,
    completionRequests,
    incomplete,
    notices,
  };
}

export function refreshSectionProgress(
  source: string,
  transfer: Transfer,
): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/u);
  const byId = new Map(
    transfer.plan.sections.map((section) => [section.id, section]),
  );
  for (const marker of markers(lines, "section").reverse()) {
    const section = byId.get(marker.id);
    if (!section) continue;
    const progress = sectionProgress(section, transfer.plan.items);
    const next = lines.findIndex(
      (line, index) =>
        index > marker.line && (/^### /u.test(line) || /^## /u.test(line)),
    );
    const end = next < 0 ? lines.length : next;
    const display = progress.status.toLowerCase().replaceAll("_", " ");
    const fields = [
      [/^\*\*Status:\*\*/u, `**Status:** ${display}  `],
      [
        /^\*\*Progress:\*\*/u,
        `**Progress:** ${progress.done} / ${progress.total}`,
      ],
    ] as const;
    for (const [pattern, replacement] of fields) {
      const index = lines.findIndex(
        (line, index) =>
          index > marker.line && index < end && pattern.test(line),
      );
      if (index >= 0) lines[index] = replacement;
      else lines.splice(marker.line + 2, 0, replacement);
    }
  }
  return lines.join(newline);
}

function completionCheckbox(body: string[], itemId: string): boolean {
  const matches = body.filter((line) =>
    /^- \[[ xX✓✔]\] Complete item$/u.test(line),
  );
  if (matches.length !== 1)
    throw new Error(
      `Item ${itemId} needs exactly one '- [ ] Complete item' checkbox`,
    );
  return isChecked(matches[0]![3]!);
}

function isChecked(value: string): boolean {
  return value.toLowerCase() === "x" || value === "✓" || value === "✔";
}

function parseSectionStatus(value: string): SectionStatus {
  const normalized = value
    .toLowerCase()
    .replace(/[_-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const aliases: Record<string, SectionStatus> = {
    "not started": "NOT_STARTED",
    "in progress": "IN_PROGRESS",
    completed: "COMPLETED",
    complete: "COMPLETED",
    done: "COMPLETED",
    blocked: "BLOCKED",
    skipped: "SKIPPED",
    skip: "SKIPPED",
    "not applicable": "NOT_APPLICABLE",
    "n/a": "NOT_APPLICABLE",
    na: "NOT_APPLICABLE",
  };
  const status = aliases[normalized];
  if (!status) throw new Error(`Invalid section Status: ${value}`);
  return status;
}

function compactMetadata(
  body: string[],
  itemId: string,
):
  | { priority: HandoverItem["priority"]; type: HandoverItem["type"] }
  | undefined {
  const beforeHeading = body.slice(
    0,
    body.findIndex((line) => line.startsWith("#### ")) < 0
      ? body.length
      : body.findIndex((line) => line.startsWith("#### ")),
  );
  const lines = beforeHeading.filter((line) => line.startsWith("> **"));
  if (!lines.length) return undefined;
  if (lines.length !== 1)
    throw new Error(`Duplicate item metadata for ${itemId}`);
  const match = lines[0]!.match(
    /^> \*\*(Critical|Recommended|Optional)\*\* · (Walkthrough|Action|Ownership|Open work|Risk|Verify|Reference)(?: · (Suggested|Pending review|Accepted))?$/u,
  );
  if (!match) throw new Error(`Malformed item metadata for ${itemId}`);
  return {
    priority: match[1]!.toUpperCase() as HandoverItem["priority"],
    type: match[2]!.toUpperCase().replaceAll(" ", "_") as HandoverItem["type"],
  };
}

export function snapshotTransfer(
  transfer: Transfer,
): NonNullable<Transfer["markdownSnapshot"]> {
  return {
    metadata: JSON.stringify([
      transfer.currentOwner,
      transfer.nextOwner ?? "",
      transfer.targetDate ?? "",
    ]),
    items: Object.fromEntries(
      transfer.plan.items.map((item) => [
        item.id,
        JSON.stringify([
          item.title,
          item.priority,
          item.status,
          item.checklist.map((point) => [point.id, point.covered]),
          item.completion,
          item.notes ?? "",
        ]),
      ]),
    ),
  };
}

function markers(lines: string[], kind: "item" | "section"): Marker[] {
  return lines.flatMap((line, index) => {
    if (!line.includes(`<!-- tk:${kind}`)) return [];
    const match = line.match(
      new RegExp(`^<!-- tk:${kind} ([^\\s>]+) -->$`, "u"),
    );
    if (!match)
      throw new Error(`Malformed ${kind} marker at line ${index + 1}`);
    return [{ id: match[1]!, line: index }];
  });
}
function duplicateIds(values: Marker[], kind: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id))
      throw new Error(`Duplicate ${kind} marker: ${value.id}`);
    seen.add(value.id);
  }
}
function field(lines: string[], key: string): string | undefined {
  const matches = lines.filter((line) => line.startsWith(`${key}:`));
  if (matches.length > 1) throw new Error(`Duplicate ${key} field`);
  return matches[0]?.slice(key.length + 1).trim();
}
function fieldBeforeHeading(lines: string[], key: string): string | undefined {
  return field(
    lines.slice(
      0,
      lines.findIndex((line) => line.startsWith("#### ")) < 0
        ? lines.length
        : lines.findIndex((line) => line.startsWith("#### ")),
    ),
    key,
  );
}
function ranges(lines: string[], name: string): [number, number][] {
  const starts = lines.flatMap((line, index) =>
    line.trim() === `<!-- tk:${name}:start -->` ? [index] : [],
  );
  const ends = lines.flatMap((line, index) =>
    line.trim() === `<!-- tk:${name}:end -->` ? [index] : [],
  );
  if (
    starts.length !== ends.length ||
    starts.some(
      (start, index) =>
        start >= ends[index]! || (index > 0 && start <= ends[index - 1]!),
    )
  )
    throw new Error(`Malformed ${name} managed block`);
  return starts.map(
    (start, index) => [start, ends[index]!] as [number, number],
  );
}
function validateBlocks(lines: string[], itemId: string): void {
  for (const name of ["context", "notes"]) {
    if (ranges(lines, name).length !== 1)
      throw new Error(`Item ${itemId} needs exactly one ${name} managed block`);
  }
}
function block(
  lines: string[],
  name: string,
  itemId: string,
): string[] | undefined {
  const found = ranges(lines, name);
  if (!found.length) return undefined;
  if (found.length > 1)
    throw new Error(`Duplicate ${name} block for ${itemId}`);
  return lines.slice(found[0]![0] + 1, found[0]![1]);
}
function yesNo(value: string | undefined, key: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "yes") return true;
  if (value === "no") return false;
  throw new Error(`${key} must be yes or no`);
}
function applyCompletionFields(
  item: HandoverItem,
  body: string[],
): HandoverItem {
  const start = body.indexOf("#### Completion");
  if (start < 0) return item;
  const end = body.findIndex(
    (line, index) => index > start && line.startsWith("#### "),
  );
  const fields = body.slice(start + 1, end < 0 ? body.length : end);
  switch (item.type) {
    case "WALKTHROUGH":
      return {
        ...item,
        completion: {
          confirmed:
            yesNo(field(fields, "Confirmed"), "Confirmed") ??
            item.completion.confirmed,
        },
      };
    case "ACTION":
      return {
        ...item,
        completion: {
          performed:
            yesNo(field(fields, "Performed"), "Performed") ??
            item.completion.performed,
        },
      };
    case "OWNERSHIP":
      return {
        ...item,
        completion: {
          ...(field(fields, "Assignee")
            ? { assignee: field(fields, "Assignee")! }
            : {}),
        },
      };
    case "OPEN_WORK":
      return {
        ...item,
        completion: {
          ...(field(fields, "Current Status")
            ? { currentStatus: field(fields, "Current Status")! }
            : {}),
          ...(field(fields, "Assignee")
            ? { assignee: field(fields, "Assignee")! }
            : {}),
          ...(field(fields, "Disposition")
            ? { disposition: field(fields, "Disposition")! }
            : {}),
        },
      };
    case "RISK":
      return {
        ...item,
        completion: {
          ...item.completion,
          ...(field(fields, "Risk") ? { risk: field(fields, "Risk")! } : {}),
          ...(field(fields, "Mitigation or Recovery")
            ? { mitigationOrRecovery: field(fields, "Mitigation or Recovery")! }
            : {}),
          ...(field(fields, "Owner") ? { owner: field(fields, "Owner")! } : {}),
          ...((yesNo(field(fields, "Accepted"), "Accepted") ??
            item.completion.accepted) !== undefined
            ? {
                accepted: (yesNo(field(fields, "Accepted"), "Accepted") ??
                  item.completion.accepted)!,
              }
            : {}),
        },
      };
    case "VERIFY":
      return {
        ...item,
        completion: {
          succeeded:
            yesNo(field(fields, "Succeeded"), "Succeeded") ??
            item.completion.succeeded,
        },
      };
    case "REFERENCE":
      return item;
  }
}
function reasonLabel(code: string): string {
  return (
    (
      {
        CONFIRMATION_REQUIRED: "explicit confirmation",
        ACTION_NOT_PERFORMED: "action performed",
        ASSIGNEE_REQUIRED: "next owner or assignee",
        STATUS_REQUIRED: "current status",
        DISPOSITION_OR_ASSIGNEE_REQUIRED: "assignee or disposition",
        RISK_REQUIRED: "risk description",
        MITIGATION_REQUIRED: "mitigation or recovery",
        OWNER_OR_ACCEPTANCE_REQUIRED: "owner or risk acceptance",
        VERIFICATION_NOT_SUCCESSFUL: "successful verification",
        REFERENCE_REQUIRED: "required reference",
      } as Record<string, string>
    )[code] ?? code
  );
}
