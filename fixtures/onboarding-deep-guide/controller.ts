import { Controller, Post } from "@nestjs/common";
import { OrderService, type OrderInput } from "./service.js";

@Controller("orders")
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post("submit")
  submit(input: OrderInput) {
    return this.orders.create(input);
  }

  @Post("preview")
  preview(input: OrderInput) {
    return this.orders.create(input);
  }
}
