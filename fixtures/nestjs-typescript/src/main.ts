import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create(AppModule);
  await application.listen(3000);
}

void bootstrap();
