# SEQUENCE DIAGRAMS
## Online Event Ticketing System (similar to Ticketbox)

---

Visualizes the Saga choreography from [03-system-design.md](03-system-design.md) using the concrete event names defined in [09-event-contracts.md](09-event-contracts.md). Rendered with [Mermaid](https://mermaid.js.org) — same as [06-infrastructure-diagram.md](06-infrastructure-diagram.md), renders natively on GitHub.

## 1. Booking & payment (UC-01, happy path + payment failure)

```mermaid
sequenceDiagram
    actor C as Customer
    participant GW as API Gateway
    participant BK as Booking Service
    participant EV as Event Service
    participant PM as Payment Service
    participant MQ as Broker (RabbitMQ)
    participant TK as Ticket Service
    participant NT as Notification Service
    participant PG as Payment Gateway

    C->>GW: POST /booking/cart/hold {eventId, items}
    GW->>BK: forward (X-User-Id from JWT)
    BK->>EV: POST /internal/seats/:id/hold
    EV-->>BK: 200 OK {expiresAt}
    BK->>BK: create Order (PENDING_PAYMENT)
    BK-->>C: 201 Order {id, expiresAt, totalAmount}

    C->>GW: POST /payment/payments {orderId, method}
    GW->>PM: forward
    PM->>PG: create transaction
    PG-->>PM: redirectUrl
    PM-->>C: 200 {redirectUrl}

    C->>PG: complete payment on gateway UI
    PG-->>PM: webhook: result

    alt payment succeeded
        PM->>PM: Payment.status = SUCCEEDED
        PM-)MQ: publish PaymentSucceeded
        MQ-)BK: consume PaymentSucceeded
        BK->>BK: Order.status = PAID
        BK-)MQ: publish OrderPaid {items}
        MQ-)TK: consume OrderPaid
        TK->>TK: generate + sign QR per order item
        TK-)MQ: publish TicketIssued {tickets}
        MQ-)NT: consume TicketIssued
        NT->>C: e-ticket email (QR attached)
    else payment failed
        PM->>PM: Payment.status = FAILED
        PM-)MQ: publish PaymentFailed
        MQ-)BK: consume PaymentFailed
        BK->>EV: POST /internal/seats/:id/release
        BK->>BK: Order.status = EXPIRED
    end
```

## 2. Hold expiry & refund (UC-04 + the seat-timeout exception flow)

```mermaid
sequenceDiagram
    actor C as Customer
    actor OA as Organizer/Admin
    participant GW as API Gateway
    participant BK as Booking Service
    participant EV as Event Service
    participant PM as Payment Service
    participant TK as Ticket Service
    participant MQ as Broker (RabbitMQ)

    rect rgb(245,245,245)
    Note over BK,EV: Hold expires (customer never paid within the TTL)
    BK->>BK: scheduled check finds an expired hold
    BK->>EV: POST /internal/seats/:id/release
    BK->>BK: Order.status = EXPIRED
    end

    rect rgb(245,245,245)
    Note over C,TK: Refund request (UC-04)
    C->>GW: POST /payment/refunds {orderId, reason}
    GW->>PM: forward
    PM->>PM: create Refund (REQUESTED)
    PM-->>C: 201 Refund {id, status}

    OA->>GW: PATCH /payment/refunds/:id/approve
    GW->>PM: forward
    PM->>PM: execute refund via Payment Gateway
    PM->>PM: Refund.status = COMPLETED
    PM-)MQ: publish RefundApproved
    MQ-)BK: consume RefundApproved
    BK->>BK: Order.status = CANCELED
    BK-)MQ: publish OrderCanceled {items}
    MQ-)EV: consume OrderCanceled -> release seat / restock quantity
    MQ-)TK: consume OrderCanceled -> Ticket.status = CANCELED
    end
```

## 3. Check-in (UC-02)

```mermaid
sequenceDiagram
    actor S as Check-in Staff
    participant GW as API Gateway
    participant TK as Ticket Service

    S->>GW: POST /ticket/tickets/:id/check-in {qrPayload}
    GW->>TK: forward
    TK->>TK: verify HMAC signature (offline-safe fast path)
    alt signature invalid
        TK-->>S: 400 invalid QR
    else signature valid
        TK->>TK: look up Ticket by id, check status + eventId match
        alt already USED or wrong event
            TK-->>S: 409 reject (fraud/duplicate warning)
        else ISSUED and matches this event
            TK->>TK: Ticket.status = USED, checkedInAt = now
            TK-->>S: 200 OK, admit
        end
    end
```

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 11-implementation-roadmap.md*
