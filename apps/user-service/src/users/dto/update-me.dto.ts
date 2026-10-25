import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUrl, Length, Matches } from "class-validator";
import { normalizePhone, normalizeText, PERSON_NAME, PERSON_NAME_MESSAGE, VN_PHONE, VN_PHONE_MESSAGE } from "../../common/validators";

export class UpdateMeDto {
  @IsOptional()
  @Transform(normalizeText)
  @IsString()
  @Length(2, 100, { message: "Họ tên từ 2 đến 100 ký tự" })
  @Matches(PERSON_NAME, { message: PERSON_NAME_MESSAGE })
  fullName?: string;

  @IsOptional()
  @Transform(normalizePhone)
  @Matches(VN_PHONE, { message: VN_PHONE_MESSAGE })
  phone?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }) // require_tld: false so http://localhost:*/... image URLs still work in local dev
  avatarUrl?: string;
}
