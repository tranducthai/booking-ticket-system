import { BadGatewayException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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
 */
@Injectable()
export class BookingServiceClient {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("BOOKING_SERVICE_URL") ?? "http://localhost:3003";
  }

  async getOrder(orderId: string, userId: string, role: string): Promise<OrderView> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/orders/${orderId}`, {
        headers: { "x-user-id": userId, "x-user-role": role },
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
      res = await fetch(url, { headers: { "x-user-id": userId, "x-user-role": role } });
    } catch {
      throw new BadGatewayException("Booking Service is unreachable");
    }
    if (!res.ok) throw new BadGatewayException("Booking Service is unavailable");
    const body = (await res.json()) as { data: Array<{ id: string }> };
    return body.data.map((o) => o.id);
  }
}
