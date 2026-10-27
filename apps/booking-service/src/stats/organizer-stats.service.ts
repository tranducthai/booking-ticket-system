import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma";
import { EventServiceClient } from "../event-client/event-service.client";
import { Role } from "../auth/role";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizerStatsQueryDto } from "./dto/organizer-stats-query.dto";

const TZ = "Asia/Ho_Chi_Minh";
const BUCKETS = { hour: "hour", day: "day", month: "month" } as const;

/**
 * The organizer's statistics page: revenue / orders / buyers / tickets over
 * a time range, for all of the organizer's events or one of them. Only paid
 * ticket orders count (not membership or resale orders: those are money
 * between the customer and the platform, not ticket sales of the organizer).
 * Revenue is net of refunds. Orders are placed in the range by createdAt,
 * bucketed in Vietnam time.
 */
@Injectable()
export class OrganizerStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventClient: EventServiceClient,
  ) {}

  /** An admin sees the whole system (no event scoping unless one is asked for); an organizer only their own events. */
  async stats(actor: { userId: string; role: Role }, q: OrganizerStatsQueryDto) {
    const admin = actor.role === Role.ADMIN;
    let ids: string[] | null;
    if (admin) {
      ids = q.eventId ? [q.eventId] : null;
    } else {
      const mine = await this.eventClient.organizerEventIds(actor.userId);
      if (q.eventId && !mine.includes(q.eventId)) throw new ForbiddenException("Bạn không sở hữu sự kiện này");
      ids = q.eventId ? [q.eventId] : mine;
    }

    const from = q.from ?? new Date(0);
    const to = q.to ?? new Date(Date.now() + 86_400_000);
    if (to.getTime() <= from.getTime()) throw new BadRequestException("Khoảng thời gian không hợp lệ");
    const bucket = BUCKETS[q.bucket ?? "day"];

    if (ids && ids.length === 0) return this.empty(bucket);

    const O = this.prisma.table("Order");
    const I = this.prisma.table("OrderItem");
    const inRange = Prisma.sql`o."kind" <> 'RESALE' AND ${ids ? Prisma.sql`o."eventId" IN (${Prisma.join(ids)})` : Prisma.sql`TRUE`} AND o."createdAt" >= ${from} AND o."createdAt" < ${to}`;
    const paid = Prisma.sql`${inRange} AND o."status" IN ('PAID', 'TICKET_ISSUED')`;
    const bucketSql = Prisma.sql`to_char(date_trunc(${Prisma.raw(`'${bucket}'`)}, o."createdAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD"T"HH24:MI')`;

    const [summary, tickets, statuses, series, ticketSeries, perEvent, perEventTickets, types, repeat] = await Promise.all([
      this.prisma.$queryRaw<Array<{ gross: Prisma.Decimal; refunded: Prisma.Decimal; discounts: Prisma.Decimal; orders: number; buyers: number }>>`
        SELECT COALESCE(SUM(o."totalAmount"), 0) AS gross, COALESCE(SUM(o."refundedAmount"), 0) AS refunded,
               COALESCE(SUM(o."discountAmount" + o."memberDiscountAmount"), 0) AS discounts,
               COUNT(*)::int AS orders, COUNT(DISTINCT o."userId")::int AS buyers
        FROM ${O} o WHERE ${paid}`,
      this.prisma.$queryRaw<Array<{ sold: number; refunded: number }>>`
        SELECT COALESCE(SUM(i."quantity"), 0)::int AS sold,
               COALESCE(SUM(CASE WHEN i."refundedAt" IS NOT NULL THEN i."quantity" ELSE 0 END), 0)::int AS refunded
        FROM ${I} i JOIN ${O} o ON o."id" = i."orderId" WHERE ${paid}`,
      this.prisma.$queryRaw<Array<{ status: string; n: number }>>`
        SELECT o."status"::text AS status, COUNT(*)::int AS n FROM ${O} o WHERE ${inRange} GROUP BY o."status"`,
      this.prisma.$queryRaw<Array<{ bucket: string; revenue: Prisma.Decimal; orders: number }>>`
        SELECT ${bucketSql} AS bucket, COALESCE(SUM(o."totalAmount" - o."refundedAmount"), 0) AS revenue, COUNT(*)::int AS orders
        FROM ${O} o WHERE ${paid} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ bucket: string; tickets: number }>>`
        SELECT ${bucketSql} AS bucket, COALESCE(SUM(i."quantity"), 0)::int AS tickets
        FROM ${I} i JOIN ${O} o ON o."id" = i."orderId" WHERE ${paid} AND i."refundedAt" IS NULL GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ eventId: string; revenue: Prisma.Decimal; orders: number; buyers: number }>>`
        SELECT o."eventId", COALESCE(SUM(o."totalAmount" - o."refundedAmount"), 0) AS revenue, COUNT(*)::int AS orders, COUNT(DISTINCT o."userId")::int AS buyers
        FROM ${O} o WHERE ${paid} GROUP BY o."eventId"`,
      this.prisma.$queryRaw<Array<{ eventId: string; tickets: number }>>`
        SELECT o."eventId", COALESCE(SUM(i."quantity"), 0)::int AS tickets
        FROM ${I} i JOIN ${O} o ON o."id" = i."orderId" WHERE ${paid} AND i."refundedAt" IS NULL GROUP BY o."eventId"`,
      this.prisma.$queryRaw<Array<{ ticketTypeId: string | null; seat: boolean; quantity: number; revenue: Prisma.Decimal }>>`
        SELECT i."ticketTypeId", (i."seatId" IS NOT NULL) AS seat, COALESCE(SUM(i."quantity"), 0)::int AS quantity, COALESCE(SUM(i."price" * i."quantity"), 0) AS revenue
        FROM ${I} i JOIN ${O} o ON o."id" = i."orderId" WHERE ${paid} AND i."refundedAt" IS NULL GROUP BY i."ticketTypeId", (i."seatId" IS NOT NULL)`,
      this.prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n FROM (SELECT o."userId" FROM ${O} o WHERE ${paid} GROUP BY o."userId" HAVING COUNT(*) > 1) r`,
    ]);

    const s = summary[0];
    const gross = Number(s.gross);
    const refunded = Number(s.refunded);
    const statusCounts: Record<string, number> = {};
    for (const r of statuses) statusCounts[r.status] = r.n;
    const allOrders = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const ticketsByBucket = new Map(ticketSeries.map((t) => [t.bucket, t.tickets]));
    const ticketsByEvent = new Map(perEventTickets.map((t) => [t.eventId, t.tickets]));

    return {
      bucket,
      totals: {
        revenue: gross - refunded,
        grossRevenue: gross,
        refundedAmount: refunded,
        discountAmount: Number(s.discounts),
        orders: s.orders,
        buyers: s.buyers,
        repeatBuyers: repeat[0]?.n ?? 0,
        ticketsSold: tickets[0].sold - tickets[0].refunded,
        ticketsRefunded: tickets[0].refunded,
        averageOrderValue: s.orders > 0 ? Math.round((gross - refunded) / s.orders) : 0,
        conversionRate: allOrders > 0 ? Math.round((s.orders / allOrders) * 1000) / 10 : 0,
      },
      series: series.map((r) => ({ bucket: r.bucket, revenue: Number(r.revenue), orders: r.orders, tickets: ticketsByBucket.get(r.bucket) ?? 0 })),
      byEvent: perEvent
        .map((r) => ({ eventId: r.eventId, revenue: Number(r.revenue), orders: r.orders, buyers: r.buyers, tickets: ticketsByEvent.get(r.eventId) ?? 0 }))
        .sort((a, b) => b.revenue - a.revenue),
      byTicketType: types.map((r) => ({ ticketTypeId: r.ticketTypeId, seat: r.seat, quantity: r.quantity, revenue: Number(r.revenue) })).sort((a, b) => b.revenue - a.revenue),
      byStatus: statusCounts,
    };
  }

  private empty(bucket: string) {
    return {
      bucket,
      totals: { revenue: 0, grossRevenue: 0, refundedAmount: 0, discountAmount: 0, orders: 0, buyers: 0, repeatBuyers: 0, ticketsSold: 0, ticketsRefunded: 0, averageOrderValue: 0, conversionRate: 0 },
      series: [],
      byEvent: [],
      byTicketType: [],
      byStatus: {},
    };
  }
}
