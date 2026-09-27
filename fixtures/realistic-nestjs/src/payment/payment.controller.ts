import { Controller, Post } from "@nestjs/common";
import { PaymentService } from "./payment.service";

@Controller("payments")
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post()
  createPayment() {}

  @Post("callback")
  handleCallback() {}

  @Post("recover")
  recoverPayment() {}
}
