import { Transform } from "class-transformer";
import { IsEmail, IsString, MinLength } from "class-validator";
import { normalizeText } from "../../common/validators";

/** Deliberately loose on the password: login must keep working for accounts created before the stronger rule. */
export class LoginDto {
  @Transform(normalizeText)
  @IsEmail({}, { message: "Email không đúng định dạng" })
  email!: string;

  @IsString()
  @MinLength(1, { message: "Nhập mật khẩu" })
  password!: string;
}
