import { emailButton } from "./button";
import { escapeHtml } from "./escape-html";
import { EmailContent } from "./types";

interface RefundEmailBase {
  fullName: string;
  /** Short order code shown to the customer, e.g. "a1b2c3d4". */
  orderCode: string;
  /** Absolute link to the order page. */
  orderUrl: string;
}

export interface RefundApprovedEmailData extends RefundEmailBase {
  /** Already formatted, e.g. "500.000 ₫". */
  amount: string;
  kind: "CUSTOMER_REQUEST" | "EVENT_CANCELED" | "EVENT_POSTPONED" | string;
  /** Per-ticket refund: how many tickets it paid back. Omitted = the whole order. */
  ticketCount?: number;
}

/** docs/spec/13-refund-and-anti-fraud-design.md §2.2 — sent once the money has actually been sent back. */
export function refundApprovedEmail({ fullName, orderCode, orderUrl, amount, kind, ticketCount }: RefundApprovedEmailData): EmailContent {
  const why = kind === "EVENT_CANCELED" ? " do sự kiện bị hủy" : kind === "EVENT_POSTPONED" ? " do sự kiện đổi lịch" : "";
  const what = ticketCount ? `${ticketCount} vé của đơn hàng` : "Đơn hàng";
  const voided = ticketCount
    ? `${ticketCount} vé đã hoàn bị vô hiệu hóa; các vé khác trong đơn (nếu có) vẫn dùng bình thường.`
    : "Vé của đơn này đã bị vô hiệu hóa.";
  return {
    subject: `Hoàn tiền thành công — đơn #${orderCode}`,
    html: `<p>Chào ${escapeHtml(fullName)},</p>
           <p>${what} <strong>#${escapeHtml(orderCode)}</strong> đã được hoàn <strong>${escapeHtml(amount)}</strong>${why}.</p>
           <p>Tiền sẽ về phương thức thanh toán ban đầu trong <strong>2–5 ngày làm việc</strong>, tùy ngân hàng/ví. ${voided}</p>
           ${emailButton(orderUrl, "Xem đơn hàng")}`,
  };
}

export interface RefundRejectedEmailData extends RefundEmailBase {
  reason: string;
  /** true = admin rejected the appeal — no further step available. */
  final: boolean;
}

export function refundRejectedEmail({ fullName, orderCode, orderUrl, reason, final }: RefundRejectedEmailData): EmailContent {
  return {
    subject: final ? `Khiếu nại hoàn tiền bị từ chối — đơn #${orderCode}` : `Yêu cầu hoàn tiền bị từ chối — đơn #${orderCode}`,
    html: `<p>Chào ${escapeHtml(fullName)},</p>
           <p>${final ? "Quản trị viên đã xem xét và <strong>từ chối khiếu nại</strong>" : "Ban tổ chức đã <strong>từ chối yêu cầu hoàn tiền</strong>"} cho đơn hàng <strong>#${escapeHtml(orderCode)}</strong>.</p>
           <p style="padding:12px 16px;border-left:4px solid #e5484d;background:#fff5f5">Lý do: ${escapeHtml(reason)}</p>
           <p>Vé của bạn <strong>vẫn còn hiệu lực</strong>.${final ? "" : " Nếu không đồng ý, bạn có thể khiếu nại lên quản trị viên trong vòng 7 ngày tại trang đơn hàng."}</p>
           ${emailButton(orderUrl, final ? "Xem đơn hàng" : "Xem đơn & khiếu nại")}`,
  };
}

export interface RefundInfoRequestedEmailData extends RefundEmailBase {
  message: string;
}

export function refundInfoRequestedEmail({ fullName, orderCode, orderUrl, message }: RefundInfoRequestedEmailData): EmailContent {
  return {
    subject: `Cần bổ sung thông tin hoàn tiền — đơn #${orderCode}`,
    html: `<p>Chào ${escapeHtml(fullName)},</p>
           <p>Để xử lý yêu cầu hoàn tiền cho đơn hàng <strong>#${escapeHtml(orderCode)}</strong>, chúng tôi cần bạn bổ sung thông tin:</p>
           <p style="padding:12px 16px;border-left:4px solid #f5a623;background:#fffaf0">${escapeHtml(message)}</p>
           <p>Yêu cầu sẽ được tiếp tục xử lý ngay khi bạn phản hồi.</p>
           ${emailButton(orderUrl, "Bổ sung thông tin")}`,
  };
}
