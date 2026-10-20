import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionsModule } from "../sessions/sessions.module";
import { PasswordResetService } from "./password-reset.service";
import { FacebookOAuthService } from "./oauth/facebook-oauth.service";
import { GoogleOAuthService } from "./oauth/google-oauth.service";
import { OAuthController } from "./oauth/oauth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  // Tokens are signed by SessionService (src/sessions) — AuthService no longer touches JWTs itself.
  imports: [PassportModule, SessionsModule],
  controllers: [AuthController, OAuthController],
  providers: [AuthService, PasswordResetService, JwtStrategy, GoogleOAuthService, FacebookOAuthService],
  exports: [AuthService],
})
export class AuthModule {}
