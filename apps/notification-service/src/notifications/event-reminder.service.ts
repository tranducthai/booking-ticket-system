import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventForReminder, EventServiceClient } from "../event-client/event-service.client";
import { MailerService } from "../mailer/mailer.service";
import { TicketServiceClient } from "../ticket-client/ticket-service.client";
import { UserServiceClient } from "../user-client/user-service.client";

/**
 * docs/spec/01-business-analysis.md §3.1 "Receive notifications: event
 * reminders" — not implemented before this (notification-service only ever
 * reacted to OrderPaid/TicketIssued broker events). This is deliberately a
 * polling loop, not another broker consumer: there's no event to react to
 * here, just the passage of time relative to Event.startTime, so something
 * has to periodically ask "which events start soon?".
 *
 * One reminder per EVENT, not per ticket/attendee — event-service's
 * Event.reminderSentAt is a one-shot flag set the moment this successfully
 * processes an event (see markReminderSent), so a ticket bought after that
 * point won't get a reminder for it. Simpler and safe against double-sends
 * across ticks; the tradeoff (very-last-minute buyers get no reminder) is
 * fine for what this is.
 *
 * Plain setInterval rather than @nestjs/schedule's @Cron (used elsewhere,
 * e.g. payment-service's ReconciliationService) — this service has no other
 * use for that package, and pulling in a new dependency for one interval
 * timer isn't worth it.
 */
@Injectable()
export class EventReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventReminderService.name);
  private timer?: NodeJS.Timeout;
  private readonly hoursBefore: number;
  private readonly bandHours: number;
  private readonly tickMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly eventClient: EventServiceClient,
    private readonly ticketClient: TicketServiceClient,
    private readonly userClient: UserServiceClient,
    private readonly mailer: MailerService,
  ) {
    this.hoursBefore = Number(this.config.get<string>("EVENT_REMINDER_HOURS_BEFORE") ?? "24");
    this.bandHours = Number(this.config.get<string>("EVENT_REMINDER_BAND_HOURS") ?? "1");
    this.tickMs = Number(this.config.get<string>("EVENT_REMINDER_TICK_MS") ?? String(15 * 60 * 1000));
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.tick().catch((err) => this.logger.error(`Reminder tick failed: ${(err as Error).message}`));
    }, this.tickMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    const events = await this.eventClient.findNeedingReminder(this.hoursBefore, this.bandHours);
    for (const event of events) {
      await this.sendRemindersFor(event);
    }
  }

  private async sendRemindersFor(event: EventForReminder): Promise<void> {
    const userIds = await this.ticketClient.attendeeUserIds(event.id);
    if (userIds.length === 0) {
      // No tickets issued (yet) for an event that's about to start — still
      // mark it done so this doesn't retry forever; a manual reminder isn't
      // this system's job for a near-empty event.
      await this.eventClient.markReminderSent(event.id);
      return;
    }

    const when = new Date(event.startTime).toLocaleString("vi-VN", { dateStyle: "full", timeStyle: "short" });
    let sent = 0;
    for (const userId of userIds) {
      const user = await this.userClient.findById(userId);
      if (!user) continue;
      try {
        await this.mailer.send(
          user.email,
          `Sắp diễn ra: ${event.title}`,
          `<p>Chào ${escapeHtml(user.fullName)},</p>
           <p>Sự kiện <strong>${escapeHtml(event.title)}</strong> bạn đã mua vé sắp diễn ra:</p>
           <p>🕒 ${when}<br/>📍 ${escapeHtml(event.venueName)}</p>
           <p>Hẹn gặp bạn tại sự kiện!</p>`,
        );
        sent++;
      } catch {
        // Already logged inside MailerService — one bad send shouldn't block the rest of the attendee list.
      }
    }
    this.logger.log(`Event reminder: ${event.title} (${event.id}) — sent ${sent}/${userIds.length}`);
    await this.eventClient.markReminderSent(event.id);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
