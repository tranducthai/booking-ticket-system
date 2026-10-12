import { BadGatewayException, ConflictException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * ticket-service's refund lock (docs/spec/13-refund-and-anti-fraud-design.md
 * §2.2). Synchronous HTTP, not an event: a refund request must not exist
 * unless its tickets are already unscannable, and a 409 (ticket already
 * used/canceled) has to reach the customer as the answer to THEIR request.
 */
@Injectable()
export class TicketServiceClient {
  private readonly baseUrl: string;
  private readonly internalToken?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("TICKET_SERVICE_URL") ?? "http://localhost:3005";
    this.internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;
  }

  lock(orderItemIds: string[], refundId: string): Promise<void> {
    return this.post("/internal/tickets/refund-lock", { orderItemIds, refundId });
  }

  unlock(refundId: string): Promise<void> {
    return this.post("/internal/tickets/refund-unlock", { refundId });
  }

  private async post(path: string, body: unknown): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(this.internalToken ? { "x-internal-token": this.internalToken } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new BadGatewayException("Ticket Service is unreachable");
    }
    if (res.status === 409) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new ConflictException(err.message ?? "Vé không ở trạng thái có thể hoàn");
    }
    if (!res.ok) throw new BadGatewayException("Ticket Service is unavailable");
  }
}
