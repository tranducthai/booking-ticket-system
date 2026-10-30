import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { InternalTokenGuard } from "../common/internal-token.guard";
import { CaptchaService } from "./captcha.service";

class ConsumeCaptchaDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(1)
  userId!: string;
}

/** booking-service spends the captcha token when it holds tickets (single use, bound to the user). */
@Controller("internal/captcha")
@UseGuards(InternalTokenGuard)
export class InternalCaptchaController {
  constructor(private readonly captcha: CaptchaService) {}

  @Post("consume")
  @HttpCode(HttpStatus.OK)
  async consume(@Body() dto: ConsumeCaptchaDto) {
    return { ok: await this.captcha.consume(dto.token, dto.userId) };
  }
}
