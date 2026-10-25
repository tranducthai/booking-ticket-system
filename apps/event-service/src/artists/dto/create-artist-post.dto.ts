import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, IsUrl, Length } from "class-validator";
import { trimString } from "../../common/validators";

export class CreateArtistPostDto {
  @Transform(trimString)
  @IsString()
  @Length(1, 2000, { message: "Nội dung bài đăng từ 1 đến 2000 ký tự" })
  content!: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: "Ảnh phải là URL hợp lệ" })
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  membersOnly?: boolean;
}
