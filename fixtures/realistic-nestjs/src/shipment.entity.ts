import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Shipment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  status!: string;
}
