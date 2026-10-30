import { Module } from "@nestjs/common";
import { CaptchaController } from "./captcha.controller";
import { CaptchaService } from "./captcha.service";
import { InternalCaptchaController } from "./internal-captcha.controller";

@Module({
  controllers: [CaptchaController, InternalCaptchaController],
  providers: [CaptchaService],
})
export class CaptchaModule {}
