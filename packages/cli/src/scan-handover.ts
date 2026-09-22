import type { HandoverEntity } from "@transferkit/core";
import {
  buildRabbitMqMessagingModel,
  scanRepository,
  type MessagingConsumerFinding,
  type TechnologyFinding,
} from "@transferkit/scanners";

import { readHandoverState, writeHandoverState } from "./handover-state.js";

export async function scanHandover(
  workingDirectory: string,
): Promise<Array<TechnologyFinding | MessagingConsumerFinding>> {
  const findings = await scanRepository(workingDirectory);
  const consumers = findings.filter(isMessagingConsumerFinding);
  const entities: HandoverEntity[] = buildRabbitMqMessagingModel(consumers)
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
  const existing = await readHandoverState(workingDirectory);

  await writeHandoverState(workingDirectory, { ...existing, entities });
  return findings;
}

function isMessagingConsumerFinding(
  finding: TechnologyFinding | MessagingConsumerFinding,
): finding is MessagingConsumerFinding {
  return finding.kind === "messaging.consumer";
}
