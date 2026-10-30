import { escapeHtml } from "./escape-html";
import { callout, detailsTable, emailButton, emailLayout, greeting, paragraph, signoff, subjectLine } from "./layout";
import { EmailContent } from "./types";

export interface OrderPaidEmailData {
  orderId: string;
  fullName: string;
  /** Event the order is for, when the caller could look it up. */
  eventTitle?: string;
  /** Already formatted, e.g. "500.000 ₫". */
  amount?: string;
  ticketCount?: number;
  /** Absolute link to the order page. */
  orderUrl?: string;
}

/** Sent on OrderPaid — confirms the payment. The e-ticket itself follows on TicketIssued (see ticket-issued.ts). */
export function orderPaidEmail({ orderId, fullName, eventTitle, amount, ticketCount, orderUrl }: OrderPaidEmailData): EmailContent {
  const code = orderId.slice(0, 8);
  const rows: Array<[string, string]> = [["Mã đơn hàng", `#${escapeHtml(code)}`]];
  if (eventTitle) rows.push(["Sự kiện", escapeHtml(eventTitle)]);
  if (ticketCount) rows.push(["Số lượng vé", String(ticketCount)]);
  if (amount) rows.push(["Số tiền đã thanh toán", escapeHtml(amount)]);

  return {
    subject: subjectLine(`Xác nhận thanh toán thành công — đơn hàng #${code}`),
    html: emailLayout({
      title: "Thanh toán thành công",
      preheader: `Chúng tôi đã nhận được thanh toán cho đơn hàng #${code}.`,
      body: [
        greeting(fullName),
        paragraph("Cảm ơn bạn đã đặt vé trên EventPass. Chúng tôi đã <strong>nhận được thanh toán</strong> của bạn với thông tin như sau:"),
        detailsTable(rows),
        callout("info", "Vé điện tử (mã QR) đang được tạo và sẽ được gửi đến bạn trong một email riêng ngay sau đây, thường chỉ mất vài phút."),
        orderUrl ? emailButton(orderUrl, "Xem đơn hàng") : "",
        paragraph("Nếu sau 15 phút bạn vẫn chưa nhận được vé, vui lòng kiểm tra mục thư rác hoặc xem vé trực tiếp tại mục <strong>Vé của tôi</strong> trên website."),
        signoff(),
      ].join("\n"),
    }),
  };
}
