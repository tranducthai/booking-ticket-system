import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SeatStatus } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { SeatMapGateway } from "../seat-map/seat-map.gateway";
import { SeatLockService } from "./seat-lock.service";

const SEAT_INCLUDE = { zone: { include: { seatMap: true } } } as const;

@Injectable()
export class HoldsService {
  private readonly holdTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seatLock: SeatLockService,
    private readonly seatMapGateway: SeatMapGateway,
    config: ConfigService,
  ) {
    this.holdTtlSeconds = Number(config.get<string>("SEAT_HOLD_TTL_SECONDS") ?? 600);
  }

  async holdSeat(seatId: string, orderId: string) {
    const seat = await this.prisma.seat.findUnique({ where: { id: seatId }, include: SEAT_INCLUDE });
    if (!seat) {
      throw new NotFoundException("Seat not found");
    }
    if (seat.status === SeatStatus.BLOCKED) {
      throw new BadRequestException("Seat is blocked");
    }
    if (seat.status === SeatStatus.BOOKED) {
      throw new ConflictException("Seat is already booked");
    }

    // The atomic acquire is the actual race-condition guard — two concurrent
    // holds on the same seat race here, and exactly one SET ... NX wins.
    const acquired = await this.seatLock.tryAcquire(seatId, orderId, this.holdTtlSeconds);
    if (!acquired) {
      throw new ConflictException("Seat was just taken by someone else");
    }

    const updated = await this.prisma.seat.update({ where: { id: seatId }, data: { status: SeatStatus.HELD } });
    this.broadcast(seat.zone.seatMap.eventId, seatId, updated.status);
    // price is the zone's price at hold time — Booking Service snapshots it onto
    // OrderItem.price right here so it never has to re-read it later (see
    // docs/spec/07-database-schema.md §3 "never re-read from event-service").
    return {
      seatId,
      holdTtlSeconds: this.holdTtlSeconds,
      expiresAt: new Date(Date.now() + this.holdTtlSeconds * 1000),
      price: Number(seat.zone.price),
    };
  }

  async releaseSeat(seatId: string) {
    const seat = await this.prisma.seat.findUnique({ where: { id: seatId }, include: SEAT_INCLUDE });
    if (!seat) {
      throw new NotFoundException("Seat not found");
    }

    await this.seatLock.release(seatId);
    const updated = await this.prisma.seat.update({ where: { id: seatId }, data: { status: SeatStatus.AVAILABLE } });
    this.broadcast(seat.zone.seatMap.eventId, seatId, updated.status);
    return { seatId, status: updated.status };
  }

  async confirmSeat(seatId: string) {
    const seat = await this.prisma.seat.findUnique({ where: { id: seatId }, include: SEAT_INCLUDE });
    if (!seat) {
      throw new NotFoundException("Seat not found");
    }

    await this.seatLock.release(seatId); // permanently booked now — the TTL lock has done its job
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
