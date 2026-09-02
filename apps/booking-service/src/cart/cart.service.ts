import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { EventServiceClient } from "../event-client/event-service.client";
import { PrismaService } from "../prisma/prisma.service";
import { HoldCartDto } from "./dto/hold-cart.dto";

type Acquired = { kind: "seat"; seatId: string } | { kind: "ticketType"; ticketTypeId: string; quantity: number };

/**
 * POST /cart/hold (docs/spec/08-api-contracts.md §3) — the write-path entry
 * point of the whole booking Saga (docs/spec/03-system-design.md, step 1).
 * Acquires every line item's hold from Event Service one at a time; on any
 * failure it compensates by releasing everything already acquired, so a
 * partially-holdable cart never leaves orphaned Redis locks / GA reservations
 * behind (docs/spec/12-resilience-and-failure-design.md "atomic multi-seat
 * hold" — this is the simple sequential-with-rollback version; the Lua-script
 * atomic-acquire upgrade is Phase 8c).
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
    const acquired: Acquired[] = [];
    const itemsData: { ticketTypeId?: string; seatId?: string; price: number; quantity: number }[] = [];
    let subtotal = 0;
    const orderId = randomUUID();

    try {
      for (const item of dto.items) {
        if (item.seatId && item.ticketTypeId) {
          throw new BadRequestException("An item can't have both seatId and ticketTypeId");
        }

        if (item.seatId) {
          const held = await this.eventClient.holdSeat(item.seatId, orderId);
          acquired.push({ kind: "seat", seatId: item.seatId });
          itemsData.push({ seatId: item.seatId, price: held.price, quantity: 1 });
          subtotal += held.price;
        } else if (item.ticketTypeId) {
          const quantity = item.quantity ?? 1;
          const reserved = await this.eventClient.reserveTicketType(item.ticketTypeId, quantity);
          acquired.push({ kind: "ticketType", ticketTypeId: item.ticketTypeId, quantity });
          itemsData.push({ ticketTypeId: item.ticketTypeId, price: reserved.price, quantity });
          subtotal += reserved.price * quantity;
        } else {
          throw new BadRequestException("Each item needs either seatId or ticketTypeId");
        }
      }
    } catch (err) {
      await this.rollback(acquired);
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

  /** Best-effort compensating release — StaleHoldSweeper (event-service, Phase 8c) reconciles anything this misses. */
  private async rollback(acquired: Acquired[]): Promise<void> {
    for (const a of acquired) {
      try {
        if (a.kind === "seat") {
          await this.eventClient.releaseSeat(a.seatId);
        } else {
          await this.eventClient.releaseTicketType(a.ticketTypeId, a.quantity);
        }
      } catch (err) {
        this.logger.error(`Rollback release failed for ${JSON.stringify(a)}: ${(err as Error).message}`);
      }
    }
  }
}
