import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { EventServiceClient } from "../event-client/event-service.client";
import { PrismaService } from "../prisma/prisma.service";
import { HoldCartDto } from "./dto/hold-cart.dto";

type Acquired = { kind: "ticketType"; ticketTypeId: string; quantity: number };

/**
 * POST /cart/hold (docs/spec/08-api-contracts.md §3) — the write-path entry
 * point of the whole booking Saga (docs/spec/03-system-design.md, step 1).
 * Seat items are acquired in ONE atomic batch call (event-service's
 * SeatLockService.tryAcquireAll — docs/spec/12-resilience-and-failure-design.md
 * "atomic multi-seat hold"): all-or-nothing, no partial-hold rollback
 * needed for seats specifically. GA ticket-type items still go through the
 * sequential reserve-with-rollback path below since each is an independent
 * Postgres atomic UPDATE, not a Redis lock.
 */
@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);
  private readonly holdTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventClient: EventServiceClient,
    config: ConfigService,
  ) {
    this.holdTtlSeconds = Number(config.get<string>("HOLD_TTL_SECONDS") ?? 600);
  }

  async holdCart(userId: string, dto: HoldCartDto) {
    const seatIds: string[] = [];
    const ticketTypeItems: Array<{ ticketTypeId: string; quantity: number }> = [];
    for (const item of dto.items) {
      if (item.seatId && item.ticketTypeId) {
        throw new BadRequestException("An item can't have both seatId and ticketTypeId");
      }
      if (item.seatId) seatIds.push(item.seatId);
      else if (item.ticketTypeId) ticketTypeItems.push({ ticketTypeId: item.ticketTypeId, quantity: item.quantity ?? 1 });
      else throw new BadRequestException("Each item needs either seatId or ticketTypeId");
    }

    const orderId = randomUUID();
    const itemsData: { ticketTypeId?: string; seatId?: string; price: number; quantity: number }[] = [];
    let subtotal = 0;
    const acquiredTicketTypes: Acquired[] = [];

    try {
      // Seats first, as one atomic batch — if any seat in the batch is
      // unavailable this throws immediately, before any GA reservation
      // (which would otherwise need its own rollback) is ever attempted.
      if (seatIds.length > 0) {
        const held = await this.eventClient.holdSeatsBatch(seatIds, orderId, userId);
        for (const h of held) {
          itemsData.push({ seatId: h.seatId, price: h.price, quantity: 1 });
          subtotal += h.price;
        }
      }

      for (const { ticketTypeId, quantity } of ticketTypeItems) {
        const reserved = await this.eventClient.reserveTicketType(ticketTypeId, quantity);
        acquiredTicketTypes.push({ kind: "ticketType", ticketTypeId, quantity });
        itemsData.push({ ticketTypeId, price: reserved.price, quantity });
        subtotal += reserved.price * quantity;
      }
    } catch (err) {
      await this.rollback(orderId, userId, seatIds, acquiredTicketTypes);
      throw err;
    }

    return this.prisma.order.create({
      data: {
        id: orderId,
        userId,
        eventId: dto.eventId,
        subtotal,
        totalAmount: subtotal,
        expiresAt: new Date(Date.now() + this.holdTtlSeconds * 1000),
        items: { create: itemsData },
      },
      include: { items: true },
    });
  }

  /**
   * Best-effort compensating release. Seats: only released if the batch
   * hold itself succeeded before a later GA reservation failed (releasing
   * seats that were never actually acquired is a harmless no-op on
   * event-service's side — releaseIfOwner just finds nothing to release).
   * StaleHoldSweeper (event-service, Phase 8c) reconciles anything missed.
   */
  private async rollback(orderId: string, userId: string, seatIds: string[], ticketTypes: Acquired[]): Promise<void> {
    for (const seatId of seatIds) {
      try {
        await this.eventClient.releaseSeat(seatId, orderId, userId);
      } catch (err) {
        this.logger.error(`Rollback release failed for seat ${seatId}: ${(err as Error).message}`);
      }
    }
    for (const a of ticketTypes) {
      try {
        await this.eventClient.releaseTicketType(a.ticketTypeId, a.quantity);
      } catch (err) {
        this.logger.error(`Rollback release failed for ${JSON.stringify(a)}: ${(err as Error).message}`);
      }
    }
  }
}
