# SƠ ĐỒ TUẦN TỰ
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

Minh họa Saga choreography từ [03-system-design.md](03-system-design.md) bằng các tên event cụ thể được định nghĩa trong [09-event-contracts.md](09-event-contracts.md). Được render bằng [Mermaid](https://mermaid.js.org) — giống với [06-infrastructure-diagram.md](06-infrastructure-diagram.md), hiển thị trực tiếp trên GitHub.

## 1. Đặt vé & thanh toán (UC-01, luồng thành công + thanh toán thất bại)

```mermaid
sequenceDiagram
    actor C as Khách hàng
    participant GW as API Gateway
    participant BK as Booking Service
    participant EV as Event Service
    participant PM as Payment Service
    participant MQ as Broker (RabbitMQ)
    participant TK as Ticket Service
    participant NT as Notification Service
    participant PG as Payment Gateway

    C->>GW: POST /booking/cart/hold {eventId, items}
    GW->>BK: chuyển tiếp (X-User-Id từ JWT)
    BK->>EV: POST /internal/seats/:id/hold
    EV-->>BK: 200 OK {expiresAt}
    BK->>BK: tạo Order (PENDING_PAYMENT)
    BK-->>C: 201 Order {id, expiresAt, totalAmount}

    C->>GW: POST /payment/payments {orderId, method}
    GW->>PM: chuyển tiếp
    PM->>PG: tạo transaction
    PG-->>PM: redirectUrl
    PM-->>C: 200 {redirectUrl}

    C->>PG: hoàn tất thanh toán trên giao diện cổng thanh toán
    PG-->>PM: webhook: kết quả

    alt thanh toán thành công
        PM->>PM: Payment.status = SUCCEEDED
        PM-)MQ: publish PaymentSucceeded
        MQ-)BK: consume PaymentSucceeded
        BK->>BK: Order.status = PAID
        BK-)MQ: publish OrderPaid {items}
        MQ-)TK: consume OrderPaid
        TK->>TK: sinh + ký QR cho từng order item
        TK-)MQ: publish TicketIssued {tickets}
        MQ-)NT: consume TicketIssued
        NT->>C: email vé điện tử (kèm QR)
    else thanh toán thất bại
        PM->>PM: Payment.status = FAILED
        PM-)MQ: publish PaymentFailed
        MQ-)BK: consume PaymentFailed
        BK->>EV: POST /internal/seats/:id/release
        BK->>BK: Order.status = EXPIRED
    end
```

## 2. Hết hạn giữ chỗ & hoàn tiền (UC-04 + luồng ngoại lệ hết hạn giữ ghế)

```mermaid
sequenceDiagram
    actor C as Khách hàng
    actor OA as Ban tổ chức/Admin
    participant GW as API Gateway
    participant BK as Booking Service
    participant EV as Event Service
    participant PM as Payment Service
    participant TK as Ticket Service
    participant MQ as Broker (RabbitMQ)

    rect rgb(245,245,245)
    Note over BK,EV: Hold hết hạn (khách chưa thanh toán trong thời gian TTL)
    BK->>BK: tác vụ định kỳ phát hiện một hold đã hết hạn
    BK->>EV: POST /internal/seats/:id/release
    BK->>BK: Order.status = EXPIRED
    end

    rect rgb(245,245,245)
    Note over C,TK: Yêu cầu hoàn tiền (UC-04)
    C->>GW: POST /payment/refunds {orderId, reason}
    GW->>PM: chuyển tiếp
    PM->>PM: tạo Refund (REQUESTED)
    PM-->>C: 201 Refund {id, status}

    OA->>GW: PATCH /payment/refunds/:id/approve
    GW->>PM: chuyển tiếp
    PM->>PM: thực hiện hoàn tiền qua Payment Gateway
    PM->>PM: Refund.status = COMPLETED
    PM-)MQ: publish RefundApproved
    MQ-)BK: consume RefundApproved
    BK->>BK: Order.status = CANCELED
    BK-)MQ: publish OrderCanceled {items}
    MQ-)EV: consume OrderCanceled -> nhả ghế / khôi phục số lượng
    MQ-)TK: consume OrderCanceled -> Ticket.status = CANCELED
    end
```

## 3. Check-in (UC-02)

```mermaid
sequenceDiagram
    actor S as Nhân viên soát vé
    participant GW as API Gateway
    participant TK as Ticket Service

    S->>GW: POST /ticket/tickets/:id/check-in {qrPayload}
    GW->>TK: chuyển tiếp
    TK->>TK: xác minh chữ ký HMAC (fast path an toàn offline)
    alt chữ ký không hợp lệ
        TK-->>S: 400 QR không hợp lệ
    else chữ ký hợp lệ
        TK->>TK: tra Ticket theo id, kiểm tra status + eventId khớp
        alt đã USED hoặc sai sự kiện
            TK-->>S: 409 từ chối (cảnh báo gian lận/trùng lặp)
        else ISSUED và khớp sự kiện này
            TK->>TK: Ticket.status = USED, checkedInAt = now
            TK-->>S: 200 OK, cho vào
        end
    end
```

---

*Tài liệu liên quan: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 11-implementation-roadmap.md, 12-resilience-and-failure-design.md*
