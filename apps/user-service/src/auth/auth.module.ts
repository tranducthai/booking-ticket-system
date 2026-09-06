import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { FacebookOAuthService } from "./oauth/facebook-oauth.service";
import { GoogleOAuthService } from "./oauth/google-oauth.service";
import { OAuthController } from "./oauth/oauth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  // No default secret here on purpose — AuthService passes JWT_ACCESS_SECRET /
  // JWT_REFRESH_SECRET explicitly on every sign/verify call (see auth.service.ts),
  // since access and refresh tokens are signed with two different secrets.
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController, OAuthController],
  providers: [AuthService, JwtStrategy, GoogleOAuthService, FacebookOAuthService],
  exports: [AuthService],
})
export class AuthModule {}
