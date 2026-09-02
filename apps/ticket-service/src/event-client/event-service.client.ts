import { BadGatewayException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Only needed to check "does this organizer own this event" for GET /events/:id/attendees. */
@Injectable()
export class EventServiceClient {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("EVENT_SERVICE_URL") ?? "http://localhost:3002";
  }

  async getOrganizerId(eventId: string): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/events/${eventId}`);
    } catch {
      throw new BadGatewayException("Event Service is unreachable");
    }
    if (res.status === 404) throw new NotFoundException("Event not found");
    if (!res.ok) throw new BadGatewayException("Event Service is unavailable");
    const event = (await res.json()) as { organizerId: string };
    return event.organizerId;
  }
}
