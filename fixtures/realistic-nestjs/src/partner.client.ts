import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";

export class PartnerClient {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  notify() {
    const partnerUrl = this.config.get("PARTNER_API_URL");
    return this.httpService.post("https://partner.example.test/shipments", {
      configured: Boolean(partnerUrl),
    });
  }
}
