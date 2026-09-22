import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";

export class ShipmentConsumer {
  @RabbitSubscribe({
    exchange: "shipment",
    routingKey: "shipment.updated",
    queue: "shipment-webhooks",
  })
  handleShipmentUpdate(): void {}
}
