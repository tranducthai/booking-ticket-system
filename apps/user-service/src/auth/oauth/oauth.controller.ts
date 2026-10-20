import { Controller, Get, Logger, Query, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { AuthService } from "../auth.service";
import { FacebookOAuthService } from "./facebook-oauth.service";
import { GoogleOAuthService } from "./google-oauth.service";
import { OAuthErrorCode, OAuthLoginError } from "./oauth-errors";
import { consumeOAuthState, issueOAuthState } from "./oauth-state";

type Provider = "google" | "facebook";

interface ProviderClient {
  isConfigured(): boolean;
  usesHttps(): boolean;
  buildAuthorizeUrl(state: string): string;
  exchange(code: string): ReturnType<GoogleOAuthService["exchange"]>;
}

/**
 * Two legs per provider, mirroring payment-service's gateway redirect
 * pattern: GET .../<provider> sends the browser to the provider's consent
 * screen, GET .../<provider>/callback is where it comes back with a `code`.
 *
 * The callback never puts tokens in a URL (browser history, Referer,
 * logs): it redirects into apps/web's /oauth/callback with a single-use,
 * 60-second code, which the SPA trades for tokens via POST
 * /auth/oauth/exchange. (An HttpOnly cookie handoff doesn't work here —
 * apps/web and the gateway are on different sites, so the cookie would be
 * third-party.) Every failure lands on /dang-nhap?loi=<OAuthErrorCode>.
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
    this.redirectToProvider(res, "google");
  }

  @Get("google/callback")
  googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleCallback(req, res, "google", { code, state, error });
  }

  @Get("facebook")
  facebookRedirect(@Res() res: Response) {
    this.redirectToProvider(res, "facebook");
  }

  @Get("facebook/callback")
  facebookCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleCallback(req, res, "facebook", { code, state, error });
  }

  private client(provider: Provider): ProviderClient {
    return provider === "google" ? this.google : this.facebook;
  }

  private frontendUrl(): string {
    return (this.config.get<string>("FRONTEND_URL") ?? "http://localhost:5173").replace(/\/+$/, "");
  }

  private fail(res: Response, code: OAuthErrorCode): void {
    res.redirect(303, `${this.frontendUrl()}/dang-nhap?loi=${code}`);
  }

  private redirectToProvider(res: Response, provider: Provider): void {
    const client = this.client(provider);
    if (!client.isConfigured()) {
      // Without credentials the provider would only show its own cryptic
      // "missing client_id" error page — say what's actually wrong instead.
      this.logger.warn(`${provider} OAuth is not configured (client id/secret env vars are empty)`);
      this.fail(res, "oauth_chua_cau_hinh");
      return;
    }
    const state = issueOAuthState(res, provider, client.usesHttps());
    res.redirect(client.buildAuthorizeUrl(state));
  }

  private async handleCallback(
    req: Request,
    res: Response,
    provider: Provider,
    query: { code?: string; state?: string; error?: string },
  ): Promise<void> {
    const client = this.client(provider);
    if (!consumeOAuthState(req, res, provider, query.state, client.usesHttps())) {
      this.logger.warn(`${provider} OAuth callback rejected: state missing or mismatched`);
      this.fail(res, "oauth_state");
      return;
    }
    if (query.error || !query.code) {
      this.fail(res, query.error === "access_denied" ? "oauth_huy" : "oauth");
      return;
    }
    try {
      const profile = await client.exchange(query.code);
      const user = await this.authService.resolveOAuthUser(provider, profile);
      const loginCode = await this.authService.createOAuthLoginCode(user.id, provider);
      res.redirect(303, `${this.frontendUrl()}/oauth/callback?code=${loginCode}`);
    } catch (err) {
      this.logger.warn(`${provider} OAuth callback failed: ${(err as Error).message}`);
      this.fail(res, err instanceof OAuthLoginError ? err.code : "oauth");
    }
  }
}
