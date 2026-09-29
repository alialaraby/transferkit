import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { discoverHandoverContext } from "./handover-context.js";

it("discovers application boundaries and source evidence without claiming business semantics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tk-context-"));
  await writeFile(
    join(directory, "app.ts"),
    `
import { Module, Controller, Get, Injectable, UseGuards, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Entity, ManyToOne } from 'typeorm';
@Injectable() class PaymentsService { constructor(private readonly repo: PaymentsRepo) {} }
@Controller('payments') class PaymentsController { @Get(':id') @UseGuards(AuthGuard) find() {} }
@Module({ controllers: [PaymentsController], providers: [PaymentsService] }) class AppModule {}
@Entity() class Payment { @ManyToOne(() => Account) account!: Account; }
NestFactory.create(AppModule);
const logger = new Logger(); logger.warn('retry');
`,
  );
  const findings = discoverHandoverContext(directory);
  expect(findings.map(({ kind }) => kind)).toEqual(
    expect.arrayContaining([
      "application.entry-point",
      "application.module",
      "application.controller",
      "application.route",
      "application.service",
      "security.guard",
      "database.relationship",
      "observability.signal",
    ]),
  );
  expect(
    findings.find(({ kind }) => kind === "application.route")?.data,
  ).toMatchObject({ verb: "GET", path: "/payments/:id" });
  expect(findings.every(({ evidence }) => evidence[0]?.file === "app.ts")).toBe(
    true,
  );
  expect(
    findings.find(({ kind }) => kind === "application.module")?.data
      .importNames,
  ).toBe("");
});

it("composes controller and method paths from static NestJS route constants", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tk-routes-"));
  await writeFile(
    join(directory, "constants.ts"),
    `
export class Paths {
  static VERSION = 'v1';
  static PREFIX = [\`\${Paths.VERSION}/api/debt\`];
  static CREATE = 'add-debt';
}
`,
  );
  await writeFile(
    join(directory, "controller.ts"),
    `
import { Controller, Get, Post } from '@nestjs/common';
import { Paths } from './constants';
@Controller(Paths.PREFIX) class DebtController {
  @Post(Paths.CREATE) addDebt() {}
  @Post(\`\${Paths.CREATE}/:id\`) retry() {}
  @Get(['health', \`\${Paths.VERSION}/health\`]) health() {}
}
`,
  );
  const routes = discoverHandoverContext(directory).filter(
    (finding) => finding.kind === "application.route",
  );
  expect(routes.map((route) => route.data.path)).toEqual([
    "/v1/api/debt/add-debt",
    "/v1/api/debt/add-debt/:id",
    "/v1/api/debt/health",
    "/v1/api/debt/v1/health",
  ]);
  expect(routes[0]?.evidence.map((item) => item.file)).toEqual(
    expect.arrayContaining(["controller.ts", "constants.ts"]),
  );
  expect(
    routes[0]?.evidence.filter((item) => item.file === "constants.ts").length,
  ).toBeGreaterThanOrEqual(2);
});

it("leaves dynamic paths unresolved instead of printing a root route", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tk-routes-"));
  await writeFile(
    join(directory, "controller.ts"),
    `
import { Controller, Get, Post } from '@nestjs/common';
const dynamic = process.env.ROUTE_PATH;
@Controller(dynamic) class DynamicController {
  @Post('submit') submit() {}
}
@Controller('known') class KnownController {
  @Get(dynamic) lookup() {}
  @Get() root() {}
  @Get(['static', dynamic]) mixed() {}
}
`,
  );
  const routes = discoverHandoverContext(directory).filter(
    (finding) => finding.kind === "application.route",
  );
  expect(routes.map((route) => route.data.path)).toEqual([
    undefined,
    undefined,
    "/known",
    undefined,
  ]);
});

it("reports only module names for root imports with configuration arguments", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tk-module-imports-"));
  await writeFile(
    join(directory, "app.ts"),
    `
import { Module } from '@nestjs/common';
class FeatureModule {}
class ConfigModule { static forRoot(_options: object) {} }
@Module({ imports: [ConfigModule.forRoot({ nested: { value: true } }), FeatureModule] })
class AppModule {}
`,
  );
  const module = discoverHandoverContext(directory).find(
    (item) => item.kind === "application.module",
  );
  expect(module?.data.importNames).toBe("ConfigModule, FeatureModule");
});
