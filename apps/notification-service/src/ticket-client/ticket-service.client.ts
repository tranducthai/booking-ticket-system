import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Talks to ticket-service's internal/tickets routes (internal-tickets.controller.ts) — used only by EventReminderService. */
@Injectable()
export class TicketServiceClient {
  private readonly logger = new Logger(TicketServiceClient.name);
  private readonly baseUrl: string;
  private readonly internalToken?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("TICKET_SERVICE_URL") ?? "http://localhost:3005";
    this.internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;
  }

  async attendeeUserIds(eventId: string): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/internal/tickets/by-event/${eventId}`, {
        headers: this.internalToken ? { "x-internal-token": this.internalToken } : {},
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        this.logger.warn(`Ticket Service returned ${res.status} for event ${eventId}`);
        return [];
      }
      return (await res.json()) as string[];
    } catch (err) {
      this.logger.error(`Ticket Service unreachable (attendeeUserIds): ${(err as Error).message}`);
      return [];
    }
  }
}
