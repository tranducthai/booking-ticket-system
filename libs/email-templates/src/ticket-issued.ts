import { escapeHtml } from "./escape-html";
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
}

/** Sent on TicketIssued — the actual e-ticket email, one QR block per ticket. Caller attaches the matching cid images. */
export function ticketIssuedEmail({ orderId, fullName, tickets }: TicketIssuedEmailData): EmailContent {
  const ticketBlocks = tickets
    .map(
      (ticket, i) => `<div style="margin:24px 0;padding:16px;border:1px solid #ddd;border-radius:8px">
          <p>Ticket ${i + 1} — <code>${ticket.ticketId}</code></p>
          <img src="cid:${ticket.cid}" alt="QR code for ticket ${i + 1}" width="220" height="220" />
        </div>`,
    )
    .join("");

  return {
    subject: `Your e-tickets are ready — order ${orderId.slice(0, 8)}`,
    html: `<p>Hi ${escapeHtml(fullName)},</p>
       <p>Here ${tickets.length === 1 ? "is your e-ticket" : `are your ${tickets.length} e-tickets`} for order <strong>${orderId}</strong>. Show the QR code at check-in.</p>
       ${ticketBlocks}`,
  };
}
