import { Process } from "@nestjs/bull";
import { OrderRepository } from "./service.js";

export class AssignmentWorker {
  constructor(private readonly repository: OrderRepository) {}

  @Process("assign-order")
  async handle(id: string): Promise<void> {
    if (!id) return;
    await this.repository.find(id);
  }
}

export class ArchiveWorker {
  @Process("archive-order")
  async handle(): Promise<void> {}
}
