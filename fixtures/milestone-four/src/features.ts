import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { Cron, Interval, Timeout } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
import axios from "axios";
import { Entity } from "typeorm";

TypeOrmModule.forRoot({ type: "postgres", url: process.env.DATABASE_URL });

@Entity()
export class Shipment {}

export class Jobs {
  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  @Cron("0 * * * *")
  hourly() {}

  @Interval(5000)
  poll() {}

  @Timeout(dynamicDelay)
  warmup() {}

  run() {
    this.config.get("PARTNER_TOKEN");
    axios.get("https://example.test/shipments");
    fetch(dynamicUrl);
    this.httpService.post("https://hooks.example.test");
  }
}
