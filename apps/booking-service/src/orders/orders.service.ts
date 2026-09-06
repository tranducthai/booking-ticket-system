import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, OrderStatus } from "../generated/prisma";
import { Role } from "../auth/role";
import { EventServiceClient } from "../event-client/event-service.client";
import { PrismaService } from "../prisma/prisma.service";
import { ApplyDiscountDto } from "./dto/apply-discount.dto";
import { GetOrderStatsDto } from "./dto/get-order-stats.dto";
import { ListOrdersDto } from "./dto/list-orders.dto";
import { HoldsReleaseService } from "./holds-release.service";

const PAID_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.TICKET_ISSUED];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventClient: EventServiceClient,
    private readonly holdsRelease: HoldsReleaseService,
  ) {}

  async findOwned(orderId: string, userId: string) {
    const order = await this.getOwnedOrder(orderId, userId);
    return order;
  }

  /** Customer's own orders, paginated (docs/spec/08-api-contracts.md §3). */
  async listMine(userId: string, query: ListOrdersDto) {
    return this.paginate({ userId }, query);
  }

  /** Organizer/admin dashboard view — filterable by event/status, not scoped to one user. */
  async listForDashboard(query: ListOrdersDto) {
    const where: { eventId?: string; status?: OrderStatus } = {};
    if (query.eventId) where.eventId = query.eventId;
    if (query.status) where.status = query.status;
    return this.paginate(where, query);
  }

  async applyDiscount(orderId: string, userId: string, dto: ApplyDiscountDto) {
    const order = await this.getOwnedOrder(orderId, userId);
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException("Discount codes can only be applied before payment");
    }

    const result = await this.eventClient.validateDiscountCode(order.eventId, dto.code);
    if (!result.valid) {
      throw new BadRequestException(result.reason);
    }

    const subtotal = Number(order.subtotal);
    const rawDiscount = result.discountType === "PERCENT" ? subtotal * (result.value / 100) : result.value;
    const discountAmount = Math.min(rawDiscount, subtotal);
    const totalAmount = subtotal - discountAmount;

    return this.prisma.order.update({
      where: { id: orderId },
      data: { discountCode: dto.code, discountAmount, totalAmount },
      include: { items: true },
    });
  }

  /**
   * Called by Payment Service (via its internal BookingServiceClient) the
   * moment a payment attempt actually starts — docs/spec/12-resilience-and-failure-design.md
   * "hold extension on payment start". Flags the order so the sweeper skips
   * it even past expiresAt, and extends every seat item's Redis TTL once
   * (event-service's SeatLockService.extend is itself idempotent to call,
   * but this is only invoked from the one place a payment is created, so
   * it naturally happens at most once per attempt).
   */
  async startPayment(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    if (order.userId !== userId) {
      throw new ForbiddenException("You do not own this order");
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException(`Order is ${order.status}, not payable`);
    }

    await this.prisma.order.update({ where: { id: order.id }, data: { paymentInProgress: true } });

    for (const item of order.items) {
      if (item.seatId) {
        await this.eventClient.extendHold(item.seatId, order.id, order.userId).catch(() => undefined);
        // Best-effort — if the hold already expired, the payment itself
        // will fail fast at confirmSeat time (HoldLostError -> auto-refund)
        // rather than needing to be caught here.
      }
    }

    return { ok: true };
  }

  /**
   * Customer-initiated cancel before payment. Releases synchronously (rather
   * than via the OrderCanceled broker event, which is reserved for the
   * post-payment/refund path — see sagas/refund-events.consumer.ts) because
   * nothing downstream has any state yet: no Ticket exists, and the seat map
   * should flip back to Available immediately for anyone watching it.
   */
  async cancel(orderId: string, userId: string) {
    const order = await this.getOwnedOrder(orderId, userId);
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException("Only a pending order can be canceled this way");
    }

    await this.holdsRelease.releaseOnce(order);

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELED },
      include: { items: true },
    });
  }

  private async getOwnedOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    if (order.userId !== userId) {
      throw new ForbiddenException("You do not own this order");
    }
    return order;
  }

  /**
   * docs/spec/01-business-analysis.md §3.2 "Track ticket sales in real time
   * (dashboard)" — organizer-scoped revenue for one of their own events.
   * Ownership is checked here (not left to the frontend) by asking Event
   * Service who owns `eventId`, the same cross-service pattern
   * applyDiscount() above already uses.
   */
  async getEventStats(eventId: string, actor: { userId: string; role: Role }, query: GetOrderStatsDto) {
    const event = await this.eventClient.getEvent(eventId);
    if (actor.role !== Role.ADMIN && event.organizerId !== actor.userId) {
      throw new ForbiddenException("You do not own this event");
    }
    const stats = await this.computeStats({ eventId }, eventId, query.days ?? 30);
    return { eventId, eventTitle: event.title, ...stats };
  }

  /** §3.3 "View system-wide reports & statistics" — admin-only, enforced in the controller (no eventId scope to check ownership against here). */
  async getSystemStats(query: GetOrderStatsDto) {
    const days = query.days ?? 30;
    const [stats, topEvents] = await Promise.all([
      this.computeStats({}, undefined, days),
      this.topEventsByRevenue(days),
    ]);
    return { ...stats, topEvents };
  }

  private async computeStats(where: Prisma.OrderWhereInput, eventId: string | undefined, days: number) {
    const paidWhere: Prisma.OrderWhereInput = { ...where, status: { in: PAID_STATUSES } };
    const [revenueAgg, statusGroups, ticketsAgg, dailyRevenue] = await Promise.all([
      this.prisma.order.aggregate({ where: paidWhere, _sum: { totalAmount: true } }),
      this.prisma.order.groupBy({ by: ["status"], where, _count: { _all: true } }),
      this.prisma.orderItem.aggregate({ where: { order: paidWhere }, _sum: { quantity: true } }),
      this.dailyRevenue(eventId, days),
    ]);

    const byStatus = Object.fromEntries(Object.values(OrderStatus).map((s) => [s, 0])) as Record<OrderStatus, number>;
    for (const g of statusGroups) byStatus[g.status] = g._count._all;

    return {
      totalRevenue: Number(revenueAgg._sum.totalAmount ?? 0),
      totalOrders: byStatus[OrderStatus.PAID] + byStatus[OrderStatus.TICKET_ISSUED],
      totalTicketsSold: ticketsAgg._sum.quantity ?? 0,
      byStatus,
      dailyRevenue,
    };
  }

  /** Prisma has no date_trunc — raw SQL is the only way to bucket by day without pulling every row into Node. */
  private async dailyRevenue(eventId: string | undefined, days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = eventId
      ? await this.prisma.$queryRaw<Array<{ day: Date; revenue: Prisma.Decimal; orders: number }>>`
          SELECT date_trunc('day', "createdAt") AS day, COALESCE(SUM("totalAmount"), 0) AS revenue, COUNT(*)::int AS orders
          FROM "Order"
          WHERE status IN ('PAID', 'TICKET_ISSUED') AND "createdAt" >= ${since} AND "eventId" = ${eventId}
          GROUP BY day ORDER BY day ASC
        `
      : await this.prisma.$queryRaw<Array<{ day: Date; revenue: Prisma.Decimal; orders: number }>>`
          SELECT date_trunc('day', "createdAt") AS day, COALESCE(SUM("totalAmount"), 0) AS revenue, COUNT(*)::int AS orders
          FROM "Order"
          WHERE status IN ('PAID', 'TICKET_ISSUED') AND "createdAt" >= ${since}
          GROUP BY day ORDER BY day ASC
        `;
    return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), revenue: Number(r.revenue), orders: r.orders }));
  }

  /** Admin-only "trending events" proxy — top 5 by revenue in the window. */
  private async topEventsByRevenue(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<Array<{ eventId: string; revenue: Prisma.Decimal; orders: number }>>`
      SELECT "eventId", COALESCE(SUM("totalAmount"), 0) AS revenue, COUNT(*)::int AS orders
      FROM "Order"
      WHERE status IN ('PAID', 'TICKET_ISSUED') AND "createdAt" >= ${since}
      GROUP BY "eventId" ORDER BY revenue DESC LIMIT 5
    `;
    return rows.map((r) => ({ eventId: r.eventId, revenue: Number(r.revenue), orders: r.orders }));
  }

  private async paginate(where: { userId?: string; eventId?: string; status?: OrderStatus }, query: ListOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { data, page, limit, total };
  }
}
