import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import CircuitBreaker from "opossum";

/** Preserves the upstream HTTP status so callers can distinguish "Event Service rejected this" (4xx, expected sometimes) from "Event Service is broken" (5xx/network). Named httpStatus, not status — HttpException already owns `status` internally. */
export class UpstreamHttpError extends BadGatewayException {
  constructor(
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

/** Matches event-service's HOLD_LOST_MESSAGE (holds/holds.service.ts) — see confirmSeat below. */
const HOLD_LOST_MESSAGE = "HOLD_LOST";

/**
 * Service-to-service HTTP client for Event Service's /internal/* endpoints
 * (docs/spec/08-api-contracts.md §2) plus the public discount-code validator.
 * Uses Node's built-in fetch (Node 20+) rather than axios — axios is the
 * frontend's choice (docs/spec/05-project-structure-and-tech-stack.md §2),
 * backend service-to-service calls don't need it.
 *
 * Every call goes through an opossum circuit breaker
 * (docs/spec/12-resilience-and-failure-design.md "circuit breaker around
 * ... gateway->each service") — if Event Service is down/slow, this trips
 * open after a run of failures and fails fast (ServiceUnavailableException)
 * instead of piling up hung requests against a dead dependency. 4xx
 * responses (seat already taken, hold lost, validation errors) don't count
 * toward the trip threshold — those are expected under contention, not a
 * sign the dependency itself is unhealthy.
 */
@Injectable()
export class EventServiceClient {
  private readonly logger = new Logger(EventServiceClient.name);
  private readonly baseUrl: string;
  private readonly internalToken?: string;
  private readonly breaker: CircuitBreaker<[string, unknown], unknown>;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("EVENT_SERVICE_URL") ?? "http://localhost:3002";
    this.internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;

    // Two positional params, not a destructured tuple — opossum's
    // breaker.fire(a, b) below passes them as separate arguments, so the
    // wrapped function's arity has to actually be 2.
    this.breaker = new CircuitBreaker((path: string, body: unknown) => this.rawPost(path, body), {
      timeout: 5000, // a hung Event Service call shouldn't hang the whole checkout request
      errorThresholdPercentage: 50,
      resetTimeout: 15000, // how long to stay open before trying a single probe request
      rollingCountTimeout: 10000,
      volumeThreshold: 5, // don't trip on the first couple of blips
      errorFilter: (err) => err instanceof UpstreamHttpError && err.httpStatus < 500,
    });
    // Deliberately NOT using breaker.fallback() — opossum runs the fallback
    // for EVERY failure (a normal single 404/409 included), not only when
    // the circuit is actually open, so a fallback here would swallow every
    // real error (a lost hold, a sold-out seat...) behind one generic
    // message. post() below checks breaker.opened itself instead, so a
    // short-circuited call gets the friendly message and everything else
    // gets its real error.
    this.breaker.on("open", () => this.logger.warn("Circuit OPEN — Event Service calls failing fast"));
    this.breaker.on("halfOpen", () => this.logger.log("Circuit half-open — probing Event Service"));
    this.breaker.on("close", () => this.logger.log("Circuit closed — Event Service recovered"));
  }

  async holdSeat(seatId: string, orderId: string, userId: string): Promise<{ expiresAt: string; price: number }> {
    return this.post(`/internal/seats/${seatId}/hold`, { orderId, userId });
  }

  async holdSeatsBatch(
    seatIds: string[],
    orderId: string,
    userId: string,
  ): Promise<Array<{ seatId: string; expiresAt: string; price: number }>> {
    return this.post(`/internal/seats/hold-batch`, { seatIds, orderId, userId });
  }

  async extendHold(seatId: string, orderId: string, userId: string): Promise<{ expiresAt: string }> {
    return this.post(`/internal/seats/${seatId}/extend-hold`, { orderId, userId });
  }

  async releaseSeat(seatId: string, orderId: string, userId: string): Promise<void> {
    await this.post(`/internal/seats/${seatId}/release`, { orderId, userId });
  }

  /**
   * Returns `{ holdLost: true }` instead of throwing when the seat's hold
   * was lost before confirmation could land — this is the SPECIFIC failure
   * mode docs/spec/12-resilience-and-failure-design.md's "compensating
   * auto-refund" is for, so the caller (sagas/payment-events.consumer.ts)
   * needs to be able to tell it apart from a transport/infra error, which
   * it should still let propagate as a real exception.
   */
  async confirmSeat(seatId: string, orderId: string, userId: string): Promise<{ holdLost: boolean }> {
    try {
      await this.post(`/internal/seats/${seatId}/confirm`, { orderId, userId });
      return { holdLost: false };
    } catch (err) {
      if (err instanceof UpstreamHttpError && err.httpStatus === 409 && err.message === HOLD_LOST_MESSAGE) {
        return { holdLost: true };
      }
      throw err;
    }
  }

  async reserveTicketType(ticketTypeId: string, quantity: number): Promise<{ price: number }> {
    return this.post(`/internal/ticket-types/${ticketTypeId}/reserve`, { quantity });
  }

  async releaseTicketType(ticketTypeId: string, quantity: number): Promise<void> {
    await this.post(`/internal/ticket-types/${ticketTypeId}/release`, { quantity });
  }

  /** Returns false (never throws for this specific conflict) if the code was exhausted in a race — see payment-events.consumer.ts, this is logged, not fatal. */
  async redeemDiscountCode(eventId: string, code: string): Promise<boolean> {
    try {
      await this.post(`/internal/discount-codes/redeem`, { eventId, code });
      return true;
    } catch (err) {
      if (err instanceof UpstreamHttpError && err.httpStatus === 409) return false;
      throw err;
    }
  }

  async releaseDiscountCode(eventId: string, code: string): Promise<void> {
    await this.post(`/internal/discount-codes/release`, { eventId, code });
  }

  /**
   * Public `GET /events/:id` (event-service's own Redis-cached read) — used
   * by orders.service.ts's stats endpoint purely to check "does this
   * organizer own this event" before handing back revenue numbers. Same
   * posture as validateDiscountCode below: public, read-only, not worth a
   * breaker.
   */
  async getEvent(eventId: string): Promise<{ id: string; organizerId: string; title: string }> {
    const res = await fetch(`${this.baseUrl}/events/${eventId}`, { signal: AbortSignal.timeout(5000) });
    if (res.status === 404) {
      throw new UpstreamHttpError(404, "Event not found");
    }
    if (!res.ok) {
      throw new BadGatewayException("Event Service is unavailable");
    }
    return (await res.json()) as { id: string; organizerId: string; title: string };
  }

  /** Public endpoint — no internal token, not worth putting behind the breaker (read-only, low blast radius). */
  async validateDiscountCode(
    eventId: string,
    code: string,
  ): Promise<{ valid: true; discountType: "PERCENT" | "FIXED"; value: number } | { valid: false; reason: string }> {
    const url = new URL(`${this.baseUrl}/discount-codes/validate`);
    url.searchParams.set("eventId", eventId);
    url.searchParams.set("code", code);
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
    if (res.status === 400 || res.status === 404) {
      const body = (await res.json().catch(() => ({ message: "Invalid discount code" }))) as { message?: string };
      return { valid: false, reason: body.message ?? "Invalid discount code" };
    }
    if (!res.ok) {
      throw new BadGatewayException("Event Service is unavailable");
    }
    const discount = (await res.json()) as { discountType: "PERCENT" | "FIXED"; value: number };
    return { valid: true, discountType: discount.discountType, value: Number(discount.value) };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      return (await this.breaker.fire(path, body)) as T;
    } catch (err) {
      if (this.breaker.opened) {
        throw new ServiceUnavailableException("Event Service is temporarily unavailable");
      }
      throw err; // a real single failure — let the caller see what actually happened
    }
  }

  private async rawPost<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.internalToken ? { "x-internal-token": this.internalToken } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      throw new UpstreamHttpError(502, `Event Service is unreachable: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({ message: res.statusText }))) as { message?: string };
      throw new UpstreamHttpError(res.status, errBody.message ?? `Event Service call to ${path} failed`);
    }
    // Some endpoints (discount-codes' redeem/release) return void, i.e. an
    // empty body — res.json() throws "Unexpected end of JSON input" on
    // that, so read as text first and only parse if there's anything there.
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
