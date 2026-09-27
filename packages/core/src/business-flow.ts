export const businessFlowFields = [
  "purpose",
  "actors",
  "entryPoint",
  "mainPath",
  "businessRules",
  "dataChanges",
  "externalSideEffects",
  "failurePaths",
  "retryRecovery",
  "manualOperations",
  "edgeCases",
  "surprisingBehavior",
] as const;

export type BusinessFlowField = (typeof businessFlowFields)[number];

export interface BusinessFlow {
  id: string;
  name: string;
  origin: "suggested" | "manual";
  status: "suggested" | "confirmed" | "irrelevant";
  sourceFindingId?: string;
  startingPoints?: string[];
  details: Partial<Record<BusinessFlowField, string>>;
}

export function isBusinessFlowField(value: string): value is BusinessFlowField {
  return (businessFlowFields as readonly string[]).includes(value);
}
