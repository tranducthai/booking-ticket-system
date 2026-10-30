import { escapeHtml } from "./escape-html";
import { callout, detailsTable, emailButton, emailLayout, greeting, paragraph, signoff, subjectLine } from "./layout";
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
  const reason =
    kind === "EVENT_CANCELED" ? "Sự kiện bị hủy" : kind === "EVENT_POSTPONED" ? "Sự kiện đổi lịch" : "Yêu cầu hoàn tiền của bạn đã được chấp thuận";
  const scope = ticketCount ? `${ticketCount} vé trong đơn hàng` : "Toàn bộ đơn hàng";
  const voided = ticketCount
    ? `${ticketCount} vé đã hoàn đã bị vô hiệu hóa; các vé còn lại trong đơn (nếu có) vẫn sử dụng bình thường.`
    : "Các vé thuộc đơn hàng này đã bị vô hiệu hóa.";
  return {
    subject: subjectLine(`Hoàn tiền thành công — đơn hàng #${orderCode}`),
    html: emailLayout({
      title: "Hoàn tiền thành công",
      preheader: `Chúng tôi đã hoàn ${amount} cho đơn hàng #${orderCode}.`,
      body: [
        greeting(fullName),
        paragraph("Chúng tôi xác nhận khoản hoàn tiền cho đơn hàng của bạn đã được thực hiện:"),
        detailsTable([
          ["Mã đơn hàng", `#${escapeHtml(orderCode)}`],
          ["Phạm vi hoàn", escapeHtml(scope)],
          ["Số tiền hoàn", escapeHtml(amount)],
          ["Lý do", escapeHtml(reason)],
        ]),
        callout("info", "Tiền sẽ về phương thức thanh toán ban đầu trong khoảng <strong>2–5 ngày làm việc</strong>, tùy thuộc vào ngân hàng hoặc ví điện tử của bạn."),
        paragraph(escapeHtml(voided)),
        emailButton(orderUrl, "Xem đơn hàng"),
        paragraph("Cảm ơn bạn đã sử dụng EventPass. Rất mong được phục vụ bạn trong những sự kiện sắp tới."),
        signoff(),
      ].join("\n"),
    }),
  };
}

export interface RefundRejectedEmailData extends RefundEmailBase {
  reason: string;
  /** true = admin rejected the appeal — no further step available. */
  final: boolean;
}

export function refundRejectedEmail({ fullName, orderCode, orderUrl, reason, final }: RefundRejectedEmailData): EmailContent {
  return {
    subject: subjectLine(final ? `Khiếu nại hoàn tiền không được chấp thuận — đơn hàng #${orderCode}` : `Yêu cầu hoàn tiền không được chấp thuận — đơn hàng #${orderCode}`),
    html: emailLayout({
      title: final ? "Khiếu nại hoàn tiền không được chấp thuận" : "Yêu cầu hoàn tiền không được chấp thuận",
      preheader: `Kết quả xử lý yêu cầu hoàn tiền cho đơn hàng #${orderCode}.`,
      body: [
        greeting(fullName),
        paragraph(
          final
            ? `Quản trị viên đã xem xét lại và <strong>không chấp thuận khiếu nại</strong> hoàn tiền cho đơn hàng <strong>#${escapeHtml(orderCode)}</strong>.`
            : `Ban tổ chức đã xem xét và <strong>không chấp thuận yêu cầu hoàn tiền</strong> cho đơn hàng <strong>#${escapeHtml(orderCode)}</strong>.`,
        ),
        callout("danger", `<strong>Lý do:</strong> ${escapeHtml(reason)}`),
        paragraph("Vé của bạn <strong>vẫn còn hiệu lực</strong> và có thể sử dụng bình thường."),
        final
          ? paragraph("Đây là quyết định cuối cùng đối với yêu cầu này. Chúng tôi xin lỗi vì kết quả chưa như mong đợi.")
          : paragraph("Nếu bạn không đồng ý với quyết định này, bạn có thể gửi <strong>khiếu nại tới quản trị viên trong vòng 7 ngày</strong> tại trang đơn hàng, kèm thông tin hoặc chứng từ bổ sung (nếu có)."),
        emailButton(orderUrl, final ? "Xem đơn hàng" : "Xem đơn & gửi khiếu nại"),
        signoff(),
      ].join("\n"),
    }),
  };
}

export interface RefundInfoRequestedEmailData extends RefundEmailBase {
  message: string;
}

export function refundInfoRequestedEmail({ fullName, orderCode, orderUrl, message }: RefundInfoRequestedEmailData): EmailContent {
  return {
    subject: subjectLine(`Cần bổ sung thông tin hoàn tiền — đơn hàng #${orderCode}`),
    html: emailLayout({
      title: "Cần bổ sung thông tin cho yêu cầu hoàn tiền",
      preheader: `Vui lòng bổ sung thông tin để chúng tôi tiếp tục xử lý đơn hàng #${orderCode}.`,
      body: [
        greeting(fullName),
        paragraph(`Để tiếp tục xử lý yêu cầu hoàn tiền cho đơn hàng <strong>#${escapeHtml(orderCode)}</strong>, chúng tôi cần bạn bổ sung thêm thông tin sau:`),
        callout("warning", escapeHtml(message)),
        paragraph("Yêu cầu của bạn sẽ được xử lý tiếp ngay khi chúng tôi nhận được phản hồi. Vui lòng phản hồi sớm để tránh chậm trễ."),
        emailButton(orderUrl, "Bổ sung thông tin"),
        signoff(),
      ].join("\n"),
    }),
  };
}
