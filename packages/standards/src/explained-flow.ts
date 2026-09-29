import type {
  CandidateFlow,
  Evidence,
  ExplainedFlow,
  Finding,
  ProjectModel,
  RouteTrace,
  RouteTraceOperation,
} from "@transferkit/core";

type TraceFinding = Finding<RouteTrace>;
type Operation = RouteTraceOperation;

export function explainCandidateFlows(
  model: ProjectModel,
  findings: readonly Finding[],
): ExplainedFlow[] {
  const traces = new Map(
    findings
      .filter(
        (finding): finding is TraceFinding =>
          finding.kind === "application.route-trace" && isTrace(finding.data),
      )
      .map((finding) => [finding.data.routeFindingId, finding] as const),
  );
  return model.candidateFlows.flatMap((flow) => {
    if (
      flow.sourceFindingIds.length !== 1 ||
      flow.entryPoints.length !== 1 ||
      flow.entryPoints[0]?.includes("path unresolved")
    )
      return [];
    const trace = traces.get(flow.sourceFindingIds[0]!);
    if (!trace || trace.evidence.length < 2) return [];
    const explained =
      explainStatusBranches(flow, trace) ?? explainLinearFlow(flow, trace);
    return explained ? [explained] : [];
  });
}

function explainStatusBranches(
  flow: CandidateFlow,
  trace: TraceFinding,
): ExplainedFlow | undefined {
  const operations = trace.data.operations;
  const changes = operations
    .map((operation, index) => ({
      operation,
      index,
      condition: positiveCondition(operation),
    }))
    .filter(
      (item) =>
        item.operation.kind === "assignment" &&
        /^(?:status|state)$/iu.test(item.operation.property ?? "") &&
        item.condition,
    );
  if (changes.length !== 2) return undefined;
  const [first, second] = changes;
  if (
    !first ||
    !second ||
    first.operation.target !== second.operation.target ||
    first.operation.property !== second.operation.property ||
    first.operation.value === second.operation.value ||
    first.condition === second.condition
  )
    return undefined;
  const action = operations.findIndex(
    (item, index) =>
      index < first.index &&
      item.kind === "assignment" &&
      item.property === "action" &&
      !item.conditional,
  );
  if (action < 0) return undefined;
  const requestedSave = operations.findIndex(
    (item, index) =>
      index > action &&
      index < first.index &&
      isSave(item) &&
      !item.conditional &&
      item.awaited,
  );
  if (requestedSave < 0) return undefined;
  const checks = operations.slice(0, action);
  const guards = checks.filter((item) => item.kind === "guard");
  const reads = checks.filter(
    (item) =>
      item.kind === "call" &&
      item.category === "repository" &&
      item.method !== "save",
  );
  if (guards.length < 2 || reads.length === 0) return undefined;
  const branchFor = (change: typeof first) =>
    operations.filter(
      (item, index) =>
        index >= change.index &&
        item.conditional?.split("; ").includes(`when ${change.condition}`),
    );
  const firstBranch = branchFor(first);
  const secondBranch = branchFor(second);
  const firstSave = firstBranch.find((item) => isSave(item) && item.awaited);
  const secondSave = secondBranch.find((item) => isSave(item) && item.awaited);
  if (!firstSave || !secondSave) return undefined;
  const firstServices = firstBranch.filter(
    (item) => item.kind === "call" && item.category === "service",
  );
  const uploadCall = firstServices.find((item) =>
    /upload/iu.test(item.method ?? ""),
  );
  const generationCall = firstServices.find((item) =>
    /generat/iu.test(item.method ?? ""),
  );
  const post = operations
    .slice(second.index + 1)
    .filter(
      (item) =>
        item.kind === "branch" ||
        (item.kind === "call" && item.category === "service"),
    );
  if (firstServices.length === 0 || post.every((item) => item.kind !== "call"))
    return undefined;
  const guardedSave = checks.find(
    (item) => isSave(item) && item.conditional && item.awaited,
  );
  const requestedAction = operations[action]!;
  const requestedSaveCall = operations[requestedSave]!;
  const extraSave = operations
    .slice(second.index + 1)
    .find(
      (item) => isSave(item) && !positiveCondition(item) && item.conditional,
    );
  const statusName = `${first.operation.target}.${first.operation.property}`;
  const laterBranch = post.find(
    (item) =>
      item.kind === "branch" &&
      post.some(
        (call) =>
          call.kind === "call" && call.conditional === `when ${item.condition}`,
      ),
  );
  const laterCalls = post.filter((item) => item.kind === "call");
  const deliveryCall = laterCalls.some((item) =>
    /^(?:send|notify|publish|emit)/iu.test(item.method ?? ""),
  );
  const guardedSaveNote = guardedSave
    ? /expir/iu.test(guardedSave.conditional ?? "")
      ? ` An expiry guard can also await ${code(callName(guardedSave))} before throwing.`
      : ` A guard path also awaits ${code(callName(guardedSave))}.`
    : "";
  const steps: ExplainedFlow["steps"] = [
    entryStep(trace),
    makeStep(
      `Checks fetched records before recording the requested action. Throwing guards cover ${guardTopics(guards)}.${guardedSaveNote}`,
      checks,
      [
        reads[0],
        guards.find((item) => /status|\.id/iu.test(item.condition ?? "")),
        guards.find((item) => /expir/iu.test(item.condition ?? "")),
      ],
    ),
    makeStep(
      `On the main path, assigns ${code(`${requestedAction.target}.${requestedAction.property}`)} from ${code(requestedAction.value ?? "value unresolved")} and awaits ${code(callName(requestedSaveCall))}.`,
      operations.slice(action, requestedSave + 1),
      [requestedAction, requestedSaveCall],
    ),
    makeStep(
      `When ${code(first.condition!)}, sets ${code(statusName)} to ${code(first.operation.value ?? "value unresolved")}.${describeBranchCalls(firstBranch.filter((item) => item !== first.operation))}${uploadCall && (uploadCall.catchDepth ?? 0) > 1 ? " The upload is inside a nested try/catch." : ""} ${uploadCall && generationCall ? "Upload and generation outcomes" : "Effects of those calls"} remain unverified.`,
      firstBranch,
      [first.operation, uploadCall, generationCall ?? firstSave],
    ),
    makeStep(
      `When ${code(second.condition!)}, sets ${code(statusName)} to ${code(second.operation.value ?? "value unresolved")} and awaits ${code(callName(secondSave))}.${extraSave ? ` A further else path also calls ${code(callName(extraSave))} without a traced status assignment.` : ""}`,
      [...secondBranch, ...(extraSave ? [extraSave] : [])],
      [second.operation, secondSave, extraSave],
    ),
    makeStep(
      `${laterBranch?.condition ? `If ${code(laterBranch.condition)}, the method ${describeCalls(laterCalls.filter((item) => item.conditional === `when ${laterBranch.condition}`))}. After that branch, ` : ""}${laterBranch?.condition ? "the method" : "The method"} ${describeCalls(laterCalls.filter((item) => !item.conditional))}. ${deliveryCall ? "These calls do not establish notification delivery." : "Their runtime effects are unverified."}`,
      post,
      [laterBranch, ...laterCalls].slice(0, 3),
    ),
  ];
  return result(flow, trace, steps);
}

function explainLinearFlow(
  flow: CandidateFlow,
  trace: TraceFinding,
): ExplainedFlow | undefined {
  const operations = trace.data.operations;
  const saves = operations
    .map((operation, index) => ({ operation, index }))
    .filter(
      ({ operation }) =>
        isSave(operation) && !operation.conditional && operation.awaited,
    );
  if (!saves.length) return undefined;
  const first = saves[0]!.index;
  const last = saves.at(-1)!.index;
  const before = operations.slice(0, first);
  const middle = operations.slice(first, last + 1);
  const after = operations.slice(last + 1);
  const guards = before.filter((item) => item.kind === "guard");
  const reads = before.filter(
    (item) => item.kind === "call" && item.category === "repository",
  );
  const validation = before.find(
    (item) => item.kind === "call" && item.category === "validation",
  );
  if (
    !guards.length ||
    !reads.length ||
    middle.some((item) => item.kind !== "call" || item.conditional) ||
    before.some((item) => item.kind === "call" && item.conditional)
  )
    return undefined;
  const middleSaves = middle.filter(isSave);
  const middleServices = middle.filter(
    (item) => item.kind === "call" && item.category === "service",
  );
  const laterCalls = after.filter((item) => item.kind === "call");
  const laterBranch = after.find(
    (item) =>
      item.kind === "branch" &&
      laterCalls.some((call) => call.conditional === `when ${item.condition}`),
  );
  const laterAttempts = laterCalls.filter(
    (item) =>
      item.kind === "call" &&
      item.category === "service" &&
      /^(?:send|notify|publish|emit|upload)/iu.test(item.method ?? ""),
  );
  if (!middleServices.length && !laterAttempts.length) return undefined;
  const saveNames = middleSaves.map((item) =>
    (item.target ?? "repository")
      .replace(/Repository$/u, "")
      .replace(/([a-z])([A-Z])/gu, "$1 $2")
      .toLowerCase(),
  );
  const serviceBetweenFirstSaves =
    middleServices[0] &&
    middleSaves.length > 1 &&
    middle.indexOf(middleServices[0]) > middle.indexOf(middleSaves[0]!) &&
    middle.indexOf(middleServices[0]) < middle.indexOf(middleSaves[1]!);
  const steps: ExplainedFlow["steps"] = [
    entryStep(trace),
    makeStep(
      `Before the first traced ${code("save")} call, the method invokes ${validation ? `${code(callName(validation))} and ` : ""}repository methods for related records. Guard branches throw for conditions including ${sampleConditions(guards)}.`,
      before,
      [validation ?? reads[0], guards[0], guards.at(-1)],
    ),
    makeStep(
      `On a path past those guards, the method awaits ${middleSaves.length > 1 ? "separate " : "a "}save ${middleSaves.length > 1 ? "calls" : "call"} through the ${joinNatural(saveNames)} ${middleSaves.length > 1 ? "repositories" : "repository"}.${middleServices.length ? ` It ${middleServices[0]!.awaited ? "awaits" : "calls"} ${code(callName(middleServices[0]!))}${serviceBetweenFirstSaves ? " between the first two saves" : ""}.` : ""}`,
      middle,
      [middleSaves[0], middleServices[0], middleSaves.at(-1)],
    ),
  ];
  if (laterCalls.length) {
    const mainlineRead = laterCalls.find(
      (item) => !item.conditional && item.category === "repository",
    );
    const conditionalSave = laterCalls.find(
      (item) => isSave(item) && item.conditional,
    );
    const preparation = laterCalls.find(
      (item) => item.category === "service" && !laterAttempts.includes(item),
    );
    const attempt = laterAttempts[0];
    const text = laterBranch?.condition
      ? `${mainlineRead ? `Afterward, the method calls ${code(callName(mainlineRead))}. ` : ""}When ${code(laterBranch.condition)}, it ${preparation ? `calls ${code(callName(preparation))}, ` : ""}${attempt ? `attempts ${code(callName(attempt))}` : "calls a service method"}${conditionalSave ? `, and calls ${code(callName(conditionalSave))}${conditionalSave.awaited ? "" : " without await"}` : ""}. Delivery and resulting state are unverified.`
      : `Afterward, the method ${describeCalls(laterCalls)}. Effects are unverified.`;
    steps.push(
      makeStep(text, after, [
        laterBranch,
        attempt,
        conditionalSave ?? mainlineRead,
      ]),
    );
  }
  return result(flow, trace, steps);
}

function entryStep(trace: TraceFinding): ExplainedFlow["steps"][number] {
  return {
    text: `The route handler ${code(trace.data.handler)} directly calls ${code(trace.data.serviceMethod)}.`,
    evidence: trace.evidence.slice(0, 2),
    citations: trace.evidence.slice(0, 2),
  };
}

function result(
  flow: CandidateFlow,
  trace: TraceFinding,
  steps: ExplainedFlow["steps"],
): ExplainedFlow {
  return {
    routeFindingId: trace.data.routeFindingId,
    title: flow.title,
    entryPoint: flow.entryPoints[0]!,
    steps,
    gaps: trace.data.gaps,
  };
}

function makeStep(
  text: string,
  operations: readonly Operation[],
  preferred: readonly (Operation | undefined)[],
): ExplainedFlow["steps"][number] {
  return {
    text,
    evidence: evidenceOf(operations),
    citations: evidenceOf(
      preferred.filter((item): item is Operation => item !== undefined),
    ).slice(0, 3),
  };
}

function describeBranchCalls(operations: readonly Operation[]): string {
  const calls = operations.filter(
    (item) =>
      item.kind === "call" && (item.category === "service" || isSave(item)),
  );
  if (!calls.length) return "";
  return ` ${calls
    .map((item, index) => {
      const inner = extraCondition(item);
      const prefix = inner
        ? `${index === 0 ? "When" : "when"} ${code(inner)}, it `
        : index === 0
          ? "It "
          : "it ";
      const action = /^(?:upload|send|notify|publish|emit)/iu.test(
        item.method ?? "",
      )
        ? "attempts"
        : item.awaited
          ? "awaits"
          : "calls";
      return `${prefix}${action} ${code(callName(item))}`;
    })
    .join("; ")}.`;
}

function describeCalls(operations: readonly Operation[]): string {
  return (
    operations
      .map(
        (item) =>
          `${item.awaited ? "awaits" : "calls"} ${code(callName(item))}${item.awaited ? "" : " without await"}`,
      )
      .join("; ") || "has no further supported direct call"
  );
}

function positiveCondition(operation: Operation): string | undefined {
  return operation.conditional
    ?.split("; ")
    .filter((part) => part.startsWith("when "))
    .at(-1)
    ?.slice(5);
}

function extraCondition(operation: Operation): string | undefined {
  const conditions =
    operation.conditional
      ?.split("; ")
      .filter((part) => part.startsWith("when ")) ?? [];
  return conditions.length > 1 ? conditions.at(-1)?.slice(5) : undefined;
}

function isSave(operation: Operation): boolean {
  return (
    operation.kind === "call" &&
    operation.category === "repository" &&
    operation.method === "save"
  );
}

function guardTopics(guards: readonly Operation[]): string {
  const conditions = guards.map((item) => item.condition ?? "").join(" ");
  const topics = [
    /^!\w+/mu.test(conditions) ? "missing records" : undefined,
    /\.status\b/iu.test(conditions) ? "status checks" : undefined,
    /\.id\b/iu.test(conditions) ? "identifier checks" : undefined,
    /expir/iu.test(conditions) ? "expiry" : undefined,
    /(?:file|buffer)/iu.test(conditions)
      ? guards.some(
          (item) =>
            /(?:file|buffer)/iu.test(item.condition ?? "") && item.conditional,
        )
        ? "a conditional file-presence check"
        : "file presence"
      : undefined,
  ].filter((item): item is string => item !== undefined);
  return topics.length ? joinNatural(topics) : "the cited conditions";
}

function joinNatural(values: readonly string[]): string {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function sampleConditions(guards: readonly Operation[]): string {
  const examples =
    guards.length <= 3 ? guards : [guards[0]!, guards[1]!, guards.at(-1)!];
  return examples
    .map((item) => code(item.condition ?? "condition unresolved"))
    .join(", ");
}

function callName(operation: Operation): string {
  return `${operation.target ?? "target unresolved"}.${operation.method ?? "method unresolved"}`;
}

function evidenceOf(operations: readonly Operation[]): Evidence[] {
  const seen = new Set<string>();
  return operations.flatMap((item) =>
    item.evidence.filter((evidence) => {
      const key = `${evidence.file}:${evidence.line ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

function isTrace(value: unknown): value is RouteTrace {
  return (
    typeof value === "object" &&
    value !== null &&
    "routeFindingId" in value &&
    typeof value.routeFindingId === "string" &&
    "handler" in value &&
    typeof value.handler === "string" &&
    "serviceMethod" in value &&
    typeof value.serviceMethod === "string" &&
    "operations" in value &&
    Array.isArray(value.operations) &&
    "gaps" in value &&
    Array.isArray(value.gaps)
  );
}

function code(value: string): string {
  return `\`${value.replace(/`/gu, "'")}\``;
}
