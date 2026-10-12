import { escapeHtml } from "./escape-html";
import { EmailContent } from "./types";

export interface EventCanceledEmailData {
  fullName: string;
  eventTitle: string;
  reason: string;
}

/** docs/spec/13-refund-and-anti-fraud-design.md §2.3 — sent to every ticket holder when an admin cancels an event. */
export function eventCanceledEmail({ fullName, eventTitle, reason }: EventCanceledEmailData): EmailContent {
  return {
    subject: `Sự kiện đã bị hủy: ${eventTitle}`,
    html: `<p>Chào ${escapeHtml(fullName)},</p>
           <p>Rất tiếc, sự kiện <strong>${escapeHtml(eventTitle)}</strong> bạn đã mua vé <strong>đã bị hủy</strong>.</p>
           <p>Lý do từ ban tổ chức: ${escapeHtml(reason)}</p>
           <p>Vé của bạn đã được vô hiệu hóa và <strong>toàn bộ số tiền sẽ được hoàn tự động</strong> về phương thức thanh toán ban đầu — bạn không cần gửi yêu cầu. Thời gian tiền về thường 2–5 ngày làm việc, tùy ngân hàng/ví.</p>
           <p>Chúng tôi sẽ gửi thông báo khi giao dịch hoàn tiền hoàn tất.</p>`,
  };
}

export interface EventPostponedEmailData {
  fullName: string;
  eventTitle: string;
  /** Already formatted for display (vi-VN). */
  newWhen: string;
  refundDeadline: string;
}

/** §2.4 — tickets stay valid for the new date; holders may claim a full refund until the deadline. */
export function eventPostponedEmail({ fullName, eventTitle, newWhen, refundDeadline }: EventPostponedEmailData): EmailContent {
  return {
    subject: `Sự kiện đổi lịch: ${eventTitle}`,
    html: `<p>Chào ${escapeHtml(fullName)},</p>
           <p>Sự kiện <strong>${escapeHtml(eventTitle)}</strong> đã được dời sang <strong>${escapeHtml(newWhen)}</strong>.</p>
           <p>Vé hiện tại của bạn vẫn có hiệu lực cho ngày mới — bạn không cần làm gì thêm.</p>
           <p>Nếu không thể tham dự, bạn có thể yêu cầu <strong>hoàn 100%</strong> trong mục Đơn hàng trước <strong>${escapeHtml(refundDeadline)}</strong>.</p>`,
  };
}
