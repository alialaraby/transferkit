import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { ParcelRepository } from "./repository.js";

export class ParcelService {
  constructor(
    @InjectQueue("parcel-jobs") private readonly queue: Queue,
    @InjectQueue("other-jobs") private readonly other: Queue,
    private readonly repository: ParcelRepository,
  ) {}

  async dispatch() {
    // Keep the read before publication so missing parcels can be reviewed by the caller.
    await this.repository.find("example");
    await this.queue.add("assign-parcel", { id: "example" });
    await this.other.add("archive-parcel", { id: "example" });
    const dynamicJob = process.env.JOB_NAME ?? "unknown";
    await this.queue.add(dynamicJob, { id: "example" });
  }
}
