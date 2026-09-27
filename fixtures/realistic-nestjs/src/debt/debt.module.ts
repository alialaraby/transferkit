import { Module } from "@nestjs/common";
import { DebtController } from "./debt.controller";
import { DebtService } from "./debt.service";

@Module({ controllers: [DebtController], providers: [DebtService] })
export class DebtModule {}
