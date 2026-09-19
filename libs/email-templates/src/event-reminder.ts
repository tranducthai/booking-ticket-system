import { escapeHtml } from "./escape-html";
import { EmailContent } from "./types";

export interface EventReminderEmailData {
  fullName: string;
  eventTitle: string;
  /** Already formatted for display (event-reminder.service.ts uses vi-VN locale) — this template doesn't reformat dates. */
  when: string;
  venueName: string;
}

/** Sent by the EventReminderService poll ~24h before an event the recipient holds a ticket to. */
export function eventReminderEmail({ fullName, eventTitle, when, venueName }: EventReminderEmailData): EmailContent {
  return {
    subject: `Sắp diễn ra: ${eventTitle}`,
    html: `<p>Chào ${escapeHtml(fullName)},</p>
           <p>Sự kiện <strong>${escapeHtml(eventTitle)}</strong> bạn đã mua vé sắp diễn ra:</p>
           <p>🕒 ${when}<br/>📍 ${escapeHtml(venueName)}</p>
           <p>Hẹn gặp bạn tại sự kiện!</p>`,
  };
}
