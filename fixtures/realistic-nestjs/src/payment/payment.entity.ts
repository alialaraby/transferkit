import { Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Payment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;
}
