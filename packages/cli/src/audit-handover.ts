import {
  auditHandoverKnowledge,
  type HandoverAuditResult,
} from "@transferkit/core";
import { handoverRequirements } from "@transferkit/standards";

import { readHandoverState } from "./handover-state.js";

export async function auditHandover(
  workingDirectory: string,
): Promise<HandoverAuditResult> {
  const state = await readHandoverState(workingDirectory);
  return auditHandoverKnowledge(state, handoverRequirements);
}
