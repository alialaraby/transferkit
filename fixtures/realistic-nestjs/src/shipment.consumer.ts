import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";

export class ShipmentConsumer {
  @RabbitSubscribe({
    exchange: "shipments",
    routingKey: "shipment.created",
    queue: "shipment-workers",
  })
  handleShipmentCreated() {}
}
