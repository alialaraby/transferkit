import { Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Debt {
  @PrimaryGeneratedColumn("uuid")
  id!: string;
}
