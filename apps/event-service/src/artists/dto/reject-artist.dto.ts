import { Transform } from "class-transformer";
import { IsString, Length } from "class-validator";
import { trimString } from "../../common/validators";

export class RejectArtistDto {
  @Transform(trimString)
  @IsString()
  @Length(3, 500, { message: "Lý do từ chối từ 3 đến 500 ký tự" })
  reason!: string;
}
