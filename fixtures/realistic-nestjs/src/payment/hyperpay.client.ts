import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";

@Injectable()
export class HyperPayClient {
  constructor(private readonly httpService: HttpService) {}

  submit() {
    return this.httpService.post("https://hyperpay.example.test/payments", {});
  }
}
