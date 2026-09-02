# DATABASE SCHEMA
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

Schema cụ thể ở cấp field cho 13 bảng từ [03-system-design.md](03-system-design.md), viết dưới dạng bản nháp Prisma schema — mỗi block cho một service sở hữu, sẵn sàng đưa vào `apps/<service>/prisma/schema.prisma` làm điểm khởi đầu (xem [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md)). ID dùng UUID ở mọi nơi để tham chiếu luôn rõ ràng, không mập mờ giữa các ranh giới service, không cần sequence dùng chung.

Theo nguyên tắc **Database per Service**, một field như `userId` trên `Event` **không phải** là Prisma relation — đó là một cột thường lưu ID do service khác sở hữu. Không có foreign key ở tầng database xuyên service; chỉ có trong phạm vi schema riêng của từng service.

---

## 1. `user-service` — sở hữu `USERS`

```prisma
enum Role {
  CUSTOMER
  ORGANIZER
  ADMIN
}

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  phone         String?  @unique
  passwordHash  String?  // nullable: tài khoản chỉ dùng OAuth thì không có password
  fullName      String
  role          Role     @default(CUSTOMER)
  oauthProvider String?  // "google" | "facebook" | null
  oauthId       String?
  isOrganizerVerified Boolean @default(false) // do Admin set sau khi duyệt đơn xin làm organizer
  isLocked      Boolean  @default(false)
  emailVerifiedAt DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([email])
  @@index([role])
}
```

---

## 2. `event-service` — sở hữu `EVENTS`, `CATEGORIES`, `TICKET_TYPES`, `SEAT_MAPS`, `SEAT_ZONES`, `SEATS`, `DISCOUNT_CODES`

```prisma
enum TicketMode {
  GENERAL   // General Admission
  SEATMAP   // Seat Selection
}

enum EventStatus {
  DRAFT
  PENDING_APPROVAL
  PUBLISHED
  REJECTED
  CANCELED
}

enum SeatStatus {
  AVAILABLE
  HELD
  BOOKED
  BLOCKED
}

enum DiscountType {
  PERCENT
  FIXED
}

model Category {
  id     String  @id @default(uuid())
  name   String  @unique
  slug   String  @unique
  events Event[]
}

model Event {
  id             String      @id @default(uuid())
  organizerId    String      // chỉ chứa ID, tham chiếu vào user-service
  categoryId     String
  category       Category    @relation(fields: [categoryId], references: [id])
  title          String
  description    String?
  bannerUrl      String?
  venueName      String
  venueAddress   String
  startTime      DateTime
  endTime        DateTime
  ticketMode     TicketMode
  status         EventStatus @default(DRAFT)
  salesStartTime DateTime?
  salesEndTime   DateTime?
  refundPolicy   Json?       // { windowHours, feePercent, ... } — xem 01-business-analysis.md §6.4
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  ticketTypes   TicketType[]
  seatMap       SeatMap?
  discountCodes DiscountCode[]

  @@index([startTime])
  @@index([organizerId])
  @@index([status])
}

model TicketType {
  id            String    @id @default(uuid())
  eventId       String
  event         Event     @relation(fields: [eventId], references: [id])
  name          String    // "VIP", "Regular"
  price         Decimal   @db.Decimal(12, 2)
  quantityTotal Int
  quantitySold  Int       @default(0)
  salesStart    DateTime?
  salesEnd      DateTime?

  @@index([eventId])
}

model SeatMap {
  id      String     @id @default(uuid())
  eventId String     @unique
  event   Event      @relation(fields: [eventId], references: [id])
  zones   SeatZone[]
}

model SeatZone {
  id        String   @id @default(uuid())
  seatMapId String
  seatMap   SeatMap  @relation(fields: [seatMapId], references: [id])
  name      String   // "VIP", "Balcony"
  price     Decimal  @db.Decimal(12, 2)
  isGeneral Boolean  @default(false) // true = zone chỉ tính sức chứa, không có ghế lẻ (ví dụ khu đứng)
  capacity  Int?     // chỉ dùng khi isGeneral = true
  seats     Seat[]
}

model Seat {
  id        String     @id @default(uuid())
  zoneId    String
  zone      SeatZone   @relation(fields: [zoneId], references: [id])
  row       String
  number    String
  status    SeatStatus @default(AVAILABLE)

  @@unique([zoneId, row, number])
  @@index([zoneId])
  @@index([status])
}

model DiscountCode {
  id            String       @id @default(uuid())
  eventId       String
  event         Event        @relation(fields: [eventId], references: [id])
  code          String
  discountType  DiscountType
  value         Decimal      @db.Decimal(12, 2)
  quantityTotal Int
  quantityUsed  Int          @default(0)
  validFrom     DateTime?
  validTo       DateTime?

  @@unique([eventId, code])
}
```

**Lưu ý về `SEAT_HOLDS`:** như đã nêu ở [03-system-design.md](03-system-design.md), riêng `Seat.status = HELD` có thể bị "treo" nếu một process crash giữa chừng lúc update. Trạng thái giữ chỗ thật cùng TTL của nó nằm trong **Redis** (`seat:hold:<seatId>` → `{orderId, expiresAt}`, `SETNX` + `EXPIRE`), không nằm trong bảng này — `Seat.status` là một projection tối ưu cho đọc, được Booking Service đồng bộ qua các endpoint nội bộ hold/release/confirm (xem [08-api-contracts.md](08-api-contracts.md)). Không cần bảng `SEAT_HOLDS` riêng một khi Redis đã sở hữu TTL.

---

## 3. `booking-service` — sở hữu `ORDERS`, `ORDER_ITEMS`

```prisma
enum OrderStatus {
  PENDING_PAYMENT
  PAID
  TICKET_ISSUED
  CANCELED
  EXPIRED
}

model Order {
  id             String      @id @default(uuid())
  userId         String      // chỉ chứa ID, tham chiếu vào user-service
  eventId        String      // chỉ chứa ID, tham chiếu vào event-service (denormalize để tiện query)
  status         OrderStatus @default(PENDING_PAYMENT)
  subtotal       Decimal     @db.Decimal(12, 2)
  discountCode   String?
  discountAmount Decimal     @default(0) @db.Decimal(12, 2)
  totalAmount    Decimal     @db.Decimal(12, 2)
  expiresAt      DateTime?   // thời điểm hết hạn giữ chỗ cho cả đơn (mirror TTL của Redis)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  items OrderItem[]

  @@index([userId])
  @@index([status])
  @@index([eventId])
}

model OrderItem {
  id           String  @id @default(uuid())
  orderId      String
  order        Order   @relation(fields: [orderId], references: [id])
  ticketTypeId String? // chỉ chứa ID, tham chiếu vào event-service — có giá trị khi là General Admission
  seatId       String? // chỉ chứa ID, tham chiếu vào event-service — có giá trị khi là Seat Map
  price        Decimal @db.Decimal(12, 2) // snapshot tại thời điểm mua, không bao giờ đọc lại từ event-service
  quantity     Int     @default(1)        // chỉ có ý nghĩa khi ticketTypeId có giá trị; luôn là 1 với seatId

  @@index([orderId])
}
```

```sql
-- Prisma chưa thể khai báo CHECK constraint này (trước bản 5.x) — thêm qua raw migration:
ALTER TABLE "OrderItem"
  ADD CONSTRAINT chk_order_item_one_of
  CHECK (
    (ticket_type_id IS NOT NULL AND seat_id IS NULL) OR
    (ticket_type_id IS NULL AND seat_id IS NOT NULL)
  );
```

---

## 4. `payment-service` — sở hữu `PAYMENTS`, `REFUNDS`

```prisma
enum PaymentStatus {
  PENDING
  SUCCEEDED
  FAILED
}

enum RefundStatus {
  REQUESTED
  APPROVED
  REJECTED
  COMPLETED
}

model Payment {
  id                 String        @id @default(uuid())
  orderId            String        // chỉ chứa ID, tham chiếu vào booking-service
  amount             Decimal       @db.Decimal(12, 2)
  method             String        // "vnpay" | "momo" | "zalopay" | "card"
  status             PaymentStatus @default(PENDING)
  gatewayTxnId       String?
  gatewayRawResponse Json?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  refunds Refund[]

  @@index([orderId])
}

model Refund {
  id          String       @id @default(uuid())
  paymentId   String
  payment     Payment      @relation(fields: [paymentId], references: [id])
  orderId     String       // chỉ chứa ID, tham chiếu vào booking-service, denormalize để tra cứu
  reason      String
  amount      Decimal      @db.Decimal(12, 2)
  feeAmount   Decimal      @default(0) @db.Decimal(12, 2)
  status      RefundStatus @default(REQUESTED)
  requestedBy String       // userId
  decidedBy   String?      // userId của organizer/admin
  createdAt   DateTime     @default(now())
  decidedAt   DateTime?

  @@index([orderId])
  @@index([status])
}
```

---

## 5. `ticket-service` — sở hữu `TICKETS`

```prisma
enum TicketStatus {
  ISSUED
  USED
  CANCELED
}

model Ticket {
  id          String       @id @default(uuid())
  orderItemId String       @unique // chỉ chứa ID, tham chiếu vào booking-service, quan hệ 1-1
  eventId     String       // chỉ chứa ID, tham chiếu vào event-service, denormalize để tra cứu lúc check-in
  userId      String       // chỉ chứa ID, tham chiếu vào user-service, denormalize cho "vé của tôi"
  qrPayload   String       @unique // payload đã ký, mã hóa vào QR (xem 09-event-contracts.md)
  qrSignature String
  status      TicketStatus @default(ISSUED)
  checkedInAt DateTime?
  checkedInBy String?      // userId của staff
  createdAt   DateTime     @default(now())

  @@index([eventId])
  @@index([userId])
}
```

---

## 6. `notification-service` — không có bảng nghiệp vụ

Chỉ đơn thuần là consumer của broker (xem [09-event-contracts.md](09-event-contracts.md)); không cần schema. Nếu sau này cần audit trail cho việc gửi thông báo, có thể thêm bảng `NotificationLog` mà không ảnh hưởng đến service nào khác, vì không có service nào khác đọc nó.

---

## 7. Tham chiếu ID xuyên service — tra cứu nhanh

| Field | Nằm trong | Trỏ tới (chỉ ID, không FK ở tầng DB) |
|---|---|---|
| `Event.organizerId` | event-service | `User.id` (user-service) |
| `Order.userId` | booking-service | `User.id` (user-service) |
| `Order.eventId` | booking-service | `Event.id` (event-service) |
| `OrderItem.ticketTypeId` | booking-service | `TicketType.id` (event-service) |
| `OrderItem.seatId` | booking-service | `Seat.id` (event-service) |
| `Payment.orderId` | payment-service | `Order.id` (booking-service) |
| `Refund.orderId` | payment-service | `Order.id` (booking-service) |
| `Ticket.orderItemId` | ticket-service | `OrderItem.id` (booking-service) |
| `Ticket.eventId` | ticket-service | `Event.id` (event-service) |
| `Ticket.userId` | ticket-service | `User.id` (user-service) |

Tính nhất quán giữa các tham chiếu này được duy trì qua luồng event trong [09-event-contracts.md](09-event-contracts.md), không qua transaction — đây là hệ quả tất yếu của việc chọn Saga choreography ở [03-system-design.md](03-system-design.md).

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md, 12-resilience-and-failure-design.md*
