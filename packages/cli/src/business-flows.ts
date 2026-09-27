import {
  businessFlowFields,
  containsLikelySecret,
  isBusinessFlowField,
  type BusinessFlow,
  type HandoverState,
} from "@transferkit/core";
import { suggestBusinessFlows } from "@transferkit/standards";

import { readHandoverState, writeHandoverState } from "./handover-state.js";
import { scanHandover } from "./scan-handover.js";

export interface FlowIO {
  write: (message: string) => void;
  read?: ((prompt: string) => Promise<string>) | undefined;
}

export async function loadBusinessFlows(
  directory: string,
): Promise<BusinessFlow[]> {
  const findings = await scanHandover(directory);
  const saved = (await readHandoverState(directory)).guided?.flows ?? [];
  const byId = new Map(
    suggestBusinessFlows(findings).map((flow) => [flow.id, flow]),
  );
  for (const flow of saved) byId.set(flow.id, flow);
  return [...byId.values()];
}

export async function manageBusinessFlow(
  directory: string,
  action: string,
  io: FlowIO,
): Promise<void> {
  const flows = await loadBusinessFlows(directory);
  if (action === "list") {
    io.write(
      flows.length
        ? flows
            .map(
              ({ id, name, status, startingPoints }) =>
                `${id} · ${name} (${status})${startingPoints?.length ? ` · starting points: ${startingPoints.join(", ")}` : ""}`,
            )
            .join("\n")
        : "No suggested or saved business flows. Use 'tk handover flow add'.",
    );
    return;
  }
  if (!io.read) throw new Error("Interactive input is unavailable");
  const state = await readHandoverState(directory);
  let confirmed = state.guided?.confirmed ?? [];
  let updated: BusinessFlow[];
  if (action === "add") {
    const name = (await io.read("Flow name > ")).trim();
    if (!name || containsLikelySecret(name))
      throw new Error("A safe flow name is required");
    const base = encodeURIComponent(name.toLowerCase().replace(/\s+/gu, "-"));
    let id = `manual:${base}`;
    let suffix = 2;
    while (flows.some((flow) => flow.id === id))
      id = `manual:${base}-${suffix++}`;
    updated = [
      ...flows,
      { id, name, origin: "manual", status: "confirmed", details: {} },
    ];
    io.write(`Added ${name} (${id}).`);
  } else {
    const id = (await io.read("Flow ID > ")).trim();
    const flow = flows.find((candidate) => candidate.id === id);
    if (!flow) throw new Error(`Unknown business flow: ${id}`);
    if (action === "confirm") {
      updated = flows.map((item) =>
        item.id === id ? { ...item, status: "confirmed" } : item,
      );
      io.write(`Confirmed ${flow.name}.`);
    } else if (action === "ignore") {
      updated = flows.map((item) =>
        item.id === id ? { ...item, status: "irrelevant" } : item,
      );
      io.write(`Marked ${flow.name} irrelevant.`);
    } else if (action === "rename") {
      const name = (await io.read("New flow name > ")).trim();
      if (!name || containsLikelySecret(name))
        throw new Error("A safe flow name is required");
      updated = flows.map((item) =>
        item.id === id ? { ...item, name } : item,
      );
      io.write(`Renamed flow to ${name}.`);
    } else if (action === "document") {
      io.write(`Fields: ${businessFlowFields.join(", ")}`);
      const field = (await io.read("Field > ")).trim();
      if (!isBusinessFlowField(field))
        throw new Error(`Unknown business flow field: ${field}`);
      const value = (await io.read(`${field} > `)).trim();
      if (!value || containsLikelySecret(value))
        throw new Error("A safe nonempty flow note is required");
      updated = flows.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "confirmed",
              details: { ...item.details, [field]: value },
            }
          : item,
      );
      const requirementId = `critical-business-flows.${id}.${field}`;
      const sufficient =
        (
          await io.read(
            "Is this field sufficiently explained for handover? (yes/no) > ",
          )
        )
          .trim()
          .toLowerCase() === "yes";
      confirmed = [
        ...confirmed.filter((item) => item !== requirementId),
        ...(sufficient ? [requirementId] : []),
      ];
      io.write(
        `Saved ${field} for ${flow.name}. ${sufficient ? "Marked covered." : "Still incomplete until confirmed."}`,
      );
    } else {
      throw new Error(`Unknown business flow action: ${action}`);
    }
  }
  const progress = state.guided ?? {
    customTopics: [],
    skipped: [],
    notApplicable: [],
  };
  const nextState: HandoverState = {
    ...state,
    guided: { ...progress, flows: updated, confirmed },
  };
  await writeHandoverState(directory, nextState);
}
