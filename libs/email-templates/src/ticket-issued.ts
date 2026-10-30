import { escapeHtml } from "./escape-html";
import { callout, detailsTable, emailButton, emailLayout, greeting, paragraph, signoff, subjectLine } from "./layout";
import { EmailContent } from "./types";

export interface TicketIssuedEmailTicket {
  ticketId: string;
  /** Content-ID of the QR PNG attachment the caller already built — this template only references it via `cid:`. */
  cid: string;
}

export interface TicketIssuedEmailData {
  orderId: string;
  fullName: string;
  tickets: TicketIssuedEmailTicket[];
  /** Event details, when the caller could look them up (when/venue already formatted for display). */
  event?: { title: string; when?: string; venue?: string };
  /** Absolute link to "Vé của tôi". */
  ticketsUrl?: string;
}

/** Sent on TicketIssued — the actual e-ticket email, one QR block per ticket. Caller attaches the matching cid images. */
export function ticketIssuedEmail({ orderId, fullName, tickets, event, ticketsUrl }: TicketIssuedEmailData): EmailContent {
  const code = orderId.slice(0, 8);
  const many = tickets.length > 1;

  const rows: Array<[string, string]> = [["Mã đơn hàng", `#${escapeHtml(code)}`]];
  if (event) rows.unshift(["Sự kiện", escapeHtml(event.title)]);
  if (event?.when) rows.push(["Thời gian", escapeHtml(event.when)]);
  if (event?.venue) rows.push(["Địa điểm", escapeHtml(event.venue)]);
  rows.push(["Số lượng vé", String(tickets.length)]);

  const ticketBlocks = tickets
    .map(
      (ticket, i) => `<div style="margin:0 0 16px;padding:20px;border:1px solid #eceef3;border-radius:10px;text-align:center">
          <p style="margin:0 0 4px;font-weight:700">${many ? `Vé ${i + 1}/${tickets.length}` : "Vé điện tử"}</p>
          <p style="margin:0 0 12px;color:#6b7080;font-size:12px">Mã vé: <span style="font-family:monospace">${escapeHtml(ticket.ticketId)}</span></p>
          <img src="cid:${escapeHtml(ticket.cid)}" alt="Mã QR của vé ${i + 1}" width="220" height="220" style="display:block;margin:0 auto" />
        </div>`,
    )
    .join("");

  return {
    subject: subjectLine(`Vé điện tử của bạn đã sẵn sàng — đơn hàng #${code}`),
    html: emailLayout({
      title: many ? `${tickets.length} vé điện tử của bạn đã sẵn sàng` : "Vé điện tử của bạn đã sẵn sàng",
      preheader: event ? `Vé cho sự kiện ${event.title} — vui lòng xuất trình mã QR khi vào cửa.` : "Vui lòng xuất trình mã QR khi vào cửa.",
      body: [
        greeting(fullName),
        paragraph(`Đơn hàng của bạn đã được xác nhận và ${many ? "các vé điện tử" : "vé điện tử"} đã sẵn sàng sử dụng. Thông tin chi tiết:`),
        detailsTable(rows),
        ticketBlocks,
        paragraph("<strong>Hướng dẫn khi vào cửa</strong>"),
        `<ul style="margin:0 0 16px;padding-left:20px;line-height:1.7">
           <li>Xuất trình mã QR của từng vé (trên điện thoại hoặc bản in) cho nhân viên soát vé.</li>
           <li>Mỗi vé chỉ được quét <strong>một lần</strong>; mỗi người tham dự cần một vé riêng.</li>
           <li>Mang theo giấy tờ tùy thân nếu sự kiện có quy định về độ tuổi hoặc xác minh danh tính.</li>
           <li>Vui lòng đến trước giờ bắt đầu để kịp làm thủ tục vào cửa.</li>
         </ul>`,
        callout("warning", "Vì lý do an toàn, <strong>không chia sẻ</strong> ảnh chụp mã QR cho người khác. Người quét trước sẽ là người được vào cửa."),
        ticketsUrl ? emailButton(ticketsUrl, "Xem vé của tôi") : "",
        paragraph("Trên website, mục <strong>Vé của tôi</strong> hiển thị mã QR tự làm mới liên tục, an toàn hơn so với ảnh chụp màn hình — bạn nên ưu tiên dùng khi vào cửa."),
        signoff(),
      ].join("\n"),
    }),
  };
}
