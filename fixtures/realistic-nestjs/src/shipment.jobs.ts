import { Cron } from "@nestjs/schedule";

export class ShipmentJobs {
  @Cron("0 */6 * * *")
  reconcileShipments() {}
}
