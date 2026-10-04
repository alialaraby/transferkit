import type {
  Evidence,
  OnboardingConceptEvidence,
  OnboardingQueueEvidence,
  OnboardingStoryChapter,
  OnboardingStoryConnection,
  OnboardingStoryInventory,
  OnboardingStorySelection,
  OnboardingTrace,
} from "@transferkit/core";

import { selectOnboardingConcepts } from "./onboarding-concepts.js";
import { selectOnboardingContinuations } from "./onboarding-continuations.js";

interface Profile {
  trace: OnboardingTrace;
  category: "start" | "assignment" | "progress" | "callback" | "other";
  central: boolean;
  namedCentral: boolean;
  touched: { name: string; evidence: Evidence[] }[];
  score: number;
  meaningful: boolean;
}

export function selectOnboardingStories(
  traces: readonly OnboardingTrace[],
  inventory: OnboardingStoryInventory,
  concepts: OnboardingConceptEvidence,
  queues: OnboardingQueueEvidence,
  focusSymbol?: string,
): OnboardingStorySelection {
  const central = inventory.terms[0]?.name;
  const profiles = traces.map((trace) => profile(trace, central, concepts));
  const chosen: Profile[] = [];
  const remaining = profiles.filter((item) => item.meaningful);
  const focus = focusSymbol
    ? profiles.find((item) => item.trace.entry.symbol === focusSymbol)
    : undefined;
  const representative =
    focus ??
    best(
      remaining.filter((item) => item.central && item.category === "start"),
    ) ??
    best(remaining.filter((item) => item.central)) ??
    best(remaining);
  if (representative) take(representative, remaining, chosen);

  for (const category of ["assignment", "progress", "callback"] as const) {
    if (chosen.length >= 4) break;
    const next = best(
      remaining.filter(
        (item) => item.category === category && (item.central || !central),
      ),
    );
    if (next) take(next, remaining, chosen);
  }
  while (chosen.length < Math.min(4, profiles.length)) {
    const distinct = remaining.filter(
      (item) => !chosen.some((prior) => duplicate(item, prior)),
    );
    const related = distinct.filter(
      (item) =>
        item.central ||
        (!chosen.some((prior) => prior.central) &&
          chosen.some((prior) =>
            prior.touched.some((value) =>
              item.touched.some((other) => other.name === value.name),
            ),
          )),
    );
    const next =
      best(related) ??
      (chosen.some((item) => item.central) ? undefined : best(distinct));
    if (!next) break;
    take(next, remaining, chosen);
  }
  const chapters = chosen.map((item, index) =>
    chapter(
      item,
      inventory,
      index === 0 ? (focus ? "focused" : "representative") : "complementary",
      central,
    ),
  );
  if (!chapters.length) {
    const entry = inventory.entries[0];
    if (entry)
      chapters.push({
        id: entry.name ?? entry.text,
        role: focus ? "focused" : "representative",
        entry,
        ...(inventory.artifacts[0] ? { input: inventory.artifacts[0] } : {}),
        ...(inventory.outputs[0] ? { output: inventory.outputs[0] } : {}),
        reason: inventory.outputs.length
          ? "The documented entry and output give a useful starting path; source behavior is not traced."
          : "This is a declared entry; its internal path and output need inspection.",
        firstUnsupportedBoundary: {
          reason: "No supported source trace connects this entry to an output.",
          evidence: entry.evidence,
        },
        inspectNext: entry.evidence,
      });
  }
  return {
    chapters,
    connections: connections(chosen, inventory, queues, central),
    rejected: profiles
      .filter((item) => !chosen.includes(item))
      .map((item) => ({
        entry: item.trace.entry.symbol,
        reason:
          "Outside the four-chapter reading path; source trace remains available.",
      })),
  };
}

function profile(
  trace: OnboardingTrace,
  central: string | undefined,
  concepts: OnboardingConceptEvidence,
): Profile {
  const symbol = trace.entry.symbol;
  const method = symbol.split(".").at(-1) ?? "";
  const label = `${symbol} ${trace.entry.path ?? ""}`;
  const category: Profile["category"] = /webhook|callback/iu.test(label)
    ? "callback"
    : /^(?:add|create|register|submit|open|start)/iu.test(method) &&
        trace.entry.verb === "POST"
      ? "start"
      : /assign|distribut|allocate/iu.test(label)
        ? "assignment"
        : /pickup|deliver|status|consent|accept|approve|reject|confirm/iu.test(
              label,
            )
          ? "progress"
          : "other";
  const touched = selectOnboardingConcepts(trace, concepts)
    .filter((item) => item.calls.length)
    .map((item) => ({
      name: item.entity.name,
      evidence: item.calls.slice(0, 2).map((call) => ({
        file: call.at.file,
        line: call.at.line,
      })),
    }));
  const events = trace.methods.flatMap((item) => item.events);
  const decisions = events.filter(
    (item) => item.kind === "branch" || item.kind === "throw",
  ).length;
  const effects = events.filter((item) => item.effect).length;
  const meaningful =
    trace.methods.length > 1 ||
    decisions + effects > 0 ||
    trace.calls.some((call) => call.kind === "direct");
  const namedCentral = central
    ? label.toLowerCase().includes(central.toLowerCase())
    : false;
  const symbolCentral = central
    ? symbol.toLowerCase().includes(central.toLowerCase())
    : false;
  const isCentral =
    namedCentral || touched.some((item) => item.name === central);
  return {
    trace,
    category,
    central: isCentral,
    namedCentral,
    touched,
    score:
      (isCentral ? 70 : 0) +
      (namedCentral ? 160 : 0) +
      (symbolCentral ? 200 : 0) +
      (category === "start" ? 25 : 0) +
      Math.min(decisions, 8) * 3 +
      Math.min(effects, 8) * 3 +
      Math.min(trace.methods.length, 8) * 2 -
      (trace.gaps.length && !decisions && !effects ? 8 : 0),
    meaningful,
  };
}

function chapter(
  profile: Profile,
  inventory: OnboardingStoryInventory,
  role: OnboardingStoryChapter["role"],
  central: string | undefined,
): OnboardingStoryChapter {
  const { trace, category } = profile;
  const events = trace.methods.flatMap((method) => method.events);
  const decision = events.find(
    (event) => event.kind === "branch" || event.kind === "throw",
  );
  const result = events.find(
    (event) => event.effect === "write-like" || event.kind === "return",
  );
  const alternate = events.find(
    (event) =>
      (event.kind === "throw" || event.kind === "return") &&
      event.path.length > 0,
  );
  const gap = trace.gaps[0];
  const entry = inventory.entries.find(
    (claim) => claim.name === trace.entry.symbol,
  ) ?? {
    kind: "entry" as const,
    name: trace.entry.symbol,
    text: `${trace.entry.symbol} is a declared ${trace.entry.kind ?? "source"} entry.`,
    basis: "code-observation" as const,
    evidence: [
      {
        file: trace.entry.declaration.file,
        line: trace.entry.declaration.line,
      },
    ],
  };
  return {
    id: trace.entry.symbol,
    role,
    entry,
    trace,
    reason: `${profile.central && central ? `${central} appears in this entry or its traced data calls; ` : ""}${category === "start" ? "this is a declared creation/start entry" : category === "other" ? "this gives a distinct source entry" : `this shows a ${category} entry`}; ${decision ? "a decision is visible" : "no decision is established in the bounded trace"}; ${result ? "a return or effect is visible" : "the result is not established in the bounded trace"}.`,
    ...(decision
      ? { decision: { file: decision.at.file, line: decision.at.line } }
      : {}),
    ...(result
      ? { result: { file: result.at.file, line: result.at.line } }
      : {}),
    ...(alternate
      ? { alternate: { file: alternate.at.file, line: alternate.at.line } }
      : {}),
    ...(gap
      ? {
          firstUnsupportedBoundary: {
            reason: gap.reason,
            evidence: [{ file: gap.at.file, line: gap.at.line }],
          },
        }
      : {}),
    inspectNext: gap
      ? [{ file: gap.at.file, line: gap.at.line }]
      : trace.methods.slice(1, 2).map((method) => ({
          file: method.declaration.file,
          line: method.declaration.line,
        })),
  };
}

function connections(
  chosen: readonly Profile[],
  inventory: OnboardingStoryInventory,
  queues: OnboardingQueueEvidence,
  central: string | undefined,
): OnboardingStoryConnection[] {
  const result: OnboardingStoryConnection[] = [];
  for (const from of chosen) {
    for (const continuation of selectOnboardingContinuations(
      from.trace,
      queues,
    ))
      if (continuation.handler)
        result.push({
          from: from.trace.entry.symbol,
          to: continuation.handler.symbol,
          kind: "possible-async-continuation",
          explanation:
            "A literal queue publication matches this handler registration; execution and delivery are unverified.",
          evidence: [
            {
              file: continuation.publication.at.file,
              line: continuation.publication.at.line,
            },
            {
              file: continuation.handler.registration.file,
              line: continuation.handler.registration.line,
            },
          ],
        });
    for (const to of chosen) {
      if (from === to) continue;
      const direct = from.trace.calls.find(
        (call) =>
          call.kind === "direct" &&
          call.declaredTarget === to.trace.entry.symbol,
      );
      if (direct)
        result.push({
          from: from.trace.entry.symbol,
          to: to.trace.entry.symbol,
          kind: "direct-call",
          explanation: "The first entry directly calls the second declaration.",
          evidence: [{ file: direct.site.file, line: direct.site.line }],
        });
    }
  }
  for (let left = 0; left < chosen.length; left++)
    for (let right = left + 1; right < chosen.length; right++) {
      const from = chosen[left]!;
      const to = chosen[right]!;
      const shared = from.touched.find((item) =>
        to.touched.some((other) => other.name === item.name),
      );
      if (shared) {
        const other = to.touched.find((item) => item.name === shared.name)!;
        result.push({
          from: from.trace.entry.symbol,
          to: to.trace.entry.symbol,
          kind: "shared-artifact",
          explanation: `Both bounded traces touch ${shared.name}; this does not establish ordering or a call between them.`,
          evidence: [...shared.evidence, ...other.evidence],
        });
      } else {
        const documented = [
          ...(inventory.purpose ? [inventory.purpose] : []),
          ...inventory.artifacts,
          ...inventory.outputs,
        ].find(
          (claim) =>
            claim.basis === "repository-statement" &&
            claim.text.includes(from.trace.entry.symbol) &&
            claim.text.includes(to.trace.entry.symbol),
        );
        if (documented) {
          result.push({
            from: from.trace.entry.symbol,
            to: to.trace.entry.symbol,
            kind: "documented-relation",
            explanation:
              "Repository prose names both entries; a call or execution order remains unverified.",
            evidence: documented.evidence,
          });
        } else if (
          central &&
          `${from.trace.entry.symbol} ${from.trace.entry.path ?? ""}`
            .toLowerCase()
            .includes(central.toLowerCase()) &&
          `${to.trace.entry.symbol} ${to.trace.entry.path ?? ""}`
            .toLowerCase()
            .includes(central.toLowerCase())
        )
          result.push({
            from: from.trace.entry.symbol,
            to: to.trace.entry.symbol,
            kind: "unproven-association",
            explanation: `Both entries name ${central}, but the bounded traces do not prove shared state or sequence.`,
            evidence: [
              {
                file: from.trace.entry.declaration.file,
                line: from.trace.entry.declaration.line,
              },
              {
                file: to.trace.entry.declaration.file,
                line: to.trace.entry.declaration.line,
              },
            ],
          });
      }
    }
  return result;
}

function duplicate(left: Profile, right: Profile): boolean {
  if (left.trace.entry.kind !== right.trace.entry.kind) return false;
  const leftMethods = new Set(
    left.trace.methods.slice(1).map((item) => item.symbol),
  );
  const shared = right.trace.methods
    .slice(1)
    .some((item) => leftMethods.has(item.symbol));
  return (
    shared &&
    left.touched.every((item) =>
      right.touched.some((other) => other.name === item.name),
    )
  );
}

function best(profiles: readonly Profile[]): Profile | undefined {
  return [...profiles].sort(
    (left, right) =>
      right.score - left.score ||
      left.trace.entry.symbol.localeCompare(right.trace.entry.symbol),
  )[0];
}

function take(item: Profile, remaining: Profile[], chosen: Profile[]): void {
  chosen.push(item);
  const index = remaining.indexOf(item);
  if (index >= 0) remaining.splice(index, 1);
}
