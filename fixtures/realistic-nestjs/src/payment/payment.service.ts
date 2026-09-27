import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Payment } from "./payment.entity";
import { HyperPayClient } from "./hyperpay.client";

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly provider: HyperPayClient,
  ) {}
}
