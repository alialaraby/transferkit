import type {
  OnboardingConceptEvidence,
  OnboardingSelectedConcept,
  OnboardingTrace,
} from "@transferkit/core";

export function selectOnboardingConcepts(
  trace: OnboardingTrace | undefined,
  evidence: OnboardingConceptEvidence,
): OnboardingSelectedConcept[] {
  if (!trace) return [];
  const bindings = new Map(
    evidence.repositories.map((item) => [item.repository, item.entity]),
  );
  const methodResults = new Map(
    evidence.methodResults.map((item) => [
      `${item.repository}.${item.method}`,
      item.entity,
    ]),
  );
  const injections = new Map(
    evidence.injections.map((item) => [
      `${item.owner}.${item.property}`,
      item.repository,
    ]),
  );
  const selected = new Map<string, OnboardingSelectedConcept>();
  const entities = new Map(evidence.entities.map((item) => [item.name, item]));
  for (const method of trace.methods)
    for (const event of method.events) {
      if (event.kind !== "call") continue;
      const edge = trace.calls.find(
        (item) =>
          item.caller === method.symbol &&
          item.site.file === event.at.file &&
          item.site.line === event.at.line,
      );
      const declaredRepository = edge?.declaredTarget?.split(".")[0];
      const receiver = event.detail.match(/^this\.([A-Za-z_$][\w$]*)\./u)?.[1];
      const owner = method.symbol.split(".")[0];
      const injectedRepository = receiver
        ? injections.get(`${owner}.${receiver}`)
        : undefined;
      const repository = declaredRepository ?? injectedRepository;
      const methodName = event.detail.split(".").at(-1);
      const explicitResult =
        repository && methodName
          ? methodResults.get(`${repository}.${methodName}`)
          : undefined;
      const inheritedEffect =
        methodName &&
        /^(?:save|insert|update|remove|delete|find|findOne|findBy|count)$/u.test(
          methodName,
        );
      const entityName =
        explicitResult ??
        (inheritedEffect ? bindings.get(repository ?? "") : undefined);
      const entity = entityName ? entities.get(entityName) : undefined;
      if (!entity) continue;
      const concept = selected.get(entity.name) ?? { entity, calls: [] };
      concept.calls.push({
        effect: explicitResult
          ? "unspecified"
          : event.effect === "transaction-like"
            ? "unspecified"
            : (event.effect ?? "unspecified"),
        at: event.at,
      });
      selected.set(entity.name, concept);
    }
  const touched = [...selected.values()].sort(
    (left, right) =>
      conceptScore(right) - conceptScore(left) ||
      left.entity.name.localeCompare(right.entity.name),
  );
  if (touched.length === 1) {
    const related = touched[0]?.entity.relations
      .map((relation) => entities.get(relation.target))
      .find((entity) => entity && entity.name !== touched[0]?.entity.name);
    if (related) touched.push({ entity: related, calls: [] });
  }
  return touched;
}

function conceptScore(concept: OnboardingSelectedConcept): number {
  return concept.calls.reduce(
    (score, call) =>
      score +
      (call.effect === "write-like" ? 4 : call.effect === "read-like" ? 2 : 1),
    0,
  );
}
