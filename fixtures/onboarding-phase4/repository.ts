import { Repository } from "typeorm";
import { Parcel } from "./entity.js";

export class ParcelRepository extends Repository<Parcel> {
  async find(_id: string): Promise<Parcel | undefined> {
    void _id;
    return undefined;
  }
}
