import { Controller, Get, Logger, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { AuthService } from "../auth.service";
import { OAuthProfile } from "./oauth-profile.interface";
import { FacebookOAuthService } from "./facebook-oauth.service";
import { GoogleOAuthService } from "./google-oauth.service";

/**
 * Two legs per provider, mirroring payment-service's gateway redirect
 * pattern: GET .../<provider> sends the browser to the provider's consent
 * screen, GET .../<provider>/callback is where it comes back with a `code`.
 * On success this hands the browser its access+refresh tokens via a query
 * string redirect into apps/web's /oauth/callback route, which stores them
 * the same way a normal email/password login does (AuthContext) — simplest
 * option that needed no new frontend auth plumbing; a production system
 * would prefer not putting tokens in a URL (browser history, referrer
 * leakage) and should swap this for an HttpOnly-cookie or one-time-code
 * handoff instead.
 */
@Controller("auth")
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly google: GoogleOAuthService,
    private readonly facebook: FacebookOAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get("google")
  googleRedirect(@Res() res: Response) {
    res.redirect(this.google.buildAuthorizeUrl());
  }

  @Get("google/callback")
  googleCallback(@Query("code") code: string, @Res() res: Response) {
    return this.handleCallback(res, "google", () => this.google.exchange(code));
  }

  @Get("facebook")
  facebookRedirect(@Res() res: Response) {
    res.redirect(this.facebook.buildAuthorizeUrl());
  }

  @Get("facebook/callback")
  facebookCallback(@Query("code") code: string, @Res() res: Response) {
    return this.handleCallback(res, "facebook", () => this.facebook.exchange(code));
  }

  private async handleCallback(
    res: Response,
    provider: "google" | "facebook",
    exchange: () => Promise<OAuthProfile>,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>("FRONTEND_URL") ?? "http://localhost:5173";
    try {
      const profile = await exchange();
      const auth = await this.authService.oauthLogin(provider, profile);
      const params = new URLSearchParams({ accessToken: auth.accessToken, refreshToken: auth.refreshToken });
      res.redirect(303, `${frontendUrl}/oauth/callback?${params}`);
    } catch (err) {
      this.logger.warn(`${provider} OAuth callback failed: ${(err as Error).message}`);
      res.redirect(303, `${frontendUrl}/dang-nhap?loi=oauth`);
    }
  }
}
