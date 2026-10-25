import { Transform } from "class-transformer";
import { IsObject, IsOptional, IsString, IsUrl, Length, MaxLength } from "class-validator";
import { trimString } from "../../common/validators";

export class UpdateArtistDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, 100, { message: "Tên nghệ sĩ từ 1 đến 100 ký tự" })
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: "Ảnh đại diện phải là URL hợp lệ" })
  avatarUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: "Ảnh bìa phải là URL hợp lệ" })
  coverUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "Giới thiệu tối đa 2000 ký tự" })
  bio?: string;

  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
}
