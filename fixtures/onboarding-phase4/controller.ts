import { Controller, Post } from "@nestjs/common";
import { ParcelService } from "./service.js";

@Controller("parcels")
export class ParcelController {
  constructor(private readonly parcels: ParcelService) {}

  @Post("dispatch")
  dispatch() {
    return this.parcels.dispatch();
  }
}
