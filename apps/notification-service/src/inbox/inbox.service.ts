import { Injectable } from "@nestjs/common";
import { NotificationType, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsGateway } from "./inbox.gateway";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Structured routing data for the frontend (e.g. { orderId } / { eventId }) — shape varies by type. */
  data?: Prisma.InputJsonValue;
}

/** Persistence + live push for in-app notifications — separate from MailerService (stateless, email-only). One row per (user, event), unlike email which is fire-and-forget. */
@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async create(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({ data: input });
    this.gateway.push(input.userId, notification);
    return notification;
  }

  async list(userId: string, { page = 1, limit = 20 }: { page?: number; limit?: number } = {}) {
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { data, page, limit, total };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(id: string, userId: string): Promise<{ updated: number }> {
    // Scoped by userId too, not just id — a signed-in user can only mark their OWN notifications read.
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
