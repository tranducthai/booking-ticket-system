import { escapeHtml } from "./escape-html";
import { callout, detailsTable, emailButton, emailLayout, greeting, paragraph, signoff, subjectLine } from "./layout";
import { EmailContent } from "./types";

export interface EventReminderEmailData {
  fullName: string;
  eventTitle: string;
  /** Already formatted for display (event-reminder.service.ts uses vi-VN locale) — this template doesn't reformat dates. */
  when: string;
  venueName: string;
  /** Absolute link to the event page. */
  eventUrl?: string;
  /** Absolute link to "Vé của tôi". */
  ticketsUrl?: string;
}

/** Sent by the EventReminderService poll ~24h before an event the recipient holds a ticket to. */
export function eventReminderEmail({ fullName, eventTitle, when, venueName, eventUrl, ticketsUrl }: EventReminderEmailData): EmailContent {
  return {
    subject: subjectLine(`Nhắc lịch: ${eventTitle} sắp diễn ra`),
    html: emailLayout({
      title: "Sự kiện bạn đã đặt vé sắp diễn ra",
      preheader: `${eventTitle} — ${when}`,
      body: [
        greeting(fullName),
        paragraph(`Sự kiện <strong>${escapeHtml(eventTitle)}</strong> mà bạn đã mua vé sẽ diễn ra trong khoảng 24 giờ tới. Dưới đây là thông tin để bạn chuẩn bị:`),
        detailsTable([
          ["Sự kiện", escapeHtml(eventTitle)],
          ["Thời gian", escapeHtml(when)],
          ["Địa điểm", escapeHtml(venueName)],
        ]),
        callout("info", "Hãy chuẩn bị sẵn <strong>mã QR trong mục Vé của tôi</strong> và đến sớm để kịp làm thủ tục vào cửa."),
        ticketsUrl ? emailButton(ticketsUrl, "Mở vé của tôi") : "",
        eventUrl ? paragraph(`Xem thêm thông tin sự kiện tại: <a href="${escapeHtml(eventUrl)}" style="color:#E8462A">${escapeHtml(eventUrl)}</a>`) : "",
        paragraph("Chúc bạn có một buổi trải nghiệm trọn vẹn!"),
        signoff(),
      ].join("\n"),
    }),
  };
}
