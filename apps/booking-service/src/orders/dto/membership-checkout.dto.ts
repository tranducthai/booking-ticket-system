import { IsUUID } from "class-validator";

export class MembershipCheckoutDto {
  @IsUUID("all", { message: "Gói thành viên không hợp lệ" })
  planId!: string;
}
