import { RabbitSubscribe as Subscribe } from "@golevelup/nestjs-rabbitmq";

export class Consumers {
  @Subscribe({
    exchange: "orders",
    routingKey: "order.created",
    queue: "billing",
  })
  billOrder(): void {}

  @Subscribe({
    exchange: "orders",
    routingKey: "order.cancelled",
    queue: "refunds",
  })
  refundOrder(): void {}
}
