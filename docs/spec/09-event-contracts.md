# EVENT CONTRACTS
## Online Event Ticketing System (similar to Ticketbox)

---

Concrete payload definitions for the broker events named in the Saga flow in [03-system-design.md](03-system-design.md). That document only names `PaymentSucceeded`; this doc fills in the rest of the chain, and defines the shared TypeScript types that belong in `libs/event-contracts` per [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md).

## Design refinement over the original flow

The original Saga description had Ticket Service and Notification Service both "listen" directly to `PaymentSucceeded`. In practice that event, published by Payment Service, only carries payment-level data — it doesn't know which seats/ticket types were purchased (that's `OrderItem` data, owned by Booking Service). So Ticket Service can't generate tickets from it alone.

Fix: **Booking Service re-publishes its own domain event** after processing `PaymentSucceeded`, carrying the order-item detail Ticket Service actually needs. This keeps each service's published events limited to data it owns — Payment Service never has to know about seats or ticket types.

```
Payment Service --PaymentSucceeded--> Booking Service
Booking Service --OrderPaid--> Ticket Service
Ticket Service  --TicketIssued--> Notification Service
```

This also fixes a second gap: the original flow didn't say what Notification Service actually sends on `PaymentSucceeded` — the answer is the e-ticket email, which needs the QR image, so Notification Service should wait for `TicketIssued` (has the QR data), not fire on an earlier event.

## Naming & routing convention

- Exchange: 1 topic exchange per publishing service (`user.events`, `event.events`, `booking.events`, `payment.events`, `ticket.events`), routing key = event name.
- Queue naming: `<consumer-service>.<event-name>` (e.g. `ticket-service.order-paid`), so each consumer's queue is independently inspectable/replayable.
- Every event envelope carries `{ eventId, occurredAt, payload }` — `eventId` (UUID) lets consumers de-duplicate on redelivery (RabbitMQ gives at-least-once delivery, not exactly-once). **De-dup is not automatic** — each consumer must record processed `eventId`s (a `processed_events` table written in the handler's transaction) and each handler must be idempotent; every queue needs a dead-letter exchange for poison messages. Designed in [12-resilience-and-failure-design.md](12-resilience-and-failure-design.md) §2.4–2.5.

---

## Event catalog

| Event | Published by | Consumed by | Triggers |
|---|---|---|---|
| `PaymentSucceeded` | Payment Service | Booking Service | Order → `PAID` |
| `PaymentFailed` | Payment Service | Booking Service | Release the seat/quantity hold, order → `EXPIRED` |
| `OrderPaid` | Booking Service | Ticket Service, Notification Service | Ticket Service generates QR tickets; Notification sends an order-confirmed note |
| `TicketIssued` | Ticket Service | Notification Service | Sends the e-ticket email (QR attached) |
| `RefundApproved` | Payment Service | Booking Service | Order → `CANCELED` |
| `OrderCanceled` | Booking Service | Event Service, Ticket Service | Event Service releases the seat/restocks quantity; Ticket Service marks the ticket `CANCELED` |

---

## Payload shapes

```typescript
// libs/event-contracts/src/index.ts

interface EventEnvelope<T> {
  eventId: string;      // UUID, for consumer-side de-duplication
  occurredAt: string;   // ISO 8601
  payload: T;
}

interface PaymentSucceededPayload {
  paymentId: string;
  orderId: string;
  amount: number;
  method: string;       // "vnpay" | "momo" | "zalopay" | "card"
  paidAt: string;
}

interface PaymentFailedPayload {
  paymentId: string;
  orderId: string;
  reason: string;
  failedAt: string;
}

interface OrderPaidPayload {
  orderId: string;
  userId: string;
  eventId: string;
  items: Array<{
    orderItemId: string;
    ticketTypeId?: string;  // General Admission
    seatId?: string;        // Seat Map
    quantity: number;
    price: number;
  }>;
}

interface TicketIssuedPayload {
  orderId: string;
  userId: string;
  tickets: Array<{
    ticketId: string;
    orderItemId: string;
    qrPayload: string;
  }>;
}

interface RefundApprovedPayload {
  refundId: string;
  orderId: string;
  amount: number;
  approvedAt: string;
}

interface OrderCanceledPayload {
  orderId: string;
  eventId: string;
  items: Array<{
    orderItemId: string;
    ticketTypeId?: string;
    seatId?: string;
    quantity: number;
  }>;
}
```

## QR payload (Ticket Service)

`Ticket.qrPayload` (see [07-database-schema.md](07-database-schema.md)) is not a random string — it's a signed token so a check-in scan can be validated **offline** without a database round trip first (fast path), then confirmed against the DB (authoritative path, catches "already used" and cross-event fraud):

```typescript
interface QrPayload {
  ticketId: string;
  eventId: string;
  orderItemId: string;
  issuedAt: string;
}
// qrSignature = HMAC-SHA256(JSON.stringify(QrPayload), TICKET_SIGNING_SECRET)
// The QR image encodes base64(QrPayload) + "." + qrSignature.
// Check-in flow: recompute the HMAC locally (rejects tampered/forged QRs instantly,
// no DB hit) -> only then query Ticket Service for the current status
// (catches replay/duplicate-scan, which a signature check alone can't).
```

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md, 12-resilience-and-failure-design.md*
