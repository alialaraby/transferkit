import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Debt } from "./debt.entity";

@Injectable()
export class DebtService {
  constructor(
    @InjectRepository(Debt) private readonly debts: Repository<Debt>,
  ) {}
}
