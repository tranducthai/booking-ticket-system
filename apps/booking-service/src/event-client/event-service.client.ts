import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Service-to-service HTTP client for Event Service's /internal/* endpoints
 * (docs/spec/08-api-contracts.md §2) plus the public discount-code validator.
 * Uses Node's built-in fetch (Node 20+) rather than axios — axios is the
 * frontend's choice (docs/spec/05-project-structure-and-tech-stack.md §2),
 * backend service-to-service calls don't need it.
 */
@Injectable()
export class EventServiceClient {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("EVENT_SERVICE_URL") ?? "http://localhost:3002";
  }

  async holdSeat(seatId: string, orderId: string): Promise<{ expiresAt: string; price: number }> {
    return this.post(`/internal/seats/${seatId}/hold`, { orderId });
  }

  async releaseSeat(seatId: string): Promise<void> {
    await this.post(`/internal/seats/${seatId}/release`, {});
  }

  async confirmSeat(seatId: string): Promise<void> {
    await this.post(`/internal/seats/${seatId}/confirm`, {});
  }

  async reserveTicketType(ticketTypeId: string, quantity: number): Promise<{ price: number }> {
    return this.post(`/internal/ticket-types/${ticketTypeId}/reserve`, { quantity });
  }

  async releaseTicketType(ticketTypeId: string, quantity: number): Promise<void> {
    await this.post(`/internal/ticket-types/${ticketTypeId}/release`, { quantity });
  }

  async validateDiscountCode(
    eventId: string,
    code: string,
  ): Promise<{ valid: true; discountType: "PERCENT" | "FIXED"; value: number } | { valid: false; reason: string }> {
    const url = new URL(`${this.baseUrl}/discount-codes/validate`);
    url.searchParams.set("eventId", eventId);
    url.searchParams.set("code", code);
    const res = await fetch(url, { method: "GET" });
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
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new BadGatewayException("Event Service is unreachable");
    }
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({ message: res.statusText }))) as { message?: string };
      throw new BadGatewayException(errBody.message ?? `Event Service call to ${path} failed`);
    }
    return res.json() as Promise<T>;
  }
}
