# SƠ ĐỒ TUẦN TỰ
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

Minh họa Saga choreography từ [03-system-design.md](03-system-design.md) bằng các tên event cụ thể được định nghĩa trong [09-event-contracts.md](09-event-contracts.md). Được render bằng [Mermaid](https://mermaid.js.org) — giống với [06-infrastructure-diagram.md](06-infrastructure-diagram.md), hiển thị trực tiếp trên GitHub.

## 1. Đặt vé & thanh toán (UC-01: giữ vé 10 phút, chuyển khoản qua SePay, hết hạn giữ vé)

```mermaid
sequenceDiagram
    actor U as Người dùng
    participant W as web
    participant B as booking-service
    participant P as payment-service
    participant S as SePay
    participant T as ticket-service

    U->>W: Chọn vé, bấm Mua vé
    W->>B: Tạo đơn
    alt Hết vé (người khác đang giữ hoặc đã mua)
        B-->>U: Báo "Vé đã hết"
    else Còn vé
        B->>B: Giữ vé 10 phút ở trạng thái PENDING
        B-->>W: Trang thanh toán, đồng hồ đếm ngược 10 phút
        U->>W: Chọn Chuyển khoản (VietQR)
        W->>P: Tạo thanh toán
        P-->>W: Thông tin VietQR
        W-->>U: Hiện mã VietQR
        alt Chuyển khoản trong 10 phút
            U->>S: Quét QR, chuyển khoản
            S->>P: Báo có tiền vào (kèm nội dung chuyển khoản)
            P->>P: Khớp đơn, kiểm tra đủ tiền
            P->>B: Thanh toán thành công
            B->>B: Xác nhận vé đã giữ
            B->>T: Yêu cầu phát vé
            T->>T: Tạo vé
            T-->>U: Vé điện tử, xem vé trong "Vé của tôi"
        else Hết 10 phút chưa chuyển
            B->>B: Hủy đơn, xóa vé PENDING
            W-->>U: Báo "Hết thời gian đặt vé"
        end
    end
```

Các cổng khác (VNPay, MoMo, PayPal) có cùng hình dạng: `payment-service` khởi tạo thanh toán, cổng báo kết quả về cho nó, rồi nó báo `booking-service`. Thanh toán thất bại thì hủy đơn và nhả vé giống như hết 10 phút.


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
