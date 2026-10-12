import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Talks to ticket-service's internal/tickets routes (internal-tickets.controller.ts) — used by EventReminderService and EventLifecycleConsumer. */
@Injectable()
export class TicketServiceClient {
  private readonly logger = new Logger(TicketServiceClient.name);
  private readonly baseUrl: string;
  private readonly internalToken?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("TICKET_SERVICE_URL") ?? "http://localhost:3005";
    this.internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;
  }

  /** `includeEventCanceled`: also holders whose tickets were voided by the event's own cancellation (EventCanceledConsumer). */
  async attendeeUserIds(eventId: string, includeEventCanceled = false): Promise<string[]> {
    try {
      const query = includeEventCanceled ? "?includeEventCanceled=true" : "";
      const res = await fetch(`${this.baseUrl}/internal/tickets/by-event/${eventId}${query}`, {
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
