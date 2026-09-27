import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PaymentModule } from "./payment/payment.module";
import { DebtModule } from "./debt/debt.module";

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: "postgres",
      url: process.env.DATABASE_URL,
    }),
    PaymentModule,
    DebtModule,
  ],
})
export class AppModule {}
