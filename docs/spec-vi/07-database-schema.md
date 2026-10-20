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
  passwordChangedAt DateTime? // ghi khi đặt lại mật khẩu (hoặc khi bỏ mật khẩu chưa xác minh lúc liên kết OAuth); việc đăng xuất do thu hồi Session đảm nhận
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([email])
  @@index([role])
}

// Token "quên mật khẩu" dùng một lần — chỉ lưu SHA-256 của token; hết hạn sau 30 phút; đặt lại thành công sẽ huỷ mọi token còn lại của user
model PasswordResetToken {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId, createdAt])
}

// Mỗi thiết bị đang đăng nhập là một dòng; mọi access/refresh token đều mang id này (`sid`).
// Key Redis auth:session:<sid> ("active" | "revoked:<lý do>") là thứ api-gateway kiểm tra ở
// mỗi request; dòng này là bản ghi lâu dài. Mỗi user chỉ có một phiên hoạt động — đăng nhập
// mới sẽ thu hồi các phiên khác ("replaced"). Refresh token được xoay vòng; dùng lại token đã
// bị thay (ngoài khoảng ân hạn 30 giây) sẽ thu hồi cả phiên ("refresh_reuse").
model Session {
  id                   String    @id @default(uuid())
  userId               String
  user                 User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  method               String    // "password" | "register" | "google" | "facebook"
  refreshTokenHash     String    // SHA-256 của refresh token duy nhất đang hợp lệ
  prevRefreshTokenHash String?   // token vừa bị thay gần nhất (khoảng ân hạn)
  rotatedAt            DateTime?
  ipAddress            String?
  userAgent            String?
  expiresAt            DateTime
  revokedAt            DateTime?
  revokedReason        String?   // "logout" | "replaced" | "password_reset" | "locked" | "refresh_reuse"
  createdAt            DateTime  @default(now())

  @@index([userId, revokedAt])
}

// Mã trao tay dùng một lần, hiệu lực 60 giây, từ redirect OAuth callback sang apps/web (POST /auth/oauth/exchange) — chỉ lưu SHA-256
model OAuthLoginCode {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  codeHash  String    @unique
  method    String    // "google" | "facebook"
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
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
  organizerName        String?  // mục "Ban tổ chức" — theo từng sự kiện, để một tài khoản chạy được nhiều thương hiệu
  organizerLogoUrl     String?
  organizerDescription String?
  terms          String?     // điều khoản riêng của sự kiện
  minAge         Int?        // chỉ hiển thị, không kiểm tra khi check-in; null = mọi lứa tuổi
  zoneMapUrl     String?     // ảnh sơ đồ khu vực / hạng vé, hiển thị phía trên danh sách hạng vé
  venueName      String
  venueAddress   String
  startTime      DateTime
  endTime        DateTime
  ticketMode     TicketMode
  status         EventStatus @default(DRAFT)
  salesStartTime DateTime?
  salesEndTime   DateTime?
  refundPolicy   Json?       // RefundPolicy trong libs/event-contracts: { customerRefundable, tiers, evidenceRequiredFor?, autoApprove? } — autoApprove: yêu cầu hợp lệ được duyệt & hoàn tiền ngay
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  ticketTypes   TicketType[]
  seatMap       SeatMap?
  discountCodes DiscountCode[]

  @@index([startTime])
  @@index([organizerId])
  @@index([status])
}

// Một suất diễn của sự kiện nhiều ngày; mỗi suất có hạng vé (tồn kho) riêng.
// Event.startTime/endTime = khoảng thời gian của tất cả các suất. Chỉ cho sự kiện GENERAL.
model Showtime {
  id        String   @id @default(uuid())
  eventId   String
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  startTime DateTime
  endTime   DateTime
  ticketTypes TicketType[]

  @@index([eventId, startTime])
}

model TicketType {
  id            String    @id @default(uuid())
  eventId       String
  event         Event     @relation(fields: [eventId], references: [id])
  showtimeId    String?   // có khi sự kiện có nhiều suất diễn
  name          String    // "VIP", "Regular"
  price         Decimal   @db.Decimal(12, 2)
  quantityTotal Int
  quantitySold  Int       @default(0)
  salesStart    DateTime?
  salesEnd      DateTime?
  description   String?   // quyền lợi của hạng vé, hiển thị dưới hạng vé trên trang sự kiện
  minPerOrder   Int       @default(1)  // giới hạn theo TỪNG ĐƠN, kiểm tra lúc giữ vé; isHidden = chưa mở bán & không hiển thị công khai
  maxPerOrder   Int?
  isHidden      Boolean   @default(false)

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
  refundedAmount Decimal     @default(0) @db.Decimal(12, 2) // tổng đã hoàn qua các lần hoàn từng vé — doanh thu = totalAmount - refundedAmount
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
  quantity     Int     @default(1)        // 1 cho mỗi vé (mỗi vé một QR, hủy được từng vé); dòng GA cũ có thể > 1
  refundedAt   DateTime?                  // vé này đã được hoàn (hoàn theo từng vé); đơn chỉ CANCELED khi mọi vé đã hoàn

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
  orderItemIds String[]    // các vé (order item) mà lần hoàn này trả tiền; rỗng = cả đơn. Một đơn có thể có nhiều Refund, mỗi vé chỉ thuộc một Refund đang mở/đã hoàn
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
