import { BadGatewayException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Only needed to check "does this organizer own this event" (attendees, check-in, activity logs). */
@Injectable()
export class EventServiceClient {
  private readonly baseUrl: string;
  private readonly internalToken?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("EVENT_SERVICE_URL") ?? "http://localhost:3002";
    this.internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;
  }

  async getOrganizerId(eventId: string): Promise<string> {
    let res: Response;
    try {
      // Internal read: the public GET /events/:id 404s unpublished events to anyone but their organizer.
      res = await fetch(`${this.baseUrl}/internal/events/${eventId}`, {
        headers: this.internalToken ? { "x-internal-token": this.internalToken } : {},
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new BadGatewayException("Event Service is unreachable");
    }
    if (res.status === 404) throw new NotFoundException("Event not found");
    if (!res.ok) throw new BadGatewayException("Event Service is unavailable");
    const event = (await res.json()) as { organizerId: string };
    return event.organizerId;
  }

  /** Online event's join link — only ever handed to a ticket holder (TicketsService.findOwned). */
  async getOnlineAccess(eventId: string): Promise<{ isOnline: boolean; onlineUrl: string | null }> {
    const res = await fetch(`${this.baseUrl}/internal/events/${eventId}/online-access`, {
      headers: this.internalToken ? { "x-internal-token": this.internalToken } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new BadGatewayException("Event Service is unavailable");
    return (await res.json()) as { isOnline: boolean; onlineUrl: string | null };
  }
}
