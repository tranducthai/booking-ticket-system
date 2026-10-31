# SEQUENCE DIAGRAMS
## Online Event Ticketing System (similar to Ticketbox)

---

Visualizes the Saga choreography from [03-system-design.md](03-system-design.md) using the concrete event names defined in [09-event-contracts.md](09-event-contracts.md). Rendered with [Mermaid](https://mermaid.js.org) — same as [06-infrastructure-diagram.md](06-infrastructure-diagram.md), renders natively on GitHub.

## 1. Booking & payment (UC-01: 10-minute hold, bank transfer via SePay, hold expiry)

```mermaid
sequenceDiagram
    actor U as User
    participant W as web
    participant B as booking-service
    participant P as payment-service
    participant S as SePay
    participant T as ticket-service

    U->>W: Pick tickets, click Buy
    W->>B: Create order
    alt Sold out (held by someone else, or already bought)
        B-->>U: "Sold out"
    else Available
        B->>B: Hold the tickets for 10 minutes (PENDING)
        B-->>W: Checkout page with a 10-minute countdown
        U->>W: Choose bank transfer (VietQR)
        W->>P: Create payment
        P-->>W: VietQR details
        W-->>U: Show the VietQR
        alt Transfer within 10 minutes
            U->>S: Scan the QR, transfer
            S->>P: Money received (with the transfer content)
            P->>P: Match the order, check the amount
            P->>B: Payment succeeded
            B->>B: Confirm the held tickets
            B->>T: Issue tickets
            T->>T: Create tickets
            T-->>U: E-ticket, see it under "My tickets"
        else 10 minutes pass without a transfer
            B->>B: Cancel the order, delete the PENDING tickets
            W-->>U: "Booking time is over"
        end
    end
```

The other gateways (VNPay, MoMo, PayPal) follow the same shape: `payment-service` starts the payment, the gateway reports the result to it, then it tells `booking-service`. A payment failure cancels the order and releases the hold the same way as the 10-minute timeout.


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

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 11-implementation-roadmap.md, 12-resilience-and-failure-design.md*
