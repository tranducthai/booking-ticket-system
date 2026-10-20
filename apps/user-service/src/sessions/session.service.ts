import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { createHash, randomUUID } from "crypto";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { requestContext } from "../activity-log/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { REVOKED_TOMBSTONE_TTL_SECONDS, SESSION_ACTIVE, SESSION_REVOKED_CHANNEL, sessionKey } from "./session-keys";

export type SessionMethod = "password" | "register" | "google" | "facebook";
export type RevokeReason = "logout" | "replaced" | "password_reset" | "locked" | "refresh_reuse";

export interface TokenUser {
  id: string;
  email: string;
  role: string;
}

interface RefreshPayload {
  sub: string;
  sid?: string;
  jti?: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** A refresh token rotated out this recently is still accepted once more (lost response, two tabs racing). */
const ROTATION_GRACE_MS = 30_000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** 401 body the frontend can branch on (`code`) — same envelope as every other HttpException. */
export function sessionUnauthorized(code: string, message: string): UnauthorizedException {
  return new UnauthorizedException({ statusCode: 401, message, error: "Unauthorized", code });
}

const REVOKED_MESSAGES: Record<string, [code: string, message: string]> = {
  replaced: ["SESSION_REPLACED", "Tài khoản của bạn vừa đăng nhập ở thiết bị khác — phiên này đã bị đăng xuất."],
  logout: ["SESSION_REVOKED", "Phiên đăng nhập đã kết thúc — vui lòng đăng nhập lại."],
  password_reset: ["SESSION_REVOKED", "Mật khẩu vừa được đặt lại — vui lòng đăng nhập lại."],
  locked: ["SESSION_REVOKED", "Tài khoản đã bị khóa."],
  refresh_reuse: ["SESSION_REVOKED", "Phiên đăng nhập bị thu hồi vì phát hiện token bị dùng lại — vui lòng đăng nhập lại."],
};

export function revokedError(reason: string | undefined): UnauthorizedException {
  const [code, message] = REVOKED_MESSAGES[reason ?? ""] ?? ["SESSION_EXPIRED", "Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại."];
  return sessionUnauthorized(code, message);
}

/**
 * Owns every signed-in session — and so every token: access and refresh
 * tokens both carry the session id (`sid`).
 *
 * Redis (src/sessions/session-keys.ts) is the authority on whether a sid
 * may still be used — api-gateway checks it on every request, which is what
 * makes logout / a new login elsewhere / an admin lock take effect
 * immediately instead of when the 15-minute access token expires. The
 * Session row is the durable record (who, when, from where, which refresh
 * token is current). Because Redis is what the gateway trusts, a revocation
 * writes Redis FIRST and fails the request (503) if it can't — never "DB
 * says revoked, gateway still lets it through".
 *
 * One active session per user: start() revokes every other session as
 * "replaced".
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly activity: ActivityLogService,
  ) {}

  async start(user: TokenUser, method: SessionMethod): Promise<SessionTokens> {
    const sid = randomUUID();
    const tokens = await this.signTokens(user, sid);
    const expiresAt = this.expiryOf(tokens.refreshToken);
    const ctx = requestContext.getStore();
    await this.prisma.session.create({
      data: {
        id: sid,
        userId: user.id,
        method,
        refreshTokenHash: hashToken(tokens.refreshToken),
        expiresAt,
        ipAddress: ctx?.ip,
        userAgent: ctx?.userAgent,
      },
    });

    const others = await this.prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, id: { not: sid } },
      select: { id: true },
    });
    const otherIds = others.map((s) => s.id);

    // NX: if a concurrent login of the same user already tombstoned this sid,
    // don't resurrect it — at most one of two racing logins survives.
    const multi = this.redis.multi().set(sessionKey(sid), SESSION_ACTIVE, "EX", this.ttlSeconds(expiresAt), "NX");
    for (const id of otherIds) this.tombstone(multi, id, "replaced");
    let activated: boolean;
    try {
      const results = await multi.exec();
      activated = results?.[0]?.[1] === "OK";
    } catch (err) {
      this.logger.error(`Could not register session ${sid}: ${(err as Error).message}`);
      await this.prisma.session.delete({ where: { id: sid } }).catch(() => undefined);
      throw new ServiceUnavailableException("Không thể tạo phiên đăng nhập lúc này — vui lòng thử lại.");
    }

    const now = new Date();
    if (otherIds.length > 0) {
      await this.prisma.session.updateMany({
        where: { id: { in: otherIds }, revokedAt: null },
        data: { revokedAt: now, revokedReason: "replaced" },
      });
    }
    if (!activated) {
      await this.prisma.session.update({ where: { id: sid }, data: { revokedAt: now, revokedReason: "replaced" } });
      throw revokedError("replaced");
    }
    return tokens;
  }

  /** POST /auth/refresh — rotates the refresh token; presenting a stale one revokes the whole session. */
  async rotate(refreshToken: string): Promise<{ user: TokenUser & { fullName: string }; tokens: SessionTokens }> {
    const payload = await this.verifyRefresh(refreshToken, false);
    if (!payload?.sid) throw sessionUnauthorized("TOKEN_INVALID", "Invalid or expired refresh token");
    const sid = payload.sid;
    const presentedHash = hashToken(refreshToken);

    for (let attempt = 0; attempt < 2; attempt++) {
      const session = await this.prisma.session.findUnique({ where: { id: sid }, include: { user: true } });
      if (!session || session.userId !== payload.sub) {
        throw sessionUnauthorized("TOKEN_INVALID", "Invalid or expired refresh token");
      }
      if (session.revokedAt) throw revokedError(session.revokedReason ?? undefined);
      if (session.expiresAt <= new Date()) throw revokedError(undefined);
      if (session.user.isLocked) throw revokedError("locked");

      const status = await this.status(sid);
      if (status !== SESSION_ACTIVE) {
        const reason = status?.startsWith("revoked:") ? status.slice("revoked:".length) : undefined;
        await this.prisma.session.updateMany({
          where: { id: sid, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: reason ?? "expired" },
        });
        throw revokedError(reason);
      }

      const isCurrent = presentedHash === session.refreshTokenHash;
      const inGrace =
        presentedHash === session.prevRefreshTokenHash &&
        !!session.rotatedAt &&
        Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS;
      if (!isCurrent && !inGrace) {
        // A refresh token that was already rotated out came back — someone
        // else holds a copy. Kill the session for both of them.
        await this.revokeIds([sid], "refresh_reuse");
        await this.activity.record({
          actorId: session.userId,
          actorRole: session.user.role,
          action: "auth.refresh_reuse",
          targetType: "user",
          targetId: session.userId,
          subjectUserId: session.userId,
          summary: "Phát hiện refresh token bị dùng lại — phiên đã bị thu hồi",
          metadata: { sessionId: sid },
        });
        throw revokedError("refresh_reuse");
      }

      const tokens = await this.signTokens(session.user, sid);
      const expiresAt = this.expiryOf(tokens.refreshToken);
      // Compare-and-swap on the hash we just read: a concurrent rotation of
      // the same session makes this a no-op, and the loop re-evaluates.
      const swapped = await this.prisma.session.updateMany({
        where: { id: sid, refreshTokenHash: session.refreshTokenHash, revokedAt: null },
        data: {
          refreshTokenHash: hashToken(tokens.refreshToken),
          prevRefreshTokenHash: session.refreshTokenHash,
          rotatedAt: new Date(),
          expiresAt,
        },
      });
      if (swapped.count === 0) continue;

      await this.redis.expire(sessionKey(sid), this.ttlSeconds(expiresAt)).catch((err: Error) => {
        this.logger.warn(`Could not extend session ${sid} in Redis: ${err.message}`);
      });
      const { id, email, fullName, role } = session.user;
      return { user: { id, email, fullName, role }, tokens };
    }
    throw sessionUnauthorized("TOKEN_INVALID", "Invalid or expired refresh token");
  }

  /** POST /auth/logout — always succeeds from the caller's point of view; an unknown/invalid token just has nothing to revoke. */
  async logout(refreshToken: string): Promise<void> {
    const payload = await this.verifyRefresh(refreshToken, true);
    if (!payload?.sid) return;
    const session = await this.prisma.session.findUnique({ where: { id: payload.sid }, include: { user: true } });
    if (!session || session.userId !== payload.sub || session.revokedAt) return;
    await this.revokeIds([session.id], "logout");
    await this.activity.record({
      actorId: session.userId,
      actorRole: session.user.role,
      action: "auth.logout",
      targetType: "user",
      targetId: session.userId,
      subjectUserId: session.userId,
      summary: "Đăng xuất",
      metadata: { sessionId: session.id },
    });
  }

  /** Password reset, admin lock — signs the user out everywhere. */
  async revokeAllForUser(userId: string, reason: RevokeReason): Promise<void> {
    const sessions = await this.prisma.session.findMany({ where: { userId, revokedAt: null }, select: { id: true } });
    await this.revokeIds(
      sessions.map((s) => s.id),
      reason,
    );
  }

  /** For user-service's own JwtAuthGuard (requests that reach it without going through the gateway). */
  async isActive(sid: string): Promise<boolean> {
    try {
      return (await this.status(sid)) === SESSION_ACTIVE;
    } catch (err) {
      this.logger.error(`Session lookup failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException("Không kiểm tra được phiên đăng nhập lúc này.");
    }
  }

  private async revokeIds(ids: string[], reason: RevokeReason): Promise<void> {
    if (ids.length === 0) return;
    const multi = this.redis.multi();
    for (const id of ids) this.tombstone(multi, id, reason);
    try {
      await multi.exec();
    } catch (err) {
      this.logger.error(`Could not revoke sessions ${ids.join(",")}: ${(err as Error).message}`);
      throw new ServiceUnavailableException("Không thể thu hồi phiên đăng nhập lúc này — vui lòng thử lại.");
    }
    await this.prisma.session.updateMany({
      where: { id: { in: ids }, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private tombstone(multi: ReturnType<RedisService["multi"]>, sid: string, reason: RevokeReason) {
    multi.set(sessionKey(sid), `revoked:${reason}`, "EX", REVOKED_TOMBSTONE_TTL_SECONDS).publish(SESSION_REVOKED_CHANNEL, sid);
  }

  private status(sid: string): Promise<string | null> {
    return this.redis.get(sessionKey(sid));
  }

  private async verifyRefresh(token: string, ignoreExpiration: boolean): Promise<RefreshPayload | null> {
    try {
      return await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
        algorithms: ["HS256"],
        ignoreExpiration,
      });
    } catch {
      if (ignoreExpiration) return null;
      throw sessionUnauthorized("TOKEN_INVALID", "Invalid or expired refresh token");
    }
  }

  private async signTokens(user: TokenUser, sid: string): Promise<SessionTokens> {
    // Env-configured TTL strings ("15m", "7d") can't be statically checked against
    // the library's template-literal StringValue type, so we assert the shape here
    // at the one boundary where a plain string enters it.
    const accessTtl = (this.config.get<string>("JWT_ACCESS_TTL") ?? "15m") as JwtSignOptions["expiresIn"];
    const refreshTtl = (this.config.get<string>("JWT_REFRESH_TTL") ?? "7d") as JwtSignOptions["expiresIn"];
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.id, email: user.email, role: user.role, sid },
        { secret: this.config.get<string>("JWT_ACCESS_SECRET"), expiresIn: accessTtl },
      ),
      // jti: two rotations inside the same second must still produce different tokens (and hashes).
      this.jwt.signAsync(
        { sub: user.id, sid, jti: randomUUID() },
        { secret: this.config.get<string>("JWT_REFRESH_SECRET"), expiresIn: refreshTtl },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  private expiryOf(refreshToken: string): Date {
    const { exp } = this.jwt.decode<{ exp: number }>(refreshToken);
    return new Date(exp * 1000);
  }

  private ttlSeconds(expiresAt: Date): number {
    return Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
  }
}
