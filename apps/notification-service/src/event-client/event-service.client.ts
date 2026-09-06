import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface EventForReminder {
  id: string;
  title: string;
  startTime: string;
  venueName: string;
}

/** Talks to event-service's internal/events routes (internal-events.controller.ts) — used only by EventReminderService. */
@Injectable()
export class EventServiceClient {
  private readonly logger = new Logger(EventServiceClient.name);
  private readonly baseUrl: string;
  private readonly internalToken?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("EVENT_SERVICE_URL") ?? "http://localhost:3002";
    this.internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;
  }

  async findNeedingReminder(hoursBefore: number, bandHours: number): Promise<EventForReminder[]> {
    try {
      const url = new URL(`${this.baseUrl}/internal/events/needing-reminder`);
      url.searchParams.set("hoursBefore", String(hoursBefore));
      url.searchParams.set("bandHours", String(bandHours));
      const res = await fetch(url, {
        headers: this.internalToken ? { "x-internal-token": this.internalToken } : {},
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        this.logger.warn(`Event Service returned ${res.status} for needing-reminder`);
        return [];
      }
      return (await res.json()) as EventForReminder[];
    } catch (err) {
      this.logger.error(`Event Service unreachable (needing-reminder): ${(err as Error).message}`);
      return [];
    }
  }

  async markReminderSent(eventId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/internal/events/${eventId}/mark-reminder-sent`, {
        method: "POST",
        headers: this.internalToken ? { "x-internal-token": this.internalToken } : {},
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      this.logger.error(`Failed to mark reminder sent for event ${eventId}: ${(err as Error).message}`);
    }
  }
}
