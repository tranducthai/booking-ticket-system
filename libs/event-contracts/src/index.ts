/**
 * Shared broker event contracts — see docs/spec/09-event-contracts.md.
 * Every service that publishes or consumes one of these events imports the
 * type from here so the two sides can never drift silently.
 */

export interface EventEnvelope<T> {
  eventId: string; // UUID, for consumer-side de-duplication (RabbitMQ is at-least-once)
  occurredAt: string; // ISO 8601
  payload: T;
}

export interface PaymentSucceededPayload {
  paymentId: string;
  orderId: string;
  amount: number;
  method: string; // "vnpay" | "momo" | "zalopay" | "card"
  paidAt: string;
}

export interface PaymentFailedPayload {
  paymentId: string;
  orderId: string;
  reason: string;
  failedAt: string;
}

export interface OrderPaidItem {
  orderItemId: string;
  ticketTypeId?: string; // General Admission
  seatId?: string; // Seat Map
  quantity: number;
  price: number;
}

export interface OrderPaidPayload {
  orderId: string;
  userId: string;
  eventId: string;
  items: OrderPaidItem[];
}

export interface TicketIssuedItem {
  ticketId: string;
  orderItemId: string;
  qrPayload: string;
}

export interface TicketIssuedPayload {
  orderId: string;
  userId: string;
  tickets: TicketIssuedItem[];
}

export interface RefundApprovedPayload {
  refundId: string;
  orderId: string;
  amount: number;
  approvedAt: string;
}

export interface OrderCanceledItem {
  orderItemId: string;
  ticketTypeId?: string;
  seatId?: string;
  quantity: number;
}

export interface OrderCanceledPayload {
  orderId: string;
  eventId: string;
  items: OrderCanceledItem[];
}

/** QR payload signed by Ticket Service — see docs/spec/09-event-contracts.md "QR payload". */
export interface QrPayload {
  ticketId: string;
  eventId: string;
  orderItemId: string;
  issuedAt: string;
}

/**
 * Routing keys / exchange names — 1 topic exchange per publishing service,
 * routing key = event name. Queue naming convention for consumers:
 * `<consumer-service>.<event-name>` (kebab-case).
 */
export const EXCHANGES = {
  PAYMENT: "payment.events",
  BOOKING: "booking.events",
  TICKET: "ticket.events",
} as const;

export const ROUTING_KEYS = {
  PAYMENT_SUCCEEDED: "payment-succeeded",
  PAYMENT_FAILED: "payment-failed",
  ORDER_PAID: "order-paid",
  TICKET_ISSUED: "ticket-issued",
  REFUND_APPROVED: "refund-approved",
  ORDER_CANCELED: "order-canceled",
} as const;
