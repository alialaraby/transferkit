import { Module } from "@nestjs/common";
import { PaymentController } from "./payment.controller";
import { PaymentService } from "./payment.service";
import { HyperPayClient } from "./hyperpay.client";
import { PaymentJobs } from "./payment.jobs";

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, HyperPayClient, PaymentJobs],
})
export class PaymentModule {}
