import { Cron } from "@nestjs/schedule";
import { ParcelRepository } from "./repository.js";

export class ParcelJobs {
  constructor(private readonly repository: ParcelRepository) {}

  @Cron("0 0 * * *")
  async inspect(): Promise<void> {
    await this.repository.find("example");
  }
}
