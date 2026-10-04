export class OrderRepository {
  async find(): Promise<{ status: string }> {
    return { status: "pending" };
  }

  async save(order: { status: string }): Promise<void> {
    void order;
  }
}

export class NotificationService {
  async send(order: { status: string }): Promise<void> {
    void order;
  }
}

export function normalize(value: boolean): boolean {
  return value;
}
