import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { vnd } from "../activity-log/format";
import { EventServiceClient } from "../event-client/event-service.client";
import { OrderKind, OrderStatus } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { OrderFulfillmentService } from "./order-fulfillment.service";

/**
 * Buying an artist's membership card ("Thẻ thành viên"): an Order of kind
 * MEMBERSHIP, paid through the same payment-service checkout as tickets.
 * A free plan is fulfilled on the spot. Buying while a card still runs is a
 * renewal — event-service chains the new card after the current one.
 */
@Injectable()
export class MembershipOrdersService {
  private readonly holdTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly eventClient: EventServiceClient,
    private readonly fulfillment: OrderFulfillmentService,
    config: ConfigService,
  ) {
    this.holdTtlSeconds = Number(config.get<string>("HOLD_TTL_SECONDS") ?? 600);
  }

  async checkout(userId: string, planId: string) {
    const plan = await this.eventClient.membershipPlan(planId, userId);
    if (!plan.isActive) throw new BadRequestException("Thẻ thành viên này đang tạm ngừng đăng ký");

    // A second click (or a second tab) lands on the same unpaid order.
    const pending = await this.prisma.order.findFirst({
      where: { userId, kind: OrderKind.MEMBERSHIP, membershipPlanId: planId, status: OrderStatus.PENDING_PAYMENT, expiresAt: { gt: new Date() } },
      include: { items: true },
    });
    if (pending) return pending;

    const order = await this.prisma.order.create({
      data: {
        userId,
        kind: OrderKind.MEMBERSHIP,
        membershipPlanId: plan.id,
        itemLabel: `${plan.name} — ${plan.artistName}`,
        subtotal: plan.price,
        totalAmount: plan.price,
        expiresAt: new Date(Date.now() + this.holdTtlSeconds * 1000),
        holdReleased: true, // nothing is held for a membership
      },
      include: { items: true },
    });
    await this.activity.record({
      action: "order.created",
      targetType: "order",
      targetId: order.id,
      subjectUserId: userId,
      summary: `${plan.activeUntil ? "Gia hạn" : "Đăng ký"} ${order.itemLabel}, ${plan.price === 0 ? "miễn phí" : vnd(plan.price)} (đơn #${order.id.slice(0, 8)})`,
    });

    if (plan.price > 0) return order;
    await this.prisma.order.update({ where: { id: order.id }, data: { paymentInProgress: true } });
    try {
      await this.fulfillment.markPaid(order, { method: "free", free: true });
    } catch (err) {
      await this.prisma.order.update({ where: { id: order.id }, data: { paymentInProgress: false } });
      throw err;
    }
    return this.prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
  }
}
