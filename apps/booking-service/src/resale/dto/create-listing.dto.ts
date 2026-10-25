import { IsInt, IsUUID, Max, Min } from "class-validator";

export class CreateListingDto {
  @IsUUID("all", { message: "Vé không hợp lệ" })
  ticketId!: string;

  @IsInt({ message: "Giá bán lại phải là số nguyên (đồng)" })
  @Min(10000, { message: "Giá bán lại tối thiểu 10.000đ" })
  @Max(1_000_000_000, { message: "Giá bán lại quá lớn" })
  price!: number;
}
