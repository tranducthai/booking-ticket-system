import { IsString, MinLength } from "class-validator";

export class CheckInDto {
  @IsString()
  @MinLength(1)
  qrPayload!: string;
}
