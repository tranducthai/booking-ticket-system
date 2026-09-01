import { IsInt, Min } from "class-validator";

export class ReserveTicketTypeDto {
  @IsInt()
  @Min(1)
  quantity!: number;
}
