import { escapeHtml } from "./escape-html";
import { EmailContent } from "./types";

export interface OrderPaidEmailData {
  orderId: string;
  fullName: string;
}

/** Sent on OrderPaid — a lightweight "we're generating your tickets" note. The e-ticket itself waits for TicketIssued (see ticket-issued.ts). */
export function orderPaidEmail({ orderId, fullName }: OrderPaidEmailData): EmailContent {
  return {
    subject: `We received your payment — order ${orderId.slice(0, 8)}`,
    html: `<p>Hi ${escapeHtml(fullName)},</p>
       <p>Your payment for order <strong>${orderId}</strong> was successful. We're generating your e-tickets now — you'll get another email with your QR codes shortly.</p>`,
  };
}
