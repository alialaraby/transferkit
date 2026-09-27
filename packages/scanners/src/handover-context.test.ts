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
});
