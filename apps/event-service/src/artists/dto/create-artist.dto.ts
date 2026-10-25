import { Transform } from "class-transformer";
import { IsObject, IsOptional, IsString, IsUrl, Length, MaxLength, MinLength } from "class-validator";
import { trimString } from "../../common/validators";

export class CreateArtistDto {
  @Transform(trimString)
  @IsString()
  @Length(1, 100, { message: "Tên nghệ sĩ từ 1 đến 100 ký tự" })
  name!: string;

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

  /** Loose shape on purpose — {facebook?, instagram?, youtube?, spotify?, tiktok?}, see schema.prisma's own comment on Artist.socialLinks. */
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
}
