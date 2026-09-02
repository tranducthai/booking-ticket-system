import { BadGatewayException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import CircuitBreaker from "opossum";

export interface OrderView {
  id: string;
  userId: string;
  eventId: string;
  status: string;
  totalAmount: number;
  items: Array<{ id: string; ticketTypeId?: string; seatId?: string; price: number; quantity: number }>;
}

/**
 * Payment Service doesn't own Order — it reads it from Booking Service's own
 * public, already-ownership-checked endpoint (docs/spec/08-api-contracts.md
 * §3 "GET /orders/:id | customer (owner)"), forwarding the caller's own
 * X-User-Id/X-User-Role the same way the Gateway would. This reuses Booking's
 * ownership check instead of duplicating a denormalized userId column on
 * Payment (07-database-schema.md §4 doesn't have one on purpose).
 *
 * getOrder() is behind an opossum circuit breaker
 * (docs/spec/12-resilience-and-failure-design.md) — it's on the hot path
 * of both "create a payment" and "check a payment's status", so a wedged
 * Booking Service shouldn't be able to hang every checkout attempt.
 */
@Injectable()
export class BookingServiceClient {
  private readonly logger = new Logger(BookingServiceClient.name);
  private readonly baseUrl: string;
  private readonly internalToken?: string;
  private readonly getOrderBreaker: CircuitBreaker<[string, string, string], OrderView>;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("BOOKING_SERVICE_URL") ?? "http://localhost:3003";
    this.internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;

    // Three positional params, not a destructured tuple — see the matching
    // note in booking-service's event-service.client.ts.
    this.getOrderBreaker = new CircuitBreaker(
      (orderId: string, userId: string, role: string) => this.rawGetOrder(orderId, userId, role),
      {
        timeout: 5000,
        errorThresholdPercentage: 50,
        resetTimeout: 15000,
        rollingCountTimeout: 10000,
        volumeThreshold: 5,
        errorFilter: (err) => err instanceof NotFoundException || err instanceof ForbiddenException,
      },
    );
    // Deliberately NOT using .fallback() — see the matching note in
    // booking-service's event-service.client.ts: opossum runs it for every
    // failure, not just an open circuit, which would swallow real 404/403s.
    this.getOrderBreaker.on("open", () => this.logger.warn("Circuit OPEN — Booking Service calls failing fast"));
    this.getOrderBreaker.on("close", () => this.logger.log("Circuit closed — Booking Service recovered"));
  }

  async getOrder(orderId: string, userId: string, role: string): Promise<OrderView> {
    try {
      return await this.getOrderBreaker.fire(orderId, userId, role);
    } catch (err) {
      if (this.getOrderBreaker.opened) {
        throw new ServiceUnavailableException("Booking Service is temporarily unavailable");
      }
      throw err;
    }
  }

  private async rawGetOrder(orderId: string, userId: string, role: string): Promise<OrderView> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/orders/${orderId}`, {
        headers: { "x-user-id": userId, "x-user-role": role },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new BadGatewayException("Booking Service is unreachable");
    }
    if (res.status === 404) throw new NotFoundException("Order not found");
    if (res.status === 403) throw new ForbiddenException("You do not own this order");
    if (!res.ok) throw new BadGatewayException("Booking Service is unavailable");
    return res.json() as Promise<OrderView>;
  }

  /** organizer/admin dashboard listing, used to resolve "which orders belong to this event" for refund filtering. */
  async listOrderIdsForEvent(eventId: string, userId: string, role: string): Promise<string[]> {
    let res: Response;
    try {
      const url = new URL(`${this.baseUrl}/orders`);
      url.searchParams.set("eventId", eventId);
      url.searchParams.set("limit", "200");
      res = await fetch(url, { headers: { "x-user-id": userId, "x-user-role": role }, signal: AbortSignal.timeout(5000) });
    } catch {
      throw new BadGatewayException("Booking Service is unreachable");
    }
    if (!res.ok) throw new BadGatewayException("Booking Service is unavailable");
    const body = (await res.json()) as { data: Array<{ id: string }> };
    return body.data.map((o) => o.id);
  }

  /** docs/spec/12-resilience-and-failure-design.md "hold extension on payment start" — see orders.service.ts startPayment() on the receiving end. */
  async startPayment(orderId: string, userId: string): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/internal/orders/${orderId}/start-payment`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.internalToken ? { "x-internal-token": this.internalToken } : {}),
        },
        body: JSON.stringify({ userId }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        this.logger.warn(`startPayment(${orderId}) returned ${res.status} — proceeding anyway, non-fatal`);
      }
    } catch (err) {
      // Best-effort: if this fails, the hold just isn't extended and the
      // normal TTL keeps running — worst case the customer needs to be
      // faster than the un-extended hold window, not a correctness bug.
      this.logger.warn(`startPayment(${orderId}) failed: ${(err as Error).message} — proceeding anyway, non-fatal`);
    }
  }
}
