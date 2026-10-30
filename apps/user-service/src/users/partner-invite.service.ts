import { BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EXCHANGES, PartnerInvitedPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { InvitePartnerDto } from "./dto/invite-partner.dto";

const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
const INVALID = "Lời mời không hợp lệ hoặc đã hết hạn";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Admin onboards a partner organizer by email: invite() stores a single-use
 * token (hash only) and emails the link via notification-service; the
 * ORGANIZER account is created by accept() — i.e. only once the invitee has
 * set their own password. No password ever passes through the admin.
 */
@Injectable()
export class PartnerInviteService {
  private readonly logger = new Logger(PartnerInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
    private readonly config: ConfigService,
    private readonly activity: ActivityLogService,
  ) {}

  async invite(dto: InvitePartnerDto, adminId: string): Promise<{ ok: true; email: string; expiresAt: string }> {
    if (await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } })) {
      throw new ConflictException("Email này đã được dùng cho một tài khoản khác");
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    // Re-inviting the same email replaces the earlier link — only the newest one works.
    await this.prisma.$transaction([
      this.prisma.partnerInvite.updateMany({ where: { email: dto.email, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.partnerInvite.create({
        data: { email: dto.email, fullName: dto.fullName, phone: dto.phone, tokenHash, expiresAt, createdById: adminId },
      }),
    ]);

    const frontendUrl = (this.config.get<string>("FRONTEND_URL") ?? "http://localhost:5173").replace(/\/+$/, "");
    const payload: PartnerInvitedPayload = {
      email: dto.email,
      fullName: dto.fullName,
      inviteUrl: `${frontendUrl}/accept-invite?token=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
    try {
      await this.rabbit.publish(EXCHANGES.USER, ROUTING_KEYS.PARTNER_INVITED, payload);
    } catch (err) {
      this.logger.error(`Could not publish partner invite for ${dto.email}: ${(err as Error).message}`);
      await this.prisma.partnerInvite.deleteMany({ where: { tokenHash } });
      throw new ServiceUnavailableException("Không gửi được email mời — thử lại sau");
    }

    await this.activity.record({
      actorId: adminId,
      actorRole: "ADMIN",
      action: "user.partner_invited",
      targetType: "user",
      targetId: dto.email,
      summary: `Mời đối tác ${dto.fullName} (${dto.email})`,
    });
    return { ok: true, email: dto.email, expiresAt: expiresAt.toISOString() };
  }

  /** What the "set your password" page shows before the invitee types anything. */
  async preview(token: string): Promise<{ email: string; fullName: string }> {
    const invite = await this.findUsable(token);
    return { email: invite.email, fullName: invite.fullName };
  }

  async accept(token: string, password: string): Promise<{ ok: true; email: string }> {
    const invite = await this.findUsable(token);
    if (await this.prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } })) {
      throw new ConflictException("Email này đã được dùng cho một tài khoản khác");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const burned = await tx.partnerInvite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date() } });
      // Lost a race with another click on the same link — create nothing.
      if (burned.count === 0) throw new BadRequestException(INVALID);
      return tx.user.create({
        data: {
          email: invite.email,
          fullName: invite.fullName,
          phone: invite.phone,
          passwordHash,
          role: "ORGANIZER",
          isOrganizerVerified: true,
          // They proved they own this inbox by opening the emailed link.
          emailVerifiedAt: new Date(),
        },
        select: { id: true, email: true },
      });
    });
    await this.activity.record({
      actorId: user.id,
      actorRole: "ORGANIZER",
      action: "user.partner_activated",
      targetType: "user",
      targetId: user.id,
      subjectUserId: user.id,
      summary: `Đối tác ${invite.fullName} (${invite.email}) kích hoạt tài khoản`,
    });
    return { ok: true, email: user.email };
  }

  private async findUsable(token: string) {
    const invite = await this.prisma.partnerInvite.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invite || invite.usedAt || invite.expiresAt <= new Date()) throw new BadRequestException(INVALID);
    return invite;
  }
}
