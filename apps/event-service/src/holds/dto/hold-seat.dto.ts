import { IsString } from "class-validator";

export class HoldSeatDto {
  @IsString()
  orderId!: string;
}
