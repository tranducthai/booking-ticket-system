# HỢP ĐỒNG SỰ KIỆN
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

Định nghĩa cụ thể payload cho các event trên message broker được đặt tên trong luồng Saga ở [03-system-design.md](03-system-design.md). Tài liệu đó chỉ nêu tên `PaymentSucceeded`; tài liệu này bổ sung phần còn lại của chuỗi sự kiện, và định nghĩa các TypeScript type dùng chung thuộc về `libs/event-contracts` theo [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md).

## Tinh chỉnh thiết kế so với luồng gốc

Mô tả Saga ban đầu có Ticket Service và Notification Service cùng "lắng nghe" trực tiếp `PaymentSucceeded`. Trên thực tế, event này do Payment Service phát ra chỉ mang dữ liệu ở mức thanh toán — nó không biết ghế/loại vé nào đã được mua (đó là dữ liệu `OrderItem`, thuộc sở hữu của Booking Service). Vì vậy Ticket Service không thể tự sinh vé chỉ từ event đó.

Cách khắc phục: **Booking Service phát lại event miền (domain event) của riêng mình** sau khi xử lý `PaymentSucceeded`, mang theo chi tiết order-item mà Ticket Service thực sự cần. Cách này giữ cho các event mà mỗi service phát ra chỉ giới hạn trong dữ liệu mà nó sở hữu — Payment Service không bao giờ cần biết về ghế hay loại vé.

```
Payment Service --PaymentSucceeded--> Booking Service
Booking Service --OrderPaid--> Ticket Service
Ticket Service  --TicketIssued--> Notification Service
```

Cách này cũng khắc phục một lỗ hổng thứ hai: luồng gốc không nói rõ Notification Service thực sự gửi gì khi nhận `PaymentSucceeded` — câu trả lời là email vé điện tử, thứ cần có ảnh QR, nên Notification Service nên chờ `TicketIssued` (có dữ liệu QR), thay vì kích hoạt ngay từ một event sớm hơn.

## Quy ước đặt tên & routing

- Exchange: 1 topic exchange cho mỗi service phát event (`user.events`, `event.events`, `booking.events`, `payment.events`, `ticket.events`), routing key = tên event.
- Quy ước đặt tên queue: `<consumer-service>.<event-name>` (ví dụ `ticket-service.order-paid`), để queue của mỗi consumer có thể được kiểm tra/replay độc lập.
- Mỗi envelope của event mang `{ eventId, occurredAt, payload }` — `eventId` (UUID) cho phép consumer loại bỏ trùng lặp khi bị gửi lại (RabbitMQ đảm bảo at-least-once delivery, không phải exactly-once). **Việc khử trùng không tự động xảy ra** — mỗi consumer phải tự ghi lại các `eventId` đã xử lý (bảng `processed_events` được ghi trong cùng transaction với handler) và mỗi handler phải idempotent; mỗi queue cần có một dead-letter exchange cho các message "độc" (poison message). Được thiết kế chi tiết ở [12-resilience-and-failure-design.md](12-resilience-and-failure-design.md) §2.4–2.5.

---

## Danh mục event

| Event | Được phát bởi | Được tiêu thụ bởi | Kích hoạt |
|---|---|---|---|
| `PaymentSucceeded` | Payment Service | Booking Service | Đơn hàng → `PAID` |
| `PaymentFailed` | Payment Service | Booking Service | Nhả hold ghế/số lượng, đơn hàng → `EXPIRED` |
| `OrderPaid` | Booking Service | Ticket Service, Notification Service | Ticket Service sinh vé QR; Notification gửi thông báo xác nhận đơn hàng |
| `TicketIssued` | Ticket Service | Notification Service | Gửi email vé điện tử (kèm QR) |
| `RefundApproved` | Payment Service | Booking Service | Đơn hàng → `CANCELED` |
| `OrderCanceled` | Booking Service | Event Service, Ticket Service | Event Service nhả ghế/khôi phục số lượng; Ticket Service đánh dấu vé `CANCELED` |

---

## Cấu trúc payload

```typescript
// libs/event-contracts/src/index.ts

interface EventEnvelope<T> {
  eventId: string;      // UUID, dùng để consumer khử trùng lặp
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

## Payload QR (Ticket Service)

`Ticket.qrPayload` (xem [07-database-schema.md](07-database-schema.md)) không phải là một chuỗi ngẫu nhiên — đó là một token đã ký, để một lượt quét check-in có thể được xác thực **offline** mà không cần round-trip tới database trước (đường nhanh - fast path), sau đó được xác nhận lại với DB (đường có thẩm quyền - authoritative path, phát hiện vé "đã dùng" và gian lận chéo sự kiện):

```typescript
interface QrPayload {
  ticketId: string;
  eventId: string;
  orderItemId: string;
  issuedAt: string;
}
// qrSignature = HMAC-SHA256(JSON.stringify(QrPayload), TICKET_SIGNING_SECRET)
// Ảnh QR mã hóa base64(QrPayload) + "." + qrSignature.
// Luồng check-in: tính lại HMAC cục bộ (loại ngay QR bị giả mạo/sửa đổi,
// không cần chạm DB) -> chỉ sau đó mới truy vấn Ticket Service để lấy trạng thái hiện tại
// (bắt được lỗi replay/quét trùng, điều mà chỉ kiểm tra chữ ký không phát hiện được).
```

---

*Tài liệu liên quan: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md, 12-resilience-and-failure-design.md*
