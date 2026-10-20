import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { SessionMethod, SessionService } from "../sessions/session.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { OAuthLoginError } from "./oauth/oauth-errors";
import { OAuthProfile } from "./oauth/oauth-profile.interface";

const SALT_ROUNDS = 10;
/** The OAuth callback → apps/web handoff code is single-use and short-lived — it only has to survive one redirect. */
const OAUTH_CODE_TTL_MS = 60_000;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly activity: ActivityLogService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("Email is already registered");
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone,
      },
    });
    await this.activity.record({
      actorId: user.id,
      actorRole: user.role,
      action: "user.registered",
      targetType: "user",
      targetId: user.id,
      subjectUserId: user.id,
      summary: `Đăng ký tài khoản ${user.email}`,
    });

    return this.buildAuthResponse(user, "register");
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      return this.loginFailed(dto.email, null, "unknown_account");
    }
    if (user.isLocked) {
      return this.loginFailed(dto.email, user.id, "locked");
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      return this.loginFailed(dto.email, user.id, "bad_password");
    }

    await this.recordLogin(user, "password");
    return this.buildAuthResponse(user, "password");
  }

  /**
   * Failed logins are logged (docs/spec/14-activity-log-design.md §2 — the
   * admin's brute-force trail, and the account owner sees "someone tried
   * your password" in their own feed). The client still gets the same
   * generic message for every reason, so the log doesn't become an
   * account-enumeration oracle.
   */
  private async loginFailed(email: string, userId: string | null, reason: string): Promise<never> {
    await this.activity.record({
      actorId: "anonymous",
      action: "auth.login_failed",
      targetType: "user",
      targetId: userId,
      subjectUserId: userId,
      summary: `Đăng nhập thất bại cho ${email}`,
      metadata: { email, reason },
    });
    throw new UnauthorizedException(reason === "locked" ? "This account has been locked" : "Invalid email or password");
  }

  private async recordLogin(user: { id: string; email: string; role: string }, method: string) {
    await this.activity.record({
      actorId: user.id,
      actorRole: user.role,
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      subjectUserId: user.id,
      summary: `Đăng nhập (${method})`,
      metadata: { method },
    });
  }

  /**
   * docs/spec/11-implementation-roadmap.md Phase 1 "(stretch, can defer)
   * OAuth Google/Facebook". Find-or-create by (oauthProvider, oauthId) first,
   * falling back to linking an existing account with the same email — but
   * only when the provider vouches for that email (Google's
   * `email_verified`). Facebook gives no such guarantee, so a Facebook login
   * never takes over an existing account; it can only create a new one.
   *
   * Linking also closes the "pre-hijacking" hole: if someone registered this
   * email with a password but never proved they own it, that password is
   * dropped on link — otherwise whoever squatted the address would keep a
   * working password on the real owner's account. (The owner can set one
   * again via forgot-password.)
   *
   * Returns the user only — the session starts later, when apps/web redeems
   * the one-time code (createOAuthLoginCode → exchangeOAuthCode).
   */
  async resolveOAuthUser(provider: "google" | "facebook", profile: OAuthProfile) {
    let user = await this.prisma.user.findFirst({ where: { oauthProvider: provider, oauthId: profile.oauthId } });
    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (existingByEmail) {
        if (!profile.emailVerified) {
          throw new OAuthLoginError("oauth_email_da_ton_tai", `unverified ${provider} email ${profile.email} is already registered`);
        }
        const now = new Date();
        const dropPassword = !!existingByEmail.passwordHash && !existingByEmail.emailVerifiedAt;
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            oauthProvider: provider,
            oauthId: profile.oauthId,
            emailVerifiedAt: existingByEmail.emailVerifiedAt ?? now,
            ...(dropPassword ? { passwordHash: null, passwordChangedAt: now } : {}),
          },
        });
        await this.activity.record({
          actorId: user.id,
          actorRole: user.role,
          action: "user.oauth_linked",
          targetType: "user",
          targetId: user.id,
          subjectUserId: user.id,
          summary: `Liên kết đăng nhập ${provider}`,
          metadata: { provider, droppedUnverifiedPassword: dropPassword },
        });
      } else {
        if (provider === "google" && !profile.emailVerified) {
          throw new OAuthLoginError("oauth_email_chua_xac_minh", `Google email ${profile.email} is not verified`);
        }
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            fullName: profile.fullName,
            oauthProvider: provider,
            oauthId: profile.oauthId,
            emailVerifiedAt: profile.emailVerified ? new Date() : null,
          },
        });
      }
    }
    if (user.isLocked) {
      await this.activity.record({
        actorId: "anonymous",
        action: "auth.login_failed",
        targetType: "user",
        targetId: user.id,
        subjectUserId: user.id,
        summary: `Đăng nhập thất bại cho ${user.email}`,
        metadata: { email: user.email, reason: "locked", method: provider },
      });
      throw new OAuthLoginError("oauth_tai_khoan_bi_khoa", `account ${user.id} is locked`);
    }
    return user;
  }

  /** Only the SHA-256 is stored — the plaintext code exists only in the redirect URL. */
  async createOAuthLoginCode(userId: string, provider: "google" | "facebook"): Promise<string> {
    const code = randomBytes(32).toString("hex");
    await this.prisma.oAuthLoginCode.create({
      data: { userId, codeHash: sha256(code), method: provider, expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_MS) },
    });
    return code;
  }

  /** POST /auth/oauth/exchange — burns the code (single use, even under a race) and starts the session. */
  async exchangeOAuthCode(code: string) {
    const invalid = () => new UnauthorizedException("Mã đăng nhập không hợp lệ hoặc đã hết hạn — vui lòng thử lại.");
    const row = await this.prisma.oAuthLoginCode.findUnique({ where: { codeHash: sha256(code) }, include: { user: true } });
    if (!row || row.usedAt || row.expiresAt <= new Date()) throw invalid();
    const burned = await this.prisma.oAuthLoginCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (burned.count === 0) throw invalid();
    if (row.user.isLocked) throw new UnauthorizedException("This account has been locked");

    const method = row.method === "facebook" ? "facebook" : "google";
    await this.recordLogin(row.user, method);
    return this.buildAuthResponse(row.user, method);
  }

  /** Rotates the refresh token — see SessionService.rotate for reuse detection. */
  async refresh(refreshToken: string) {
    const { user, tokens } = await this.sessions.rotate(refreshToken);
    return { ...tokens, user };
  }

  async logout(refreshToken: string): Promise<{ ok: true }> {
    await this.sessions.logout(refreshToken);
    return { ok: true };
  }

  /** Every way of signing in ends here — starting a session also signs the user out of any other device. */
  private async buildAuthResponse(user: AuthUser, method: SessionMethod) {
    const tokens = await this.sessions.start(user, method);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  }
}
