import { Controller, Get, Post } from "@nestjs/common";
import { DebtService } from "./debt.service";

@Controller("debts")
export class DebtController {
  constructor(private readonly debts: DebtService) {}

  @Post()
  createDebt() {}

  @Get(":id")
  getDebt() {}
}
