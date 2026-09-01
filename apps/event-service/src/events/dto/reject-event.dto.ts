import { IsString } from "class-validator";

export class RejectEventDto {
  @IsString()
  reason!: string;
}
