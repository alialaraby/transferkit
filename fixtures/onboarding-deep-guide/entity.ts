import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity()
export class AccountEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @OneToMany(() => OrderEntity, (order) => order.account)
  orders!: OrderEntity[];
}

@Entity()
export class OrderEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  status!: string;

  @ManyToOne(() => AccountEntity, (account) => account.orders)
  account!: AccountEntity;
}
