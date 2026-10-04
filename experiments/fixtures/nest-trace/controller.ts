import { Controller, Post } from "@nestjs/common";
import { OrderService } from "./order.service";

@Controller("orders")
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post()
  submit() {
    return this.orders.submit(true);
  }
}
