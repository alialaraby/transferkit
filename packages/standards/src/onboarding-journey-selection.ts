import type {
  Finding,
  OnboardingConceptEvidence,
  OnboardingQueueEvidence,
  OnboardingScheduledCall,
  OnboardingTrace,
  RouteTrace,
} from "@transferkit/core";

import { selectOnboardingConcepts } from "./onboarding-concepts.js";
import { selectOnboardingContinuations } from "./onboarding-continuations.js";

export interface OnboardingEntryCandidate {
  symbol: string;
  kind: "route" | "scheduled";
  routeFindingId?: string;
  verb?: string;
  path?: string;
  preliminaryScore: number;
}

export interface OnboardingJourneyDecision {
  trace: OnboardingTrace;
  score: number;
  reason: string;
}

export interface OnboardingJourneySelection {
  selected: OnboardingJourneyDecision[];
  rejected: OnboardingJourneyDecision[];
}

export function preselectOnboardingEntries(
  findings: readonly Finding[],
  queues: OnboardingQueueEvidence,
  scheduledCalls: readonly OnboardingScheduledCall[],
  focus?: string,
): {
  entries: string[];
  candidates: OnboardingEntryCandidate[];
  focusSymbol?: string;
} {
  const legacy = new Map(
    findings
      .filter((item) => item.kind === "application.route-trace")
      .map((item) => {
        const data = item.data as RouteTrace;
        return [data.routeFindingId, data] as const;
      }),
  );
  const publisherMethods = new Set(
    queues.publications.map((item) => item.caller),
  );
  const routes: OnboardingEntryCandidate[] = findings
    .filter((item) => item.kind === "application.route")
    .flatMap((item) => {
      const data = item.data as Record<string, unknown>;
      if (
        typeof data.controller !== "string" ||
        typeof data.method !== "string"
      )
        return [];
      const trace = legacy.get(item.id);
      const operations = trace?.operations ?? [];
      const branches = operations.filter(
        (operation) =>
          operation.kind === "branch" || operation.kind === "guard",
      ).length;
      const saves = operations.filter(
        (operation) => operation.kind === "call" && operation.method === "save",
      ).length;
      return [
        {
          symbol: `${data.controller}.${data.method}`,
          kind: "route" as const,
          routeFindingId: item.id,
          ...(typeof data.verb === "string" ? { verb: data.verb } : {}),
          ...(typeof data.path === "string" ? { path: data.path } : {}),
          preliminaryScore:
            Math.min(operations.length, 25) +
            Math.min(branches, 12) * 2 +
            Math.min(saves, 5) * 4 +
            (trace && publisherMethods.has(trace.serviceMethod) ? 40 : 0) +
            (typeof data.path === "string" ? 2 : 0),
        },
      ];
    });
  const directCalls = new Map<string, number>();
  for (const call of scheduledCalls)
    directCalls.set(call.job, (directCalls.get(call.job) ?? 0) + 1);
  const jobs: OnboardingEntryCandidate[] = findings
    .filter((item) => item.kind === "scheduled-job")
    .flatMap((item) => {
      const data = item.data as Record<string, unknown>;
      return typeof data.name === "string"
        ? [
            {
              symbol: data.name,
              kind: "scheduled" as const,
              preliminaryScore:
                Math.min(directCalls.get(data.name) ?? 0, 10) * 3,
            },
          ]
        : [];
    });
  const candidates = [...routes, ...jobs];
  const matchingFocus = focus
    ? candidates.filter(
        (candidate) =>
          candidate.symbol === focus ||
          `${candidate.verb ?? ""} ${candidate.path ?? ""}`.trim() === focus ||
          candidate.path === focus,
      )
    : [];
  if (focus && matchingFocus.length !== 1)
    throw new Error(
      matchingFocus.length
        ? `Focus ${focus} matches multiple entries; use an exact Class.method symbol.`
        : `Focus ${focus} did not match a declared route or scheduled handler. Use an exact Class.method symbol or route path.`,
    );
  const rankedRoutes = [...routes].sort(
    (left, right) =>
      right.preliminaryScore - left.preliminaryScore ||
      left.symbol.localeCompare(right.symbol),
  );
  const rankedJobs = [...jobs]
    .filter((item) => item.preliminaryScore > 0)
    .sort(
      (left, right) =>
        right.preliminaryScore - left.preliminaryScore ||
        left.symbol.localeCompare(right.symbol),
    );
  const entries = [
    ...new Set([
      ...(matchingFocus[0] ? [matchingFocus[0].symbol] : []),
      ...rankedRoutes.slice(0, 16).map((item) => item.symbol),
      ...rankedRoutes
        .filter((item) => {
          const linked = legacy.get(item.routeFindingId ?? "");
          return linked && publisherMethods.has(linked.serviceMethod);
        })
        .slice(0, 3)
        .map((item) => item.symbol),
      ...rankedJobs.slice(0, 2).map((item) => item.symbol),
    ]),
  ];
  return {
    entries,
    candidates,
    ...(matchingFocus[0] ? { focusSymbol: matchingFocus[0].symbol } : {}),
  };
}

export function selectOnboardingJourneys(
  traces: readonly OnboardingTrace[],
  concepts: OnboardingConceptEvidence,
  queues: OnboardingQueueEvidence,
  focusSymbol?: string,
): OnboardingJourneySelection {
  const profiles = traces.map((trace) => {
    const events = trace.methods.flatMap((method) => method.events);
    const branches = events.filter((event) => event.kind === "branch").length;
    const writes = events.filter(
      (event) => event.effect === "write-like",
    ).length;
    const reads = events.filter((event) => event.effect === "read-like").length;
    const transaction = events.some(
      (event) => event.effect === "transaction-like",
    );
    const continuations = selectOnboardingContinuations(trace, queues);
    const connected = continuations.filter((item) => item.handler).length;
    const touched = selectOnboardingConcepts(trace, concepts)
      .filter((item) => item.calls.length)
      .map((item) => item.entity.name);
    const methods = new Set(trace.methods.map((method) => method.symbol));
    const meaningful =
      trace.methods.length > 1 || branches + writes + reads + connected > 0;
    const quality = meaningful
      ? Math.min(trace.methods.length, 10) * 2 +
        Math.min(branches, 12) * 2 +
        Math.min(writes, 6) * 4 +
        Math.min(reads, 5) * 2 +
        (transaction ? 12 : 0) +
        connected * 18
      : 0;
    return {
      trace,
      branches,
      writes,
      reads,
      transaction,
      connected,
      touched,
      methods,
      quality,
      meaningful,
    };
  });
  const eligible = profiles.filter((item) => item.meaningful);
  const selected: typeof profiles = [];
  const remaining = [...eligible];
  const count = Math.min(
    eligible.length,
    eligible.length > 3 ? 4 : eligible.length,
  );
  const seenEntities = new Set<string>();
  const seenOwners = new Set<string>();
  const seenVerbs = new Set<string>();
  let hasQueue = false;
  let hasJob = false;
  while (selected.length < count && remaining.length) {
    const distinct = remaining.filter(
      (item) =>
        !selected.some((prior) => {
          const shared = [...item.methods].filter((method) =>
            prior.methods.has(method),
          ).length;
          const overlap =
            shared /
            Math.max(1, Math.min(item.methods.size, prior.methods.size));
          return (
            overlap > 0.6 &&
            item.touched.every((entity) => prior.touched.includes(entity)) &&
            item.connected <= prior.connected &&
            item.trace.entry.kind === prior.trace.entry.kind
          );
        }),
    );
    if (!distinct.length) break;
    distinct.sort((left, right) => {
      const score = (item: typeof left): number => {
        const owner = item.trace.entry.symbol.split(".")[0]!;
        const newEntities = item.touched.filter(
          (entity) => !seenEntities.has(entity),
        ).length;
        const methodOverlap = selected.reduce((greatest, prior) => {
          const shared = [...item.methods].filter((method) =>
            prior.methods.has(method),
          ).length;
          return Math.max(
            greatest,
            shared /
              Math.max(1, Math.min(item.methods.size, prior.methods.size)),
          );
        }, 0);
        return (
          item.quality +
          Math.min(newEntities, 3) * 6 +
          (seenOwners.has(owner) ? 0 : 10) +
          (item.trace.entry.verb && !seenVerbs.has(item.trace.entry.verb)
            ? 3
            : 0) +
          (item.connected && !hasQueue ? 16 : 0) +
          (item.trace.entry.kind === "scheduled" && !hasJob ? 16 : 0) -
          (methodOverlap > 0.6 ? 30 : 0)
        );
      };
      return (
        score(right) - score(left) ||
        left.trace.entry.symbol.localeCompare(right.trace.entry.symbol)
      );
    });
    const next =
      selected.length === 0 && focusSymbol
        ? (distinct.find((item) => item.trace.entry.symbol === focusSymbol) ??
          distinct[0]!)
        : distinct[0]!;
    remaining.splice(remaining.indexOf(next), 1);
    selected.push(next);
    next.touched.forEach((entity) => seenEntities.add(entity));
    seenOwners.add(next.trace.entry.symbol.split(".")[0]!);
    if (next.trace.entry.verb) seenVerbs.add(next.trace.entry.verb);
    hasQueue ||= next.connected > 0;
    hasJob ||= next.trace.entry.kind === "scheduled";
  }
  const decision = (
    item: (typeof profiles)[number],
    selected: boolean,
  ): OnboardingJourneyDecision => ({
    trace: item.trace,
    score: item.quality,
    reason: selected
      ? `source depth ${item.trace.methods.length} method(s), ${item.branches} check(s), ${item.writes} write-like call(s), ${item.touched.length} linked entity type(s)${item.connected ? `, ${item.connected} possible queue continuation(s)` : ""}${item.trace.entry.kind === "scheduled" ? ", scheduled entry" : ""}`
      : item.meaningful
        ? "Eligible source path; less novel coverage within the current guide limit."
        : "No supported decisions, effects, or continuation beyond the entry.",
  });
  return {
    selected: selected.map((item) => decision(item, true)),
    rejected: profiles
      .filter((item) => !selected.includes(item))
      .map((item) => decision(item, false)),
  };
}
