import { Module } from "@nestjs/common";
import { ParcelController } from "./controller.js";
import { ParcelService } from "./service.js";

@Module({ controllers: [ParcelController], providers: [ParcelService] })
export class ParcelModule {}
