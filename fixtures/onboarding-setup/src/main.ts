import { NestFactory } from "@nestjs/core";

const port = process.env.PORT || 4000;
const app = await NestFactory.create({});
await app.listen(port);
