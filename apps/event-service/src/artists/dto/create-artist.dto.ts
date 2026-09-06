import { IsObject, IsOptional, IsString, MinLength } from "class-validator";

export class CreateArtistDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  /** Loose shape on purpose — {facebook?, instagram?, youtube?, spotify?, tiktok?}, see schema.prisma's own comment on Artist.socialLinks. */
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
}
