import type { HandoverEntity } from "@transferkit/core";
import {
  buildRabbitMqMessagingModel,
  scanRepository,
  type MessagingConsumerFinding,
  type RepositoryFinding,
} from "@transferkit/scanners";

import { readHandoverState, writeHandoverState } from "./handover-state.js";

export async function scanHandover(
  workingDirectory: string,
): Promise<RepositoryFinding[]> {
  const findings = await scanRepository(workingDirectory);
  const consumers = findings.filter(isMessagingConsumerFinding);
  const messagingEntities: HandoverEntity[] = buildRabbitMqMessagingModel(
    consumers,
  )
    .flatMap(({ consumers: systemConsumers }) => systemConsumers)
    .map(
      ({
        id,
        kind,
        name,
        technology,
        queue,
        exchange,
        routingKey,
        handler,
      }) => ({
        id,
        kind,
        name,
        technology,
        handler,
        ...(queue === undefined ? {} : { queue }),
        ...(exchange === undefined ? {} : { exchange }),
        ...(routingKey === undefined ? {} : { routingKey }),
      }),
    );
  const entities = deduplicateEntities([
    ...messagingEntities,
    ...findings.flatMap(toHandoverEntity),
  ]);
  const existing = await readHandoverState(workingDirectory);

  await writeHandoverState(workingDirectory, { ...existing, entities });
  return findings;
}

function toHandoverEntity(finding: RepositoryFinding): HandoverEntity[] {
  const data = finding.data as Record<string, unknown>;
  if (finding.kind === "scheduled-job") {
    const handler = stringValue(data.handler);
    const scheduleType = stringValue(data.type);
    const schedule =
      typeof data.schedule === "string" || typeof data.schedule === "number"
        ? data.schedule
        : undefined;
    return [
      {
        id: finding.id,
        kind: "scheduled-job",
        name: stringValue(data.name) ?? finding.id,
        ...(handler ? { handler } : {}),
        ...(scheduleType ? { scheduleType } : {}),
        ...(schedule === undefined ? {} : { schedule }),
      },
    ];
  }
  if (finding.kind === "database") {
    const name = stringValue(data.name);
    return name
      ? [
          {
            id: `database:${name.toLowerCase()}`,
            kind: "database",
            name,
            technology: name,
          },
        ]
      : [];
  }
  if (finding.kind === "integration") {
    const name = stringValue(data.service) ?? stringValue(data.client);
    const technology = stringValue(data.client);
    const endpoint = stringValue(data.endpoint);
    return name
      ? [
          {
            id: finding.id,
            kind: "integration",
            name,
            ...(technology ? { technology } : {}),
            ...(endpoint ? { endpoint } : {}),
          },
        ]
      : [];
  }
  if (
    finding.kind === "environment.variable" ||
    finding.kind === "configuration" ||
    finding.kind === "environment.template"
  ) {
    return [
      {
        id: "configuration:runtime",
        kind: "configuration",
        name: "Runtime configuration",
      },
    ];
  }
  if (finding.kind === "containerization") {
    return [
      {
        id: "containerization:docker",
        kind: "containerization",
        name: "Docker",
        technology: "Docker",
      },
    ];
  }
  if (finding.kind === "ci.workflow") {
    return [
      {
        id: finding.id,
        kind: "ci.workflow",
        name: stringValue(data.name) ?? finding.id,
        technology: "GitHub Actions",
      },
    ];
  }
  return [];
}

function deduplicateEntities(
  entities: readonly HandoverEntity[],
): HandoverEntity[] {
  return [...new Map(entities.map((entity) => [entity.id, entity])).values()];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isMessagingConsumerFinding(
  finding: RepositoryFinding,
): finding is MessagingConsumerFinding {
  return finding.kind === "messaging.consumer";
}
