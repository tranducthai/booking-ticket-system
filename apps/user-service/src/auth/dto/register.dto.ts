import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";
import { normalizePhone, normalizeText, PASSWORD, PASSWORD_MESSAGE, PERSON_NAME, PERSON_NAME_MESSAGE, VN_PHONE, VN_PHONE_MESSAGE } from "../../common/validators";

export class RegisterDto {
  @Transform(normalizeText)
  @IsEmail({}, { message: "Email không đúng định dạng" })
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(PASSWORD, { message: PASSWORD_MESSAGE })
  password!: string;

  @Transform(normalizeText)
  @IsString()
  @Length(2, 100, { message: "Họ tên từ 2 đến 100 ký tự" })
  @Matches(PERSON_NAME, { message: PERSON_NAME_MESSAGE })
  fullName!: string;

  @IsOptional()
  @Transform(normalizePhone)
  @Matches(VN_PHONE, { message: VN_PHONE_MESSAGE })
  phone?: string;

  /**
   * "Người mua vé" (default) or "Ban tổ chức". A self-registered organizer
   * gets the ORGANIZER role right away but stays unverified until an admin
   * verifies them — safe because every event still needs admin approval
   * before it goes on sale.
   */
  @IsOptional()
  @IsIn(["CUSTOMER", "ORGANIZER"], { message: "Loại tài khoản không hợp lệ" })
  accountType?: "CUSTOMER" | "ORGANIZER";
}
