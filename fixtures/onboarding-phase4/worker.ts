import { Processor, WorkerHost } from "@nestjs/bullmq";

@Processor("parcel-jobs")
export class ParcelProcessor extends WorkerHost {
  async process(): Promise<void> {}
}

@Processor("elsewhere")
export class OtherProcessor extends WorkerHost {
  async process(): Promise<void> {}
}
