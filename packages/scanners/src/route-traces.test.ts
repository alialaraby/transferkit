import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

import { discoverHandoverContextInAst } from "./handover-context.js";
import { discoverRouteTracesInAst } from "./route-traces.js";
import { createTypeScriptAst } from "./typescript-ast.js";

it("traces a direct handler call and cites guards, saves, and conditional notifications", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tk-route-trace-"));
  await writeFile(
    join(directory, "service.ts"),
    `
import { Injectable } from '@nestjs/common';
export class OrderRepository { async find() {} async save(_value: object) {} }
export class NotificationService { async send(_value: object) {} }
@Injectable() export class OrderService {
  constructor(private orderRepository: OrderRepository, private notificationService: NotificationService) {}
  async create(valid: boolean, notify: boolean) {
    await this.orderRepository.find();
    if (!valid) throw new Error('invalid');
    await this.orderRepository.save({});
    if (notify) await this.notificationService.send({});
    const indirect = this.notificationService.send;
    await indirect({});
    this['dynamic']();
  }
}
`,
  );
  await writeFile(
    join(directory, "controller.ts"),
    `
import { Controller, Post } from '@nestjs/common';
import { OrderService } from './service';
@Controller('orders') export class OrderController {
  constructor(private orderService: OrderService) {}
  @Post() create() { return this.orderService.create(true, true); }
  @Post('indirect') indirect() { const invoke = this.orderService.create; return invoke(true, true); }
}
`,
  );
  const ast = createTypeScriptAst(directory);
  const routes = discoverHandoverContextInAst(ast);
  const traces = discoverRouteTracesInAst(ast, routes);
  expect(traces).toHaveLength(1);
  const trace = traces[0]!;
  expect(trace.data.routeFindingId).toContain("OrderController.create");
  expect(trace.data.handler).toBe("OrderController.create");
  expect(trace.data.serviceMethod).toBe("OrderService.create");
  expect(trace.evidence.map((item) => item.file)).toEqual([
    "controller.ts",
    "service.ts",
  ]);
  expect(
    trace.data.operations.map((item) => [
      item.kind,
      item.method,
      item.conditional,
      item.awaited,
    ]),
  ).toEqual([
    ["call", "find", undefined, true],
    ["guard", undefined, undefined, undefined],
    ["call", "save", undefined, true],
    ["branch", undefined, undefined, undefined],
    ["call", "send", "when notify", true],
  ]);
  expect(
    trace.data.operations.every(
      (item) =>
        item.evidence[0]?.file === "service.ts" && item.evidence[0]?.line,
    ),
  ).toBe(true);
  expect(trace.data.gaps).toContain(
    "Dynamic call this['dynamic'] is unresolved.",
  );
  expect(trace.data.gaps).toContain(
    "Indirect call through indirect is unresolved.",
  );
});

it("records conditional state assignments without calling visible alternate branches untraced", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tk-route-branches-"));
  await writeFile(
    join(directory, "service.ts"),
    `
import { Injectable } from '@nestjs/common';
class RecordRepository { async save(_value: object) {} }
@Injectable() export class DecisionService {
  constructor(private recordRepository: RecordRepository) {}
  async decide(record: { status: string; action: string }, action: string) {
    if (!record) throw new Error('missing');
    record.action = action;
    await this.recordRepository.save(record);
    if (action === 'yes') {
      record.status = 'active';
      await this.recordRepository.save(record);
    } else if (action === 'no') {
      record.status = 'cancelled';
      await this.recordRepository.save(record);
    }
  }
}
`,
  );
  await writeFile(
    join(directory, "controller.ts"),
    `
import { Controller, Post } from '@nestjs/common';
import { DecisionService } from './service';
@Controller('decisions') export class DecisionController {
  constructor(private decisionService: DecisionService) {}
  @Post() decide(record: { status: string; action: string }, action: string) {
    return this.decisionService.decide(record, action);
  }
}
`,
  );
  const ast = createTypeScriptAst(directory);
  const [trace] = discoverRouteTracesInAst(
    ast,
    discoverHandoverContextInAst(ast),
  );
  expect(
    trace?.data.operations
      .filter((item) => item.kind === "assignment")
      .map((item) => [item.property, item.value, item.conditional]),
  ).toEqual([
    ["action", "action", undefined],
    ["status", "'active'", "when action === 'yes'"],
    [
      "status",
      "'cancelled'",
      "otherwise action === 'yes'; when action === 'no'",
    ],
  ]);
  expect(
    trace?.data.operations
      .filter((item) => item.kind === "assignment")
      .every(
        (item) =>
          item.evidence[0]?.file === "service.ts" && item.evidence[0]?.line,
      ),
  ).toBe(true);
  expect(trace?.data.gaps.some((gap) => gap.includes("untraced"))).toBe(false);
});
