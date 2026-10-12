import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { JwtPayload } from "./interfaces/jwt-payload.interface";
import { OAuthProfile } from "./oauth/oauth-profile.interface";

const SALT_ROUNDS = 10;

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
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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

    return this.buildAuthResponse(user);
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
    return this.buildAuthResponse(user);
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
   * OAuth Google/Facebook" — the schema already had oauthProvider/oauthId
   * nullable-passwordHash columns reserved for this from the start (see
   * schema.prisma's own comments), just never wired up until now.
   * find-or-create by (oauthProvider, oauthId) first, falling back to
   * linking an existing email/password account with the same email rather
   * than creating a duplicate — same person signing in a different way.
   */
  async oauthLogin(provider: "google" | "facebook", profile: OAuthProfile) {
    let user = await this.prisma.user.findFirst({ where: { oauthProvider: provider, oauthId: profile.oauthId } });
    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
      user = existingByEmail
        ? await this.prisma.user.update({
            where: { id: existingByEmail.id },
            data: { oauthProvider: provider, oauthId: profile.oauthId },
          })
        : await this.prisma.user.create({
            data: {
              email: profile.email,
              fullName: profile.fullName,
              oauthProvider: provider,
              oauthId: profile.oauthId,
              emailVerifiedAt: new Date(), // the provider already verified this address
            },
          });
    }
    if (user.isLocked) {
      return this.loginFailed(user.email, user.id, "locked");
    }
    await this.recordLogin(user, provider);
    return this.buildAuthResponse(user);
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
        algorithms: ["HS256"],
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.isLocked) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: AuthUser) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    // Env-configured TTL strings ("15m", "7d") can't be statically checked against
    // the library's template-literal StringValue type, so we assert the shape here
    // at the one boundary where a plain string enters it.
    const accessTtl = (this.config.get<string>("JWT_ACCESS_TTL") ?? "15m") as JwtSignOptions["expiresIn"];
    const refreshTtl = (this.config.get<string>("JWT_REFRESH_TTL") ?? "7d") as JwtSignOptions["expiresIn"];

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
        expiresIn: accessTtl,
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
        expiresIn: refreshTtl,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  }
}
