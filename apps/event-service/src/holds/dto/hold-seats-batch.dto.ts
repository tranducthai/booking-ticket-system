import { Type } from "class-transformer";
import { ArrayMinSize, IsUUID } from "class-validator";

export class HoldSeatsBatchDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  userId!: string;

  @ArrayMinSize(1)
  @Type(() => String)
  seatIds!: string[];
}
