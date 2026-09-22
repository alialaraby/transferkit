import { packageName as corePackageName } from "@transferkit/core";
import type { KnowledgeRequirement } from "@transferkit/core";

export const packageName = "@transferkit/standards";
export const dependencies = [corePackageName] as const;

export type MessagingConsumerKnowledgeField =
  "criticality" | "failureBehavior" | "recoveryProcedure" | "operationalOwner";

export type MessagingConsumerRequirement = KnowledgeRequirement<
  "messaging.consumer",
  MessagingConsumerKnowledgeField
>;

export const messagingConsumerRequirements = [
  {
    id: "messaging.consumer.criticality",
    entityKind: "messaging.consumer",
    field: "criticality",
    title: "Criticality",
    priority: "critical",
  },
  {
    id: "messaging.consumer.failure-behavior",
    entityKind: "messaging.consumer",
    field: "failureBehavior",
    title: "Failure behavior",
    priority: "critical",
  },
  {
    id: "messaging.consumer.recovery",
    entityKind: "messaging.consumer",
    field: "recoveryProcedure",
    title: "Recovery / replay procedure",
    priority: "critical",
  },
  {
    id: "messaging.consumer.owner",
    entityKind: "messaging.consumer",
    field: "operationalOwner",
    title: "Operational owner",
    priority: "critical",
  },
] as const satisfies readonly MessagingConsumerRequirement[];
