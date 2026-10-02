import type {
  Evidence,
  OnboardingRepositoryNote,
  OnboardingStoryChapter,
  OnboardingStoryClaim,
  OnboardingStoryInventory,
  OnboardingStorySelection,
  OnboardingStoryTerm,
  OnboardingTraceEvent,
} from "@transferkit/core";

import { sanitizeHandoverValue } from "./handover-package.js";

export function renderHumanOnboardingGuide(
  source: string,
  inventory: OnboardingStoryInventory,
  selection: OnboardingStorySelection,
  notes: readonly OnboardingRepositoryNote[],
): string {
  const sections = splitSections(source);
  const central = chooseCentralTerm(inventory, selection);
  const glossary = chooseGlossary(inventory, selection, central);
  const first = selection.chapters[0];
  const overview = inventory.purpose
    ? `**What this repository says it does:** ${clean(inventory.purpose.text)} ${links(inventory.purpose.evidence)} Repository statements describe intent; local behavior is still unverified.`
    : first && central
      ? `**What the source shows:** ${clean(central.name)} is a recurring record across the selected entries. Start with ${clean(first.id)} to see one way work enters; the other chapters show separate ways this record is handled. ${links([...first.entry.evidence, ...central.evidence.slice(0, 1)])} This is a source-level reading path. The broader product purpose is not established here.`
      : first
        ? `**What the source shows:** ${clean(first.entry.text)} ${links(first.entry.evidence)} The broader product purpose is not established by the inspected files.`
        : "**Purpose unknown:** The inspected files do not establish a project-specific purpose or a supported entry point.";
  const role = inventory.roles
    .slice(0, 2)
    .map((claim) => `${clean(claim.text)} ${links(claim.evidence)}`)
    .join(" ");
  const opening = [
    "# Onboarding guide",
    "",
    "## Start here",
    "",
    overview,
    "",
    ...(role && !central ? [`**Repository shape:** ${role}`, ""] : []),
    `**How to read it:** ${first ? `Start with [${clean(first.id)}](#journey-${anchor(first.id)}), then read the other selected entries as separate starting points.` : "Start with the cited entry and inspect its source before assuming a workflow."} Connections below distinguish calls, shared records, and associations that are still unproven. Use [Run and observe](#setup-and-operations) for a safe check, then record your own results in \`.transferkit.local/ONBOARDING.md\`.`,
    "",
    "## System map",
    "",
    '<a id="system-overview"></a>',
    "",
    ...(central
      ? [
          `**Central code record:** ${clean(central.name)} is a ${clean(central.codeRole)} ${links(central.evidence.slice(0, 1))}. Its business meaning is ${central.meaning ? `described by the repository: ${clean(central.meaning.text)} ${links(central.meaning.evidence)}` : "not established by the declaration"}.`,
          "",
        ]
      : []),
    ...(!central && first?.input && first.output
      ? [
          `**Documented input and output:** ${clean(first.input.text)} ${links(first.input.evidence)} ${clean(first.output.text)} ${links(first.output.evidence)} The source path between them has not been traced.`,
          "",
        ]
      : []),
    ...(selection.chapters.length
      ? [
          `**Selected entries (reading order):** ${selection.chapters.map((chapter) => `[${clean(chapter.id)}](#journey-${anchor(chapter.id)})`).join(", ")}. Their order here does not establish runtime sequence.`,
          "",
        ]
      : []),
    ...(selection.connections.length
      ? [
          "**How these entries relate:**",
          "",
          ...selection.connections
            .filter((connection) =>
              selection.chapters.some(
                (chapter) => chapter.id === connection.to,
              ),
            )
            .sort(
              (left, right) =>
                Number(right.explanation.includes(central?.name ?? "\u0000")) -
                Number(left.explanation.includes(central?.name ?? "\u0000")),
            )
            .slice(0, 3)
            .map(
              (connection) =>
                `- ${clean(connection.from)} / ${clean(connection.to)}: ${clean(connection.explanation)} ${links(connection.evidence)}`,
            ),
          "",
        ]
      : []),
    ...(glossary.length
      ? [
          "## Concepts",
          "",
          "These are code roles you will meet while reading the selected paths. A relation declaration does not define a business contract.",
          "",
        ]
      : []),
    ...glossary.flatMap((item) => [
      `### ${clean(item.name)}`,
      "",
      `${capitalize(clean(item.codeRole))} ${links(item.evidence)}. ${item.meaning ? `The repository says: ${clean(item.meaning.text)} ${links(item.meaning.evidence)}.` : "Business meaning is unconfirmed."} ${item.why}`,
      "",
    ]),
    "## Connected journeys",
    "",
    '<a id="explained-flow"></a>',
    "",
    selection.chapters.length
      ? "Read each chapter as a separate source entry. The links establish declarations and bounded paths, not successful runtime outcomes."
      : "No supported story entry was identified; inspect the reference appendix and ask an owner where work starts.",
    "",
    ...selection.chapters.flatMap((chapter) =>
      renderChapter(chapter, notes, inventory),
    ),
    "## Change points",
    "",
    selection.chapters.length
      ? "Use the task that matches your change. Start at the entry, then inspect its next source boundary and nearby tests before editing."
      : "No change point was established by the inspected source.",
    "",
    ...(selection.chapters.length
      ? [
          `**Safe first investigation:** Open ${links([preferredSource(first!) ?? first!.entry.evidence[0]!])}${notes.some((note) => note.kind === "test" && note.journey === first!.id) ? ` and the nearby test candidate ${sourceLink(notes.find((note) => note.kind === "test" && note.journey === first!.id)!)}` : " and search for its callers or tests"}. Trace one input to the first uncertain boundary, then record what you could and could not verify.`,
          "",
          "| Task | Start here | Next source or test |",
          "| --- | --- | --- |",
          ...selection.chapters.map((chapter) => {
            const test = notes.find(
              (note) => note.kind === "test" && note.journey === chapter.id,
            );
            const next = test
              ? `${sourceLink(test)} (test candidate; assertions unreviewed)`
              : preferredSource(chapter)
                ? links([preferredSource(chapter)!])
                : "Search for this entry symbol; a test was not identified by this scan.";
            return `| Investigate ${clean(chapter.id)} | ${links(chapter.entry.evidence)} | ${next} |`;
          }),
          "",
        ]
      : []),
    "## Run and observe",
    "",
    '<a id="setup-and-operations"></a>',
    "",
    ...setupOpening(inventory),
    setupBody(sections.get("Setup and operations"), inventory),
    "",
    "## Specific questions",
    "",
    '<a id="unknowns"></a>',
    "",
    ...inventory.unknowns.map((item) => `- **Unknown:** ${clean(item)}`),
    sections.get("Unknowns") ?? "",
    "",
    "## Reference appendix",
    "",
    "<details><summary>Inventories, candidate routes, and supporting declarations</summary>",
    "",
    ...(sections.get("Explained flow")
      ? [
          "### Raw source traces",
          "",
          sections
            .get("Explained flow")!
            .replace(/^### Source journey:/gmu, "#### Raw trace:"),
          "",
        ]
      : []),
    ...(sections.get("Concepts")
      ? ["### Entity fields and relations", "", sections.get("Concepts")!, ""]
      : []),
    ...(sections.get("Scheduled work")
      ? ["### Scheduled work", "", sections.get("Scheduled work")!, ""]
      : []),
    ...[
      "System overview",
      "Architecture relationships",
      "Related migration candidates",
    ].flatMap((heading) =>
      sections.get(heading)
        ? [`### ${heading}`, "", sections.get(heading)!, ""]
        : [],
    ),
    "**Candidate routes**",
    "",
    sections.get("Candidate flows") ??
      "No supported route candidate was found.",
    "",
    "</details>",
    "",
  ];
  return `${opening
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trimEnd()}\n`;
}

function renderChapter(
  chapter: OnboardingStoryChapter,
  notes: readonly OnboardingRepositoryNote[],
  inventory: OnboardingStoryInventory,
): string[] {
  const trace = chapter.trace;
  const route = trace?.entry;
  const decision = trace?.methods
    .flatMap((method) => method.events)
    .find((event) => sameLine(event, chapter.decision));
  const result = trace?.methods
    .flatMap((method) => method.events)
    .find((event) => sameLine(event, chapter.result));
  const alternate =
    trace?.methods
      .flatMap((method) => method.events)
      .find((event) => event.kind === "throw") ??
    trace?.methods
      .flatMap((method) => method.events)
      .find(
        (event) =>
          sameLine(event, chapter.alternate) && event.kind === "branch",
      );
  const write = trace?.methods
    .flatMap((method) => method.events)
    .find((event) => event.effect === "write-like");
  const test = notes.find(
    (note) => note.kind === "test" && note.journey === chapter.id,
  );
  const boundary = inventory.boundaries.find((item) =>
    trace?.methods.some((method) =>
      method.events.some(
        (event) =>
          event.kind === "call" &&
          item.name &&
          event.detail.toLowerCase().includes(item.name.toLowerCase()),
      ),
    ),
  );
  const documentedAlternate = !trace
    ? inventory.observations.find((item) =>
        item.text.startsWith("Documented alternate:"),
      )
    : undefined;
  return [
    `<a id="journey-${anchor(chapter.id)}"></a>`,
    "",
    `### ${trace ? "Source journey" : "Entry to inspect"}: ${clean(chapter.id)}`,
    "",
    `**Why read this:** This is a ${trace?.entry.kind === "scheduled" ? "scheduled" : trace ? "declared HTTP" : "documented or package"} entry to the repository. Read it to locate the first source boundary for ${clean(chapter.id)} and the behavior you would need to verify. ${links(chapter.entry.evidence)}`,
    "",
    `**Trigger and input:** ${route ? `${route.kind === "scheduled" ? "Scheduled entry" : `${route.verb ?? "HTTP"} ${route.path ?? "path unresolved"}`} is declared at ${sourceLink(route.declaration)}.` : `${clean(chapter.entry.text)} ${links(chapter.entry.evidence)}`}${chapter.input ? ` Documented input: ${clean(chapter.input.text)} ${links(chapter.input.evidence)}` : ""}`,
    "",
    `**Decision:** ${decision && decision.kind === "branch" ? `The bounded trace checks \`${clean(short(decision.detail))}\` at ${sourceLink(decision.at)}; inspect both exits before changing the rule.` : `No business decision is established in this bounded trace${chapter.firstUnsupportedBoundary ? `; it stops at ${links(chapter.firstUnsupportedBoundary.evidence)}` : ""}.`}`,
    "",
    `**State or output:** ${chapter.output ? `${clean(chapter.output.text)} ${links(chapter.output.evidence)} (repository statement; not verified by a run).` : write ? `A write-like call appears at ${sourceLink(write.at)}; completion and persisted state are unverified.` : result ? `The traced method returns at ${sourceLink(result.at)}; the downstream result and persisted state are unverified.` : "The bounded trace does not establish an output or completed state change."}`,
    "",
    `**Alternate exit:** ${alternate ? `${alternate.kind === "throw" ? "A throw" : "A branch"} is visible at ${sourceLink(alternate.at)}; inspect the surrounding condition and handler in source.` : documentedAlternate ? `${clean(documentedAlternate.text)} ${links(documentedAlternate.evidence)} This is a repository statement, not a verified run.` : "No distinct alternate exit was established by this trace; that does not mean none exists."}`,
    "",
    `**External boundary:** ${boundary ? `${clean(boundary.name ?? "Dependency")} is declared at ${links(boundary.evidence)}; delivery or response is unverified.` : "No external call was established for this selected path."}`,
    "",
    `**Where to change and test:** Begin at ${links(chapter.entry.evidence)}${preferredSource(chapter) ? `, then inspect ${links([preferredSource(chapter)!])}` : ""}. ${test ? `A nearby test candidate is ${sourceLink(test)}; its assertions have not been evaluated here.` : "This scan did not identify a nearby test for this entry; search for the symbol before changing behavior."}`,
    "",
    ...(chapter.firstUnsupportedBoundary
      ? [
          `**First unsupported step:** ${clean(chapter.firstUnsupportedBoundary.reason)} ${links(chapter.firstUnsupportedBoundary.evidence)}.`,
          "",
        ]
      : []),
  ];
}

function chooseGlossary(
  inventory: OnboardingStoryInventory,
  selection: OnboardingStorySelection,
  central: OnboardingStoryTerm | undefined,
): {
  name: string;
  codeRole: string;
  meaning?: OnboardingStoryClaim;
  evidence: Evidence[];
  why: string;
}[] {
  if (!central) return [];
  const byName = new Map(inventory.terms.map((term) => [term.name, term]));
  const chapters = selection.chapters
    .map(
      (item) =>
        `${item.id} ${item.trace?.methods.flatMap((method) => method.events.map((event) => event.detail)).join(" ") ?? ""}`,
    )
    .join(" ");
  const candidates = central.relations
    .filter((relation) =>
      inventory.artifacts.some((item) => item.name === relation.target),
    )
    .map((relation) => ({
      relation,
      score:
        (chapters.toLowerCase().includes(relation.target.toLowerCase())
          ? 10
          : 0) +
        (relation.property.toLowerCase() === relation.target.toLowerCase()
          ? 3
          : 0),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.relation.target.localeCompare(right.relation.target),
    );
  const names = [
    central.name,
    ...candidates.map((item) => item.relation.target),
    ...inventory.terms.map((item) => item.name),
  ]
    .filter((name, index, all) => all.indexOf(name) === index)
    .slice(0, 5);
  return names.map((name) => {
    const term: OnboardingStoryTerm | undefined = byName.get(name);
    const artifact = inventory.artifacts.find((item) => item.name === name);
    const relation = central.relations.find((item) => item.target === name);
    const why =
      name === central.name
        ? "Selected entries name or touch this record, so it is the first place to orient yourself."
        : relation
          ? `The ${clean(central.name)} declaration has ${/^[aeiou]/iu.test(relation.property) ? "an" : "a"} ${clean(relation.property)} relation to it ${links(relation.evidence)}; this does not define the real-world relationship.`
          : "It appears in the selected source inventory; inspect its declaration before assuming a business role.";
    return {
      name,
      codeRole: term?.codeRole ?? "declared data entity",
      ...(term?.meaning ? { meaning: term.meaning } : {}),
      evidence: term?.evidence.slice(0, 1) ?? artifact?.evidence ?? [],
      why,
    };
  });
}

function chooseCentralTerm(
  inventory: OnboardingStoryInventory,
  selection: OnboardingStorySelection,
): OnboardingStoryTerm | undefined {
  const first = selection.chapters[0]?.id.toLowerCase() ?? "";
  return (
    inventory.terms.find((term) =>
      first.includes(term.name.replace(/Entity$/u, "").toLowerCase()),
    ) ?? inventory.terms[0]
  );
}

function setupBody(
  legacy: string | undefined,
  inventory: OnboardingStoryInventory,
): string {
  const source =
    legacy ?? "No setup commands were established by the inspected files.";
  if (
    !inventory.observations.some((item) =>
      /Documented command:/u.test(item.text),
    )
  )
    return source;
  return source
    .replace(
      "Confirm the application start command.",
      "Review the documented invocation above and verify its inputs before running it.",
    )
    .replace(
      "How should a newcomer start the app?",
      "Which inputs and prerequisites are required for the documented command?",
    )
    .replace(
      /^\d+\. Consider npm run start after prerequisites are ready\.$/gmu,
      "4. Review the documented invocation above, including its input arguments, after checking prerequisites.",
    );
}

function preferredSource(
  chapter: OnboardingStoryChapter,
): Evidence | undefined {
  if (chapter.trace) return chapter.inspectNext[0];
  return (
    chapter.entry.evidence.find((item) =>
      /\.(?:[cm]?js|tsx?|py)$/u.test(item.file),
    ) ?? chapter.inspectNext[0]
  );
}

function capitalize(value: string): string {
  return value.length ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function setupOpening(inventory: OnboardingStoryInventory): string[] {
  const engines = inventory.observations
    .filter((item) => item.text.startsWith("Declared runtime:"))
    .slice(0, 2);
  const dependencies = inventory.observations
    .filter((item) => item.text.startsWith("Declared runtime dependency:"))
    .slice(0, 6);
  const observations = inventory.observations
    .filter(
      (item) =>
        item.basis === "repository-statement" &&
        item.text.startsWith("Documented command:"),
    )
    .slice(0, 2);
  return [
    ...(engines.length
      ? [
          `**Declared runtime:** ${engines.map((item) => `${escapeMarkup(item.text.replace(/^Declared runtime:\s*/u, ""))} ${links(item.evidence)}`).join(" ")} Verify the installed version locally.`,
          "",
        ]
      : []),
    ...(dependencies.length
      ? [
          `**Selected runtime dependencies:** ${dependencies.map((item) => clean(item.text.replace(/^Declared runtime dependency:\s*/u, "").replace(/\.$/u, ""))).join(", ")} (${links(dependencies.flatMap((item) => item.evidence))}). These are declarations, not proof that services are available.`,
          "",
        ]
      : []),
    ...observations.flatMap((item) => [
      `**Documented invocation:** ${clean(item.text)} ${links(item.evidence)}`,
      "",
    ]),
    ...(inventory.observations.find((item) => /health route/u.test(item.text))
      ? [
          `**Safe first observation:** Inspect the declared health route after verifying prerequisites; an HTTP response would not prove dependency health. ${links(inventory.observations.find((item) => /health route/u.test(item.text))!.evidence)}`,
          "",
        ]
      : observations[0]
        ? [
            `**Safe first observation:** Review the documented command and use disposable input where appropriate; record the actual result or blocker. ${links(observations[0].evidence)}`,
            "",
          ]
        : []),
  ];
}

function splitSections(source: string): Map<string, string> {
  const headers = [...source.matchAll(/^## (.+)$/gmu)];
  return new Map(
    headers.map((header, index) => [
      header[1]!,
      source
        .slice(
          header.index! + header[0].length,
          headers[index + 1]?.index ?? source.length,
        )
        .trim(),
    ]),
  );
}

function sameLine(event: OnboardingTraceEvent, evidence?: Evidence): boolean {
  return (
    !!evidence &&
    event.at.file === evidence.file &&
    event.at.line === evidence.line
  );
}

function short(value: string): string {
  return value.length > 110 ? `${value.slice(0, 107)}...` : value;
}

function links(evidence: readonly Evidence[]): string {
  return [
    ...new Map(
      evidence
        .filter((item) => item.line)
        .map((item) => [`${item.file}:${item.line}`, item]),
    ).values(),
  ]
    .slice(0, 6)
    .map((item) => sourceLink({ file: item.file, line: item.line! }))
    .join(", ");
}

function sourceLink(at: { file: string; line: number }): string {
  const path = at.file.split("/").map(encodeURIComponent).join("/");
  return `[${clean(`${at.file}:${at.line}`)}](${path}#L${at.line})`;
}

function anchor(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function clean(value: string): string {
  return sanitizeHandoverValue(value)
    .replace(/[\r\n]+/gu, " ")
    .replace(/[<>]/gu, "");
}

function escapeMarkup(value: string): string {
  return sanitizeHandoverValue(value)
    .replace(/[\r\n]+/gu, " ")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}
