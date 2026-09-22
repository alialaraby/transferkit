import {
  buildMessagingSystems,
  type MessagingConsumer,
  type MessagingSystem,
} from "@transferkit/core";

import type { MessagingConsumerFinding } from "./rabbitmq-consumers.js";

export function buildRabbitMqMessagingModel(
  findings: readonly MessagingConsumerFinding[],
): MessagingSystem[] {
  return buildMessagingSystems(findings.map(toMessagingConsumer));
}

function toMessagingConsumer(
  finding: MessagingConsumerFinding,
): MessagingConsumer {
  const { name: handler, ...metadata } = finding.data;

  return {
    id: finding.id,
    kind: "messaging.consumer",
    name: metadata.queue ?? handler,
    technology: "rabbitmq",
    ...metadata,
    handler,
    evidence: finding.evidence,
  };
}
