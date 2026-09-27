import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PaymentService } from "./payment.service";

@Injectable()
export class PaymentJobs {
  constructor(private readonly payments: PaymentService) {}

  @Cron("0 2 * * *")
  reconcilePayments() {}
}
