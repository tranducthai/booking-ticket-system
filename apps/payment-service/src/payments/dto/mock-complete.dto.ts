import { IsIn } from "class-validator";

export class MockCompleteDto {
  @IsIn(["success", "fail"])
  outcome!: "success" | "fail";
}
