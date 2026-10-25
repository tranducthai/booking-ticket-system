import { IsString } from "class-validator";

export class ResaleLockDto {
  @IsString()
  userId!: string;
}
