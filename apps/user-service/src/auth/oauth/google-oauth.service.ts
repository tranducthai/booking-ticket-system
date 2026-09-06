import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuthProfile } from "./oauth-profile.interface";

/**
 * Manual OAuth2 authorization-code flow against Google's own endpoints —
 * same posture as the payment gateways in payment-service (raw fetch, no
 * SDK/passport-strategy package): this is 3 well-documented HTTP calls
 * (authorize redirect, token exchange, userinfo), not worth a dependency.
 * GOOGLE_CLIENT_ID/SECRET in .env.example are placeholders — create an
 * OAuth client at https://console.cloud.google.com/apis/credentials (type
 * "Web application", authorized redirect URI = GOOGLE_REDIRECT_URI below)
 * to get real ones. PAYMENT_GATEWAY_MODE-style opt-out doesn't apply here —
 * the "Đăng nhập với Google" button always calls this; without real
 * credentials it just 400s at Google's own authorize screen.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>("GOOGLE_CLIENT_ID") ?? "";
    this.clientSecret = config.get<string>("GOOGLE_CLIENT_SECRET") ?? "";
    // Through api-gateway's /user prefix, same reasoning as payment-service's
    // VNPAY_RETURN_URL — Google redirects the browser here, not to this
    // service's own port directly.
    this.redirectUri = config.get<string>("GOOGLE_REDIRECT_URI") ?? "http://localhost:3000/user/auth/google/callback";
  }

  buildAuthorizeUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchange(code: string): Promise<OAuthProfile> {
    try {
      return await this.doExchange(code);
    } catch (err) {
      this.logger.error(`Google OAuth exchange failed: ${(err as Error).message}`);
      throw err;
    }
  }

  private async doExchange(code: string): Promise<OAuthProfile> {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      throw new Error(`Google token exchange failed with ${tokenRes.status}: ${body.slice(0, 300)}`);
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!profileRes.ok) {
      throw new Error(`Google userinfo request failed with ${profileRes.status}`);
    }
    const profile = (await profileRes.json()) as { sub: string; email?: string; name?: string };
    if (!profile.email) {
      throw new Error("Google account has no email on its profile");
    }
    return { oauthId: profile.sub, email: profile.email, fullName: profile.name ?? profile.email };
  }
}
