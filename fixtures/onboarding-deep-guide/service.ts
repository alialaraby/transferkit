export type OrderInput = { valid: boolean; priority: boolean };
type Order = { id: string; status: string };

export class OrderRepository extends Repository<OrderEntity> {
  async find(_id: string): Promise<OrderEntity | undefined> {
    void _id;
    return undefined;
  }
}

export class AssignmentQueue {
  async add(_name: string, _data: { id: string }): Promise<void> {
    void _name;
    void _data;
  }
}

export interface QueryRunner {
  manager: { save(order: Order): Promise<void> };
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  release(): Promise<void>;
}

export declare class DataSource {
  createQueryRunner(): QueryRunner;
}

export class CacheSnapshot {
  save(_order: Order): void {
    void _order;
  }
}

export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly queue: AssignmentQueue,
    private readonly dataSource: DataSource,
    private readonly cache: CacheSnapshot,
  ) {}

  async create(input: OrderInput): Promise<Order> {
    if (!input.valid) throw new Error("invalid order");
    const order: Order = { id: "order-1", status: "new" };
    await this.repository.find(order.id);
    if (input.priority) {
      order.status = "priority";
    } else {
      order.status = "standard";
    }
    this.recordAttempt(order);
    this.recordAttempt(order);
    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.manager.save(order);
      await runner.commitTransaction();
    } catch {
      await runner.rollbackTransaction();
      throw new Error("order write failed");
    } finally {
      await runner.release();
    }
    await this.queue.add("assign-order", { id: order.id });
    this.cache.save(order);
    return order;
  }

  private recordAttempt(_order: Order): void {
    void _order;
  }
}

import { Repository } from "typeorm";
import { OrderEntity } from "./entity.js";
