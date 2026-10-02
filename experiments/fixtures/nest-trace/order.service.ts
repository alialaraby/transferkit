import { OrderRepository, NotificationService, normalize } from "./providers";

interface Dispatcher {
  send(order: { status: string }): void;
}

export class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly notifications: NotificationService,
    private readonly dispatcher: Dispatcher,
  ) {}

  async submit(accepted: boolean) {
    accepted = normalize(accepted);
    const order = await this.orders.find();
    this.validate(order);
    if (accepted) {
      order.status = "accepted";
      await this.orders.save(order);
    } else {
      order.status = "rejected";
      throw new Error("rejected");
    }
    try {
      await this.notifications.send(order);
    } catch {
      order.status = "notification-failed";
    }
    const method = "send";
    this.notifications[method](order);
    this.dispatcher.send(order);
  }

  private validate(order: { status: string }) {
    if (!order) throw new Error("missing order");
  }
}
