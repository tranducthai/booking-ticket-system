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
  /** Lets notification-service show the event in the e-ticket email. Omitted by older publishers. */
  eventId?: string;
  tickets: TicketIssuedItem[];
}

export interface RefundApprovedPayload {
  refundId: string;
  orderId: string;
  amount: number;
  approvedAt: string;
  /** Who to notify — omitted for system-initiated compensating refunds (docs/spec/12-resilience-and-failure-design.md "auto-refund") where no authenticated actor requested it. */
  userId?: string;
  /**
   * The tickets (order items) this refund pays back. Absent or empty = the
   * whole order (older publishers, canceled-event and auto-refunds). When it
   * covers only part of the order, booking-service cancels just those items
   * and the order stays active.
   */
  orderItemIds?: string[];
  /** docs/spec/13-refund-and-anti-fraud-design.md §2 — lets the notification copy distinguish "your request was approved" from "the event was canceled". Omitted by older publishers. */
  kind?: RefundKind;
}

/** docs/spec/13-refund-and-anti-fraud-design.md §2 "refund kinds" — mirrors payment-service's RefundKind enum. */
export type RefundKind = "CUSTOMER_REQUEST" | "EVENT_CANCELED" | "EVENT_POSTPONED" | "SYSTEM_ERROR";

export interface RefundRejectedPayload {
  refundId: string;
  orderId: string;
  userId: string;
  reason: string;
  /** true once an admin rejected an escalated request — no further appeal possible. */
  final: boolean;
}

export interface RefundInfoRequestedPayload {
  refundId: string;
  orderId: string;
  userId: string;
  message: string;
}

/**
 * Per-event refund policy stored as `Event.refundPolicy` (event-service) and
 * evaluated by payment-service at request time — docs/spec/13-refund-and-anti-fraud-design.md §2.
 * Only governs CUSTOMER-initiated refunds: event cancellation/postponement
 * always refund 100% regardless of what the organizer configured here.
 */
export interface RefundPolicyTier {
  /** Applies when the request is made at least this many hours before the event starts. */
  minHoursBefore: number;
  /** 0-100, share of the amount paid that is refunded. */
  percent: number;
}

export interface RefundPolicy {
  customerRefundable: boolean;
  /** Evaluated highest minHoursBefore first; the first tier the request satisfies wins. */
  tiers: RefundPolicyTier[];
  /** Reason categories that must come with at least one evidence file. */
  evidenceRequiredFor?: RefundReasonCategory[];
  /**
   * Organizer opt-in: a customer request that fits a tier (and needs no
   * evidence) is approved by the system and paid out at once, no review.
   * Absent = false (requests wait for the organizer, as before).
   */
  autoApprove?: boolean;
}

export type RefundReasonCategory = "PERSONAL" | "SCHEDULE_CONFLICT" | "MEDICAL" | "EVENT_ISSUE" | "OTHER";

/** Used when an event has no refundPolicy — same default as Ticketbox: no customer-initiated refunds after payment. */
export const DEFAULT_REFUND_POLICY: RefundPolicy = { customerRefundable: false, tiers: [] };

export interface EventCanceledPayload {
  eventId: string;
  organizerId: string;
  title: string;
  reason: string;
  canceledAt: string;
}

export interface EventPostponedPayload {
  eventId: string;
  organizerId: string;
  title: string;
  previousStartTime: string;
  newStartTime: string;
  /** Ticket holders may claim a 100% refund until this moment. */
  refundWindowEndsAt: string;
}

export interface EventApprovedPayload {
  eventId: string;
  organizerId: string;
  title: string;
}

export interface EventRejectedPayload {
  eventId: string;
  organizerId: string;
  title: string;
  reason: string;
}

export interface OrderCanceledItem {
  orderItemId: string;
  ticketTypeId?: string;
  seatId?: string;
  quantity: number;
}

export interface OrderCanceledPayload {
  orderId: string;
  userId: string; // needed by event-service to release the ownership-checked hold and clean up its per-user hold-count set
  eventId: string;
  /** Only these items are canceled — consumers act per item, never on "the whole order". */
  items: OrderCanceledItem[];
  /** true when some tickets of the order were refunded but the order itself stays active. */
  partial?: boolean;
}

/** QR payload signed by Ticket Service — see docs/spec/09-event-contracts.md "QR payload". */
export interface QrPayload {
  ticketId: string;
  eventId: string;
  orderItemId: string;
  issuedAt: string;
  /** Bumped every time the QR is reissued (docs/spec/13-refund-and-anti-fraud-design.md §3) — a QR whose version is behind the ticket's is dead. Absent on v1 (HMAC) payloads, which count as version 1. */
  qrVersion?: number;
  /** Số CCCD of the ticket holder at issue time; printed in the QR so the gate can compare it with the ID card. Absent on older tickets. */
  nationalId?: string;
}

/** user-service → notification-service: an admin invited a partner organizer; email them inviteUrl. */
export interface PartnerInvitedPayload {
  email: string;
  fullName: string;
  /** The link where the invitee sets a password — the organizer account only exists after that. */
  inviteUrl: string;
  expiresAt: string;
}

/**
 * user-service → notification-service: email a password-reset link.
 * resetUrl carries the raw single-use token (user-service only stores its
 * hash); it expires at expiresAt, so a late redelivery just sends a dead link.
 */
export interface PasswordResetRequestedPayload {
  userId: string;
  email: string;
  fullName: string;
  resetUrl: string;
  expiresAt: string;
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
  EVENT: "event.events",
  USER: "user.events",
} as const;

export const ROUTING_KEYS = {
  PAYMENT_SUCCEEDED: "payment-succeeded",
  PAYMENT_FAILED: "payment-failed",
  ORDER_PAID: "order-paid",
  TICKET_ISSUED: "ticket-issued",
  REFUND_APPROVED: "refund-approved",
  ORDER_CANCELED: "order-canceled",
  EVENT_APPROVED: "event-approved",
  EVENT_REJECTED: "event-rejected",
  EVENT_CANCELED: "event-canceled",
  EVENT_POSTPONED: "event-postponed",
  REFUND_REJECTED: "refund-rejected",
  REFUND_INFO_REQUESTED: "refund-info-requested",
  PASSWORD_RESET_REQUESTED: "password-reset-requested",
  PARTNER_INVITED: "partner-invited",
} as const;
