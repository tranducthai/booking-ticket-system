import { Transform } from "class-transformer";
import { IsString, Length, Matches } from "class-validator";
import { trimString } from "../../common/validators";

export class CreateCategoryDto {
  @Transform(trimString)
  @IsString()
  @Length(2, 60, { message: "Tên danh mục từ 2 đến 60 ký tự" })
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: "Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang (VD: am-nhac)" })
  slug!: string;
}
