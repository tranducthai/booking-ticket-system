import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SeatStatus } from "../generated/prisma";
import { userEventHoldsKey } from "../common/redis-keys";
import { MetricsService } from "../metrics/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { SeatMapGateway } from "../seat-map/seat-map.gateway";
import { SeatLockService } from "./seat-lock.service";

const SEAT_INCLUDE = { zone: { include: { seatMap: true } } } as const;

/**
 * Exact message booking-service's PaymentSucceeded consumer pattern-matches
 * on to tell "hold lost, needs a compensating refund" apart from any other
 * ConflictException — a custom Error subclass wouldn't survive the HTTP
 * hop between the two services, but this string does.
 */
export const HOLD_LOST_MESSAGE = "HOLD_LOST";

@Injectable()
export class HoldsService {
  private readonly logger = new Logger(HoldsService.name);
  private readonly holdTtlSeconds: number;
  private readonly maxSeatsPerUserPerEvent: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seatLock: SeatLockService,
    private readonly seatMapGateway: SeatMapGateway,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    config: ConfigService,
  ) {
    this.holdTtlSeconds = Number(config.get<string>("SEAT_HOLD_TTL_SECONDS") ?? 600);
    this.maxSeatsPerUserPerEvent = Number(config.get<string>("MAX_SEATS_PER_USER_PER_EVENT") ?? 8);
  }

  async holdSeat(seatId: string, orderId: string, userId: string) {
    const [result] = await this.holdSeatsBatch([seatId], orderId, userId);
    return result;
  }

  /**
   * Atomic multi-seat hold (docs/spec/12-resilience-and-failure-design.md
   * "atomic multi-seat hold") — validates every seat, enforces the
   * per-user-per-event cap, then acquires ALL Redis locks in one Lua call
   * (seat-lock.service.ts ACQUIRE_ALL_OR_NOTHING) so a request for N seats
   * either holds all N or none, never a partial set left for the sweeper
   * to clean up.
   */
  async holdSeatsBatch(seatIds: string[], orderId: string, userId: string) {
    const seats = await this.prisma.seat.findMany({ where: { id: { in: seatIds } }, include: SEAT_INCLUDE });
    if (seats.length !== seatIds.length) {
      throw new NotFoundException("One or more seats not found");
    }
    const eventId = seats[0].zone.seatMap.eventId;
    if (seats.some((s) => s.zone.seatMap.eventId !== eventId)) {
      throw new BadRequestException("All seats in one hold request must belong to the same event");
    }
    const blocked = seats.find((s) => s.status === SeatStatus.BLOCKED);
    if (blocked) throw new BadRequestException(`Seat ${blocked.id} is blocked`);
    const booked = seats.find((s) => s.status === SeatStatus.BOOKED);
    if (booked) {
      this.metrics.seatHoldConflictsTotal.inc();
      throw new ConflictException(`Seat ${booked.id} is already booked`);
    }

    const capKey = userEventHoldsKey(userId, eventId);
    const currentCount = await this.redis.scard(capKey);
    if (currentCount + seatIds.length > this.maxSeatsPerUserPerEvent) {
      throw new BadRequestException(
        `Limit is ${this.maxSeatsPerUserPerEvent} seats per user for this event (you already hold ${currentCount})`,
      );
    }

    const acquired = await this.seatLock.tryAcquireAll(seatIds, orderId, this.holdTtlSeconds);
    if (!acquired) {
      this.metrics.seatHoldConflictsTotal.inc();
      throw new ConflictException("One or more of these seats was just taken by someone else");
    }

    await this.prisma.seat.updateMany({ where: { id: { in: seatIds } }, data: { status: SeatStatus.HELD } });
    if (seatIds.length > 0) {
      await this.redis.sadd(capKey, ...seatIds);
    }

    for (const seat of seats) this.broadcast(eventId, seat.id, SeatStatus.HELD);

    // price is each zone's price at hold time — Booking Service snapshots it
    // onto OrderItem.price right here so it never has to re-read it later
    // (docs/spec/07-database-schema.md §3 "never re-read from event-service").
    return seats.map((seat) => ({
      seatId: seat.id,
      holdTtlSeconds: this.holdTtlSeconds,
      expiresAt: new Date(Date.now() + this.holdTtlSeconds * 1000),
      price: Number(seat.zone.price),
    }));
  }

  /** docs/spec/12-resilience-and-failure-design.md "hold extension on payment start" — capped at one call by the caller tracking PAYMENT_IN_PROGRESS. */
  async extendHold(seatId: string, orderId: string, _userId: string) {
    const extended = await this.seatLock.extend(seatId, orderId, this.holdTtlSeconds);
    if (!extended) {
      throw new ConflictException("Hold not found or not owned by this order — it may have already expired");
    }
    return { seatId, holdTtlSeconds: this.holdTtlSeconds, expiresAt: new Date(Date.now() + this.holdTtlSeconds * 1000) };
  }

  async releaseSeat(seatId: string, orderId: string, userId: string) {
    const seat = await this.prisma.seat.findUnique({ where: { id: seatId }, include: SEAT_INCLUDE });
    if (!seat) {
      throw new NotFoundException("Seat not found");
    }

    // Two different callers, two different meanings of "release":
    //  - seat currently BOOKED: the post-refund fan-out (OrderCanceled
    //    consumer) releasing a CONFIRMED seat. There's no Redis hold left
    //    to check ownership of — confirmSeat already deleted it — so
    //    there's nothing to verify here beyond "this seat is booked";
    //    Booking Service was already trusted once, at confirm time.
    //  - seat currently HELD (or already AVAILABLE): the pre-payment path
    //    (cart rollback / PaymentFailed / sweeper) releasing an ACTIVE
    //    hold — ownership-checked via Redis so order A can never release
    //    order B's in-progress hold.
    if (seat.status !== SeatStatus.BOOKED) {
      const released = await this.seatLock.releaseIfOwner(seatId, orderId);
      if (!released) {
        // Already released/expired, or owned by a different order — either
        // way this order has nothing to release. Not an error: release is
        // meant to be safely callable more than once (sweeper + explicit
        // cancel can race).
        this.logger.log(`releaseSeat(${seatId}, ${orderId}): no owned hold to release`);
        return { seatId, status: seat.status };
      }
    }

    await this.redis.srem(userEventHoldsKey(userId, seat.zone.seatMap.eventId), seatId);

    const updated = await this.prisma.seat.update({ where: { id: seatId }, data: { status: SeatStatus.AVAILABLE } });
    this.broadcast(seat.zone.seatMap.eventId, seatId, updated.status);
    return { seatId, status: updated.status };
  }

  /**
   * Ownership-checked confirm. If the Redis hold was already lost (TTL
   * expired mid-checkout and someone else grabbed the seat, or Redis
   * itself hiccuped) this does NOT overwrite whoever holds it now with
   * BOOKED — it throws HoldLostError, which booking-service's
   * PaymentSucceeded handler catches to trigger a compensating auto-refund
   * instead of silently overselling (docs/spec/12-resilience-and-failure-design.md
   * "on a lost hold at confirm, fire a compensating auto-refund").
   */
  async confirmSeat(seatId: string, orderId: string, userId: string) {
    const seat = await this.prisma.seat.findUnique({ where: { id: seatId }, include: SEAT_INCLUDE });
    if (!seat) {
      throw new NotFoundException("Seat not found");
    }
    // Defense-in-depth (docs/spec/12-resilience-and-failure-design.md
    // "oversell counter (== 0)") — the Lua ownership check below is what
    // actually prevents this, so reaching here with an already-BOOKED seat
    // should be unreachable; if it ever isn't, this is the metric that
    // says so instead of silently re-confirming a double-sold seat.
    if (seat.status === SeatStatus.BOOKED) {
      this.metrics.oversellTotal.inc();
      this.logger.error(`OVERSELL DETECTED: seat ${seatId} already BOOKED when confirmSeat(${orderId}) ran`);
      throw new ConflictException("This seat was already booked — please report this, it should never happen");
    }

    const released = await this.seatLock.releaseIfOwner(seatId, orderId);
    if (!released) {
      this.logger.error(`confirmSeat(${seatId}, ${orderId}): hold already lost — refusing to overwrite current holder`);
      throw new ConflictException(HOLD_LOST_MESSAGE);
    }

    await this.redis.srem(userEventHoldsKey(userId, seat.zone.seatMap.eventId), seatId);

    const updated = await this.prisma.seat.update({ where: { id: seatId }, data: { status: SeatStatus.BOOKED } });
    this.broadcast(seat.zone.seatMap.eventId, seatId, updated.status);
    return { seatId, status: updated.status };
  }

  /**
   * General Admission has no individual seat to lock, so instead of a Redis
   * TTL hold it uses an atomic conditional UPDATE — Postgres only commits the
   * increment if it doesn't exceed quantityTotal, which is what actually
   * prevents overselling under concurrent requests. The temporary "hold
   * window" for GA lives at the Order level (Order.expiresAt in
   * booking-service) — its expired-hold sweep (roadmap Phase 4) calls
   * releaseTicketType() the same way a seat release would fire here.
   */
  async reserveTicketType(ticketTypeId: string, quantity: number) {
    // Read the price separately from the atomic reserve below — price isn't
    // mutated by this flow (only quantitySold is), so there's no race here.
    const ticketType = await this.prisma.ticketType.findUnique({
      where: { id: ticketTypeId },
      select: { price: true },
    });
    if (!ticketType) {
      throw new NotFoundException("Ticket type not found");
    }

    const affected = await this.prisma.$executeRaw`
      UPDATE "TicketType"
      SET "quantitySold" = "quantitySold" + ${quantity}
      WHERE id = ${ticketTypeId} AND "quantitySold" + ${quantity} <= "quantityTotal"
    `;
    if (affected === 0) {
      throw new ConflictException("Not enough tickets remaining");
    }
    return { ticketTypeId, reserved: quantity, price: Number(ticketType.price) };
  }

  /**
   * Idempotency for THIS side of a release is enforced by the caller
   * (booking-service's Order.holdReleased flag — see
   * docs/spec/12-resilience-and-failure-design.md "make releaseTicketType
   * idempotent, track reservationReleased on the order"): booking-service
   * only ever calls this once per order via a guarded UPDATE, so a
   * redelivered PaymentFailed/OrderCanceled event can't double-decrement
   * quantitySold here. GREATEST(...,0) below is still kept as a second,
   * cheaper line of defense.
   */
  async releaseTicketType(ticketTypeId: string, quantity: number) {
    await this.prisma.$executeRaw`
      UPDATE "TicketType"
      SET "quantitySold" = GREATEST("quantitySold" - ${quantity}, 0)
      WHERE id = ${ticketTypeId}
    `;
    return { ticketTypeId, released: quantity };
  }

  private broadcast(eventId: string, seatId: string, status: SeatStatus) {
    this.seatMapGateway.broadcastSeatUpdate(eventId, { id: seatId, status });
  }
}
