import { basename } from "node:path";

import {
  containsLikelySecret,
  redactLikelySecrets,
  summarizeHandoverCoverage,
  type GuidedHandoverState,
  type BusinessFlow,
  isBusinessFlowField,
  type HandoverPlan,
  type HandoverPlanRequirement,
  type HandoverState,
} from "@transferkit/core";
import {
  planAdaptiveHandover,
  suggestBusinessFlows,
} from "@transferkit/standards";
import { scanRepository } from "@transferkit/scanners";

import { readHandoverState, writeHandoverState } from "./handover-state.js";
import { scanHandover } from "./scan-handover.js";

export interface GuidedHandoverIO {
  write: (message: string) => void;
  read?: ((prompt: string) => Promise<string>) | undefined;
}

interface LoadedHandover {
  state: HandoverState;
  plan: HandoverPlan;
  findingCount: number;
  context: string[];
}

function guided(state: HandoverState): GuidedHandoverState {
  return state.guided ?? { customTopics: [], skipped: [], notApplicable: [] };
}

export async function loadGuidedHandover(
  directory: string,
  persistScan = true,
): Promise<LoadedHandover> {
  const findings = persistScan
    ? await scanHandover(directory)
    : await scanRepository(directory);
  const state = await readHandoverState(directory);
  const progress = guided(state);
  const flows = new Map<string, BusinessFlow>(
    suggestBusinessFlows(findings).map((flow) => [flow.id, flow]),
  );
  for (const flow of progress.flows ?? []) flows.set(flow.id, flow);
  return {
    state,
    findingCount: findings.length,
    context: [
      ...new Set(
        findings.flatMap((finding) => {
          if (!["framework", "messaging", "database"].includes(finding.kind))
            return [];
          const data = finding.data;
          return typeof data === "object" &&
            data !== null &&
            "name" in data &&
            typeof data.name === "string"
            ? [data.name]
            : [];
        }),
      ),
    ],
    plan: planAdaptiveHandover({
      findings,
      knowledge: state.knowledge,
      customTopics: progress.customTopics,
      flows: [...flows.values()],
      notes: progress.notes ?? [],
      skipped: progress.skipped,
      confirmed: progress.confirmed ?? [],
      notApplicable: progress.notApplicable,
    }),
  };
}

function activeSession(
  state: HandoverState,
  currentTopicId?: string,
): NonNullable<GuidedHandoverState["session"]> {
  return {
    status: "active",
    startedAt: guided(state).session?.startedAt ?? new Date().toISOString(),
    completedTopicIds: guided(state).session?.completedTopicIds ?? [],
    ...(currentTopicId ? { currentTopicId } : {}),
  };
}

function completedSession(
  state: HandoverState,
  ids: string[],
): NonNullable<GuidedHandoverState["session"]> {
  const session = activeSession(state);
  return {
    status: session.status,
    startedAt: session.startedAt,
    completedTopicIds: [...new Set([...session.completedTopicIds, ...ids])],
  };
}

function eligible(requirement: HandoverPlanRequirement): boolean {
  return requirement.applicability === "applicable";
}

function nextGroup(
  plan: HandoverPlan,
  revisit = false,
):
  | {
      area: HandoverPlan["areas"][number];
      requirements: HandoverPlanRequirement[];
    }
  | undefined {
  for (const coverage of (revisit
    ? ["skipped"]
    : ["missing", "skipped"]) as readonly ("missing" | "skipped")[]) {
    for (const priority of ["critical", "recommended", "optional"] as const) {
      for (const area of plan.areas) {
        const first = area.requirements.find(
          (requirement) =>
            requirement.coverage === coverage &&
            requirement.priority === priority &&
            !requirement.id.endsWith(".handover") &&
            eligible(requirement),
        );
        if (!first) continue;
        return {
          area,
          requirements:
            area.id === "critical-business-flows" && first.subject
              ? [first]
              : area.requirements.filter(
                  (requirement) =>
                    requirement.coverage === coverage &&
                    requirement.subject === first.subject &&
                    eligible(requirement),
                ),
        };
      }
    }
  }
  return undefined;
}

export async function startGuidedHandover(
  directory: string,
  io: GuidedHandoverIO,
): Promise<void> {
  const { state, plan, findingCount, context } =
    await loadGuidedHandover(directory);
  await writeHandoverState(directory, {
    ...state,
    guided: {
      ...guided(state),
      session: activeSession(state, nextGroup(plan)?.requirements[0]?.id),
    },
  });
  io.write(
    `Handover for ${basename(directory)} · ${findingCount} repository findings · ${plan.areas.length} areas`,
  );
  if (context.length) io.write(`Detected context: ${context.join(", ")}`);
  io.write(coverageSummary(plan));
  const criticalAreas = plan.areas
    .filter(({ requirements }) =>
      requirements.some(
        ({ priority, coverage }) =>
          priority === "critical" &&
          (coverage === "missing" || coverage === "skipped"),
      ),
    )
    .map(({ title }) => title);
  io.write(
    `Critical remaining areas: ${criticalAreas.length ? criticalAreas.join(", ") : "none"}`,
  );
  const next = nextGroup(plan);
  io.write(
    next
      ? `Begin with ${next.area.title}${next.requirements[0]?.subject ? ` — ${next.requirements[0].subject}` : ""}. Run 'tk handover next'.`
      : "All applicable topics are covered or explicitly set aside.",
  );
}

export async function statusGuidedHandover(
  directory: string,
  io: GuidedHandoverIO,
): Promise<void> {
  const { plan, state } = await loadGuidedHandover(directory);
  const session = guided(state).session;
  if (session)
    io.write(
      `Session: ${session.status} · ${session.completedTopicIds.length} topics addressed${session.currentTopicId ? ` · current ${session.currentTopicId}` : ""}`,
    );
  io.write(coverageSummary(plan));
  const next = nextGroup(plan);
  if (next)
    io.write(
      `Next: ${next.area.title}${next.requirements[0]?.subject ? ` — ${next.requirements[0].subject}` : ""}`,
    );
}

export async function nextGuidedHandover(
  directory: string,
  io: GuidedHandoverIO,
  revisit = false,
): Promise<void> {
  const { state, plan } = await loadGuidedHandover(directory);
  const group = nextGroup(plan, revisit);
  if (!group) {
    io.write(
      revisit
        ? "No skipped topics to revisit."
        : "No remaining applicable handover topics. Review status or add a custom topic.",
    );
    return;
  }
  const { area, requirements } = group;
  await writeHandoverState(directory, {
    ...state,
    guided: {
      ...guided(state),
      session: activeSession(state, requirements[0]?.id),
    },
  });
  if (area.id === "critical-business-flows" && !requirements[0]?.subject) {
    io.write(
      "Identify the critical workflows first. Run 'tk handover flow list' to review suggestions or 'tk handover flow add' to add one.",
    );
  }
  const subject = requirements[0]?.subject;
  const activeArea = area.requirements.filter(eligible);
  io.write(
    `${area.title} ${activeArea.filter(({ coverage }) => coverage === "covered").length}/${activeArea.length}${subject ? ` — ${subject}` : ""}`,
  );
  io.write(
    `Why it matters: This knowledge helps the next owner understand and operate ${subject ?? area.title.toLowerCase()}.`,
  );
  const related = area.requirements.filter(
    (requirement) => requirement.subject === subject,
  );
  const integration = plan.integrations?.find(
    ({ provider }) => provider === subject,
  );
  if (integration) {
    io.write(
      `Integration: ${integration.provider} (${integration.identity === "INFERRED" ? "inferred, unconfirmed" : integration.identity.toLowerCase()})`,
    );
    if (integration.operations.length)
      io.write(`Known operations: ${integration.operations.join(", ")}`);
    if (integration.endpoints.length)
      io.write(`Endpoints: ${integration.endpoints.join(", ")}`);
    if (integration.configuration.length)
      io.write(`Configuration keys: ${integration.configuration.join(", ")}`);
    if (integration.relatedModules.length)
      io.write(`Related components: ${integration.relatedModules.join(", ")}`);
    if (integration.authenticationEvidence.length)
      io.write(
        `Authentication/configuration evidence: ${integration.authenticationEvidence.map(({ file, line }) => `${file}${line ? `:${line}` : ""}`).join(", ")}`,
      );
  }
  const observed = related.flatMap((requirement) =>
    requirement.knowledge
      .filter(({ classification }) => classification === "OBSERVED")
      .map(
        ({ value }) =>
          `${requirement.title}: ${value ?? "observed in repository"}`,
      ),
  );
  if (observed.length)
    io.write(
      `Already observed:\n${observed.map((value) => `- ${value}`).join("\n")}`,
    );
  const inferred = related.flatMap((requirement) =>
    requirement.knowledge
      .filter(({ classification }) => classification === "INFERRED")
      .map(
        ({ value }) =>
          `${requirement.title}: ${value ?? "suggested by repository evidence"}`,
      ),
  );
  if (inferred.length)
    io.write(
      `Suggested, unconfirmed:\n${inferred.map((value) => `- ${value}`).join("\n")}`,
    );
  const evidence = [
    ...new Map(
      related
        .flatMap((requirement) => requirement.evidence)
        .map((item) => [`${item.file}:${item.line ?? ""}`, item]),
    ).values(),
  ].slice(0, 5);
  if (evidence.length)
    io.write(
      `Repository context:\n${evidence.map(({ file, line, description }) => `- ${file}${line ? `:${line}` : ""}${description ? ` — ${description}` : ""}`).join("\n")}`,
    );
  io.write(
    `Useful knowledge to transfer:\n${requirements.map(({ title, priority }, index) => `${index + 1}. ${title} (${priority})`).join("\n")}`,
  );
  const captured = requirements.filter((requirement) =>
    requirement.knowledge.some(
      ({ classification, value }) =>
        classification === "HUMAN" && Boolean(value?.trim()),
    ),
  );
  if (captured.length)
    io.write(
      `Recorded but still incomplete:\n${captured
        .map(
          ({ title, knowledge }) =>
            `- ${title}: ${redactLikelySecrets(
              knowledge
                .filter(
                  ({ classification, value }) =>
                    classification === "HUMAN" && Boolean(value?.trim()),
                )
                .map(({ value }) => value)
                .join("; "),
            )}`,
        )
        .join(
          "\n",
        )}\nType confirm if these explanations are sufficient for handover.`,
    );
  io.write(
    "Map details to topic numbers (for example: 1: purpose | 3: recovery). Unnumbered notes are context only. After saving, confirm which mapped topics are sufficient for handover. Type skip, n/a, or save to leave this group for later.",
  );
  if (!io.read) throw new Error("Interactive input is unavailable");
  while (true) {
    const answer = (await io.read("Handover note > ")).trim();
    const command = answer.toLowerCase();
    if (command === "confirm" && captured.length) {
      const current = guided(state);
      const ids = captured.map(({ id }) => id);
      await writeHandoverState(directory, {
        ...state,
        guided: {
          ...current,
          confirmed: [...new Set([...(current.confirmed ?? []), ...ids])],
          session: completedSession(state, ids),
          skipped: current.skipped.filter((id) => !ids.includes(id)),
        },
      });
      io.write(
        `Marked ${ids.length} recorded ${ids.length === 1 ? "topic" : "topics"} covered.`,
      );
      return;
    }
    if (
      command === "save" ||
      command === "save and exit" ||
      command === "cancel"
    ) {
      await writeHandoverState(directory, {
        ...state,
        guided: {
          ...guided(state),
          session: {
            ...activeSession(state, requirements[0]?.id),
            status: "paused",
          },
        },
      });
      io.write("Handover saved. Run 'tk handover resume' to continue.");
      return;
    }
    if (
      command === "skip" ||
      command === "n/a" ||
      command === "not applicable"
    ) {
      const ids = requirements.map(({ id }) => id);
      const current = guided(state);
      const key = command === "skip" ? "skipped" : "notApplicable";
      const updated: HandoverState = {
        ...state,
        guided: {
          ...current,
          session: completedSession(state, ids),
          [key]: [...new Set([...current[key], ...ids])],
          ...(key === "skipped"
            ? {
                notApplicable: current.notApplicable.filter(
                  (id) => !ids.includes(id),
                ),
              }
            : { skipped: current.skipped.filter((id) => !ids.includes(id)) }),
        },
      };
      await writeHandoverState(directory, updated);
      io.write(
        command === "skip"
          ? "Set aside for later review."
          : "Marked not applicable.",
      );
      await statusGuidedHandover(directory, io);
      return;
    }
    if (!answer) {
      io.write("Enter a note, skip, n/a, or save.");
      continue;
    }
    if (containsLikelySecret(answer)) {
      io.write(
        "That note resembles a secret and was not saved. Describe where the secret is managed without including its value.",
      );
      continue;
    }
    const mapped = mapAnswerToRequirements(answer, requirements);
    const ids = new Set(mapped.map(({ id }) => id));
    const confirmation = ids.size
      ? (
          await io.read(
            "Are these mapped topics sufficiently explained for handover? (yes/no) > ",
          )
        )
          .trim()
          .toLowerCase() === "yes"
      : false;
    const flowRequirement =
      area.id === "critical-business-flows" && subject
        ? requirements[0]
        : undefined;
    const flowId = flowRequirement?.id.match(
      /^critical-business-flows\.(.+)\.([^.]+)$/u,
    )?.[1];
    const flowField = flowRequirement?.id.match(
      /^critical-business-flows\.(.+)\.([^.]+)$/u,
    )?.[2];
    const current = guided(state);
    const updatedFlows = (current.flows ?? []).map((flow) =>
      flow.id === flowId &&
      flowField &&
      isBusinessFlowField(flowField) &&
      mapped[0]
        ? {
            ...flow,
            details: { ...flow.details, [flowField]: mapped[0].value },
          }
        : flow,
    );
    const updated: HandoverState = {
      ...state,
      knowledge:
        flowId || ids.size === 0
          ? state.knowledge
          : [
              ...state.knowledge.filter(
                ({ entityId, field }) =>
                  !(ids.has(entityId) && field === "content"),
              ),
              ...mapped.map(({ id, value }) => ({
                entityId: id,
                field: "content",
                value,
              })),
            ],
      guided: {
        ...current,
        confirmed: [
          ...(current.confirmed ?? []).filter((id) => !ids.has(id)),
          ...(confirmation ? [...ids] : []),
        ],
        session: completedSession(state, [...ids]),
        ...(ids.size === 0
          ? {
              notes: [
                ...(current.notes ?? []),
                {
                  areaId: area.id,
                  ...(subject ? { subject } : {}),
                  value: answer,
                },
              ],
            }
          : {}),
        ...(flowId ? { flows: updatedFlows } : {}),
        skipped: current.skipped.filter((id) => !ids.has(id)),
        notApplicable: current.notApplicable.filter((id) => !ids.has(id)),
      },
    };
    await writeHandoverState(directory, updated);
    io.write(
      ids.size
        ? `Saved ${ids.size} mapped ${ids.size === 1 ? "topic" : "topics"}. ${confirmation ? "Marked covered." : "Still incomplete until you confirm the explanation is sufficient."}`
        : "Saved as context. Coverage is unchanged until a topic is answered explicitly.",
    );
    io.write(
      "Run 'tk handover next' to continue, or 'tk handover status' for progress.",
    );
    return;
  }
}

function mapAnswerToRequirements(
  answer: string,
  requirements: readonly HandoverPlanRequirement[],
): { id: string; value: string }[] {
  if (
    requirements[0]?.id === "critical-business-flows.flows" ||
    requirements[0]?.id.endsWith(".handover")
  )
    return [];
  const mapped = new Map<string, string>();
  for (const part of answer.split(/\s*\|\s*/u)) {
    const match = part.match(/^(\d+):\s*(\S[\s\S]*)$/u);
    if (!match) return [];
    const index = Number(match[1]) - 1;
    const requirement = requirements[index];
    if (!requirement) return [];
    mapped.set(requirement.id, match[2]!.trim());
  }
  return [...mapped].map(([id, value]) => ({ id, value }));
}

export async function addGuidedTopic(
  directory: string,
  io: GuidedHandoverIO,
): Promise<void> {
  if (!io.read) throw new Error("Interactive input is unavailable");
  const title = (await io.read("Project-specific topic > ")).trim();
  if (!title) throw new Error("A topic title is required");
  if (containsLikelySecret(title))
    throw new Error("Topic title resembles a secret and was not saved");
  const state = await readHandoverState(directory);
  const current = guided(state);
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "") || "topic";
  let id = base;
  let suffix = 2;
  while (current.customTopics.some((topic) => topic.id === id))
    id = `${base}-${suffix++}`;
  await writeHandoverState(directory, {
    ...state,
    guided: {
      ...current,
      customTopics: [
        ...current.customTopics,
        { id, title, priority: "recommended" },
      ],
    },
  });
  io.write(`Added ${title}. Run 'tk handover next' to cover it.`);
}

function coverageSummary(plan: HandoverPlan): string {
  const report = summarizeHandoverCoverage(plan);
  return [
    ...report.areas.map(
      ({ title, counts }) => `${title} ${counts.covered}/${counts.total}`,
    ),
    `Critical coverage: ${report.areas.flatMap(({ requirements }) => requirements).filter(({ priority, coverage }) => priority === "critical" && coverage === "covered").length}/${report.areas.flatMap(({ requirements }) => requirements).filter(({ priority, coverage }) => priority === "critical" && coverage !== "inactive" && coverage !== "not-applicable").length}`,
    `Recommended coverage: ${report.areas.flatMap(({ requirements }) => requirements).filter(({ priority, coverage }) => priority === "recommended" && coverage === "covered").length}/${report.areas.flatMap(({ requirements }) => requirements).filter(({ priority, coverage }) => priority === "recommended" && coverage !== "inactive" && coverage !== "not-applicable").length}`,
    `Optional coverage: ${report.areas.flatMap(({ requirements }) => requirements).filter(({ priority, coverage }) => priority === "optional" && coverage === "covered").length}/${report.areas.flatMap(({ requirements }) => requirements).filter(({ priority, coverage }) => priority === "optional" && coverage !== "inactive" && coverage !== "not-applicable").length}`,
    `Critical gaps: ${report.gaps.critical}`,
    `Recommended gaps: ${report.gaps.recommended}`,
    `Optional gaps: ${report.gaps.optional}`,
    `Observed: ${report.totals.observed} · Human knowledge: ${report.totals.human}`,
    `Skipped: ${report.totals.skipped} · Not applicable: ${report.totals.notApplicable}`,
  ].join("\n");
}
