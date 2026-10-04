import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Parcel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  status!: string;
}
