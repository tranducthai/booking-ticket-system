import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUrl, Length, Matches, MaxLength, ValidateIf } from "class-validator";
import { normalizePhone, normalizeText, VN_PHONE, VN_PHONE_MESSAGE } from "../../common/validators";

/** PATCH /users/:id/partner — an admin edits a partner organizer's contact info. The email is the login and stays as it is. */
export class UpdatePartnerDto {
  @IsOptional()
  @Transform(normalizeText)
  @IsString()
  @Length(2, 120, { message: "Tên đối tác từ 2 đến 120 ký tự" })
  fullName?: string;

  /** null clears the phone number. */
  @ValidateIf((o: UpdatePartnerDto) => o.phone !== undefined && o.phone !== null)
  @Transform(normalizePhone)
  @Matches(VN_PHONE, { message: VN_PHONE_MESSAGE })
  phone?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: false }) // require_tld: false so http://localhost:*/... image URLs still work in local dev
  avatarUrl?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(5000, { message: "Thông tin ban tổ chức tối đa 5000 ký tự" })
  organizerDescription?: string;
}
