import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EXCHANGES, PasswordResetRequestedPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { SessionService } from "../sessions/session.service";

const SALT_ROUNDS = 10;
const TOKEN_TTL_MS = 30 * 60_000;
/** One email per account per minute — stops "resend" spam flooding someone's inbox. */
const RESEND_COOLDOWN_MS = 60_000;

export const hashResetToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * "Quên mật khẩu": POST /auth/forgot-password emails a single-use link
 * (via notification-service), POST /auth/reset-password consumes it.
 * forgot-password answers the same whether or not the email exists, so it
 * can't be used to enumerate accounts.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
    private readonly config: ConfigService,
    private readonly activity: ActivityLogService,
    private readonly sessions: SessionService,
  ) {}

  async request(email: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.isLocked) return { ok: true };

    const recent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
    });
    if (recent) return { ok: true };

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });

    const frontendUrl = (this.config.get<string>("FRONTEND_URL") ?? "http://localhost:5173").replace(/\/+$/, "");
    const payload: PasswordResetRequestedPayload = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      resetUrl: `${frontendUrl}/reset-password?token=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
    try {
      await this.rabbit.publish(EXCHANGES.USER, ROUTING_KEYS.PASSWORD_RESET_REQUESTED, payload);
    } catch (err) {
      // Still answer ok (no enumeration) — but drop the token so the cooldown doesn't block a retry.
      this.logger.error(`Could not publish password reset for ${user.id}: ${(err as Error).message}`);
      await this.prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
      return { ok: true };
    }

    await this.activity.record({
      actorId: user.id,
      actorRole: user.role,
      action: "user.password_reset_requested",
      targetType: "user",
      targetId: user.id,
      subjectUserId: user.id,
      summary: "Yêu cầu đặt lại mật khẩu qua email",
    });
    return { ok: true };
  }

  async reset(token: string, newPassword: string): Promise<{ ok: true }> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      include: { user: true },
    });
    if (!row || row.usedAt || row.expiresAt <= new Date() || row.user.isLocked) {
      throw new BadRequestException("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn");
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const now = new Date();
    // Burn this token AND every other outstanding one in the same transaction —
    // a click on an older email must not work after a successful reset.
    await this.prisma.$transaction(async (tx) => {
      const burned = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
      if (burned.count === 0) {
        // Lost a race with a concurrent reset using the same token — roll back, change nothing.
        throw new BadRequestException("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn");
      }
      await tx.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: now } });
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash, passwordChangedAt: now } });
    });
    // Sign out every device — whoever knew the old password is out too.
    await this.sessions.revokeAllForUser(row.userId, "password_reset");

    await this.activity.record({
      actorId: row.userId,
      actorRole: row.user.role,
      action: "user.password_reset",
      targetType: "user",
      targetId: row.userId,
      subjectUserId: row.userId,
      summary: "Đặt lại mật khẩu qua email",
    });
    return { ok: true };
  }
}
