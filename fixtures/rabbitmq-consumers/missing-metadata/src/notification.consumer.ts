import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";

const runtimeQueue = process.env.QUEUE;

export class NotificationConsumer {
  @RabbitSubscribe({ exchange: "notifications", queue: runtimeQueue })
  notify(): void {}

  @RabbitSubscribe(createRuntimeConfiguration())
  skippedDynamicConfiguration(): void {}
}
