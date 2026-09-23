import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: "postgres",
      url: process.env.DATABASE_URL,
    }),
  ],
})
export class AppModule {}
