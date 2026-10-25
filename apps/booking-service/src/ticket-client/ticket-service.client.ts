import { BadGatewayException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * ticket-service's resale lock (resale listings). Synchronous on purpose:
 * a listing must not exist unless its ticket is already unscannable and
 * unrefundable, and a 409 (ticket used/refunding) is the seller's answer.
 */
@Injectable()
export class TicketServiceClient {
  private readonly baseUrl: string;
  private readonly internalToken?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("TICKET_SERVICE_URL") ?? "http://localhost:3005";
    this.internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;
  }

  /** Locks the caller's ISSUED ticket; returns the order item / event it belongs to. */
  resaleLock(ticketId: string, userId: string): Promise<{ ticketId: string; orderItemId: string; eventId: string }> {
    return this.post(`/internal/tickets/${ticketId}/resale-lock`, { userId });
  }

  resaleUnlock(ticketId: string): Promise<{ unlocked: number }> {
    return this.post(`/internal/tickets/${ticketId}/resale-unlock`, {});
  }

  /** Voids the seller's ticket once sold — idempotent. */
  resaleTransfer(ticketId: string): Promise<{ transferred: boolean }> {
    return this.post(`/internal/tickets/${ticketId}/resale-transfer`, {});
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
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
    if (res.status === 404 || res.status === 409) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw res.status === 404 ? new NotFoundException(err.message ?? "Không tìm thấy vé") : new ConflictException(err.message ?? "Vé không thể bán lại");
    }
    if (!res.ok) throw new BadGatewayException("Ticket Service is unavailable");
    return (await res.json()) as T;
  }
}
