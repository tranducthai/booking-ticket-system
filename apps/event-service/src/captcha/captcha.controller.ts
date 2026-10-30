import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { IsNumber, IsString, Max, Min, MinLength } from "class-validator";
import { Actor, CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { CaptchaService } from "./captcha.service";

class VerifyCaptchaDto {
  @IsString()
  @MinLength(1)
  challengeId!: string;

  /** How far (px, in picture coordinates) the user slid the piece from the left edge. */
  @IsNumber()
  @Min(0)
  @Max(1000)
  x!: number;
}

/** Slider captcha shown before holding tickets — see CaptchaService. */
@Controller("captcha")
@UseGuards(RequireAuthGuard)
export class CaptchaController {
  constructor(private readonly captcha: CaptchaService) {}

  @Get("challenge")
  challenge(@CurrentActor() actor: Actor) {
    return this.captcha.createChallenge(actor.userId!);
  }

  @Post("verify")
  @HttpCode(HttpStatus.OK)
  verify(@CurrentActor() actor: Actor, @Body() dto: VerifyCaptchaDto) {
    return this.captcha.verify(actor.userId!, dto.challengeId, dto.x);
  }
}
