import { escapeHtml } from "./escape-html";
import { callout, detailsTable, emailButton, emailLayout, greeting, paragraph, signoff, subjectLine } from "./layout";
import { EmailContent } from "./types";

export interface EventCanceledEmailData {
  fullName: string;
  eventTitle: string;
  reason: string;
  /** Absolute link to the customer's orders, where the refund status shows. */
  ordersUrl?: string;
}

/** docs/spec/13-refund-and-anti-fraud-design.md §2.3 — sent to every ticket holder when an admin cancels an event. */
export function eventCanceledEmail({ fullName, eventTitle, reason, ordersUrl }: EventCanceledEmailData): EmailContent {
  return {
    subject: subjectLine(`Thông báo hủy sự kiện: ${eventTitle}`),
    html: emailLayout({
      title: "Sự kiện bạn đã đặt vé đã bị hủy",
      preheader: `${eventTitle} đã bị hủy. Bạn sẽ được hoàn tiền toàn bộ.`,
      body: [
        greeting(fullName),
        paragraph(`Chúng tôi rất tiếc phải thông báo rằng sự kiện <strong>${escapeHtml(eventTitle)}</strong> mà bạn đã mua vé <strong>đã bị hủy</strong>.`),
        callout("danger", `<strong>Lý do:</strong> ${escapeHtml(reason)}`),
        paragraph("<strong>Quyền lợi của bạn</strong>"),
        `<ul style="margin:0 0 16px;padding-left:20px;line-height:1.7">
           <li>Vé của bạn đã được vô hiệu hóa.</li>
           <li><strong>Toàn bộ số tiền sẽ được hoàn tự động</strong> về phương thức thanh toán ban đầu — bạn không cần gửi yêu cầu.</li>
           <li>Thời gian tiền về thường từ <strong>2–5 ngày làm việc</strong>, tùy ngân hàng hoặc ví điện tử.</li>
         </ul>`,
        paragraph("Chúng tôi sẽ gửi email xác nhận khi giao dịch hoàn tiền hoàn tất. Thành thật xin lỗi vì sự bất tiện này."),
        ordersUrl ? emailButton(ordersUrl, "Theo dõi đơn hàng") : "",
        signoff(),
      ].join("\n"),
    }),
  };
}

export interface EventPostponedEmailData {
  fullName: string;
  eventTitle: string;
  /** Already formatted for display (vi-VN). */
  newWhen: string;
  refundDeadline: string;
  /** Absolute link to the customer's orders, where they can request the refund. */
  ordersUrl?: string;
}

/** §2.4 — tickets stay valid for the new date; holders may claim a full refund until the deadline. */
export function eventPostponedEmail({ fullName, eventTitle, newWhen, refundDeadline, ordersUrl }: EventPostponedEmailData): EmailContent {
  return {
    subject: subjectLine(`Thông báo đổi lịch sự kiện: ${eventTitle}`),
    html: emailLayout({
      title: "Sự kiện bạn đã đặt vé được đổi lịch",
      preheader: `${eventTitle} được dời sang ${newWhen}.`,
      body: [
        greeting(fullName),
        paragraph(`Ban tổ chức thông báo sự kiện <strong>${escapeHtml(eventTitle)}</strong> đã được dời sang thời gian mới:`),
        detailsTable([
          ["Sự kiện", escapeHtml(eventTitle)],
          ["Thời gian mới", escapeHtml(newWhen)],
        ]),
        callout("success", "Vé hiện tại của bạn <strong>vẫn có hiệu lực</strong> cho ngày mới. Nếu bạn vẫn tham dự, bạn không cần làm gì thêm."),
        paragraph(
          `Trong trường hợp không thể sắp xếp thời gian, bạn có thể yêu cầu <strong>hoàn tiền 100%</strong> tại mục <strong>Đơn hàng</strong> trước <strong>${escapeHtml(refundDeadline)}</strong>. Sau thời hạn này, yêu cầu hoàn tiền sẽ theo chính sách hoàn vé thông thường của sự kiện.`,
        ),
        ordersUrl ? emailButton(ordersUrl, "Xem đơn hàng") : "",
        paragraph("Xin lỗi vì sự thay đổi này và cảm ơn bạn đã thông cảm."),
        signoff(),
      ].join("\n"),
    }),
  };
}
