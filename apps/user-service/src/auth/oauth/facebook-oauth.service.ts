import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuthProfile } from "./oauth-profile.interface";

/**
 * Same manual OAuth2 authorization-code flow as GoogleOAuthService, against
 * Facebook's Graph API endpoints instead. FACEBOOK_APP_ID/SECRET in
 * .env.example are placeholders — create an app at
 * https://developers.facebook.com/apps to get real ones (needs the
 * "Facebook Login" product added, redirect URI = FACEBOOK_REDIRECT_URI
 * configured there).
 */
@Injectable()
export class FacebookOAuthService {
  private readonly logger = new Logger(FacebookOAuthService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;
  private readonly graphVersion = "v19.0";

  constructor(config: ConfigService) {
    this.appId = config.get<string>("FACEBOOK_APP_ID") ?? "";
    this.appSecret = config.get<string>("FACEBOOK_APP_SECRET") ?? "";
    this.redirectUri = config.get<string>("FACEBOOK_REDIRECT_URI") ?? "http://localhost:3000/user/auth/facebook/callback";
  }

  buildAuthorizeUrl(): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: "email,public_profile",
    });
    return `https://www.facebook.com/${this.graphVersion}/dialog/oauth?${params}`;
  }

  async exchange(code: string): Promise<OAuthProfile> {
    try {
      return await this.doExchange(code);
    } catch (err) {
      this.logger.error(`Facebook OAuth exchange failed: ${(err as Error).message}`);
      throw err;
    }
  }

  private async doExchange(code: string): Promise<OAuthProfile> {
    const tokenParams = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: this.redirectUri,
      code,
    });
    const tokenRes = await fetch(`https://graph.facebook.com/${this.graphVersion}/oauth/access_token?${tokenParams}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      throw new Error(`Facebook token exchange failed with ${tokenRes.status}: ${body.slice(0, 300)}`);
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const profileParams = new URLSearchParams({ fields: "id,name,email", access_token });
    const profileRes = await fetch(`https://graph.facebook.com/me?${profileParams}`, { signal: AbortSignal.timeout(10000) });
    if (!profileRes.ok) {
      throw new Error(`Facebook userinfo request failed with ${profileRes.status}`);
    }
    const profile = (await profileRes.json()) as { id: string; email?: string; name?: string };
    // Facebook lets the user decline the email permission — nothing to fall back to since Email is this system's account key.
    if (!profile.email) {
      throw new Error("Facebook account did not grant the email permission");
    }
    return { oauthId: profile.id, email: profile.email, fullName: profile.name ?? profile.email };
  }
}
