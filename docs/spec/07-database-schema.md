# DATABASE SCHEMA
## Online Event Ticketing System (similar to Ticketbox)

---

Concrete, field-level schema for the 13 tables from [03-system-design.md](03-system-design.md), written as Prisma schema drafts — one block per owning service, ready to drop into `apps/<service>/prisma/schema.prisma` as a starting point (see [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md)). IDs are UUIDs everywhere so references stay unambiguous across service boundaries with no shared sequence.

Per the **Database per Service** principle, a field like `userId` on `Event` is **not** a Prisma relation — it's a plain column holding an ID owned by another service. There is no database-level foreign key across services; only within a single service's own schema.

---

## 1. `user-service` — owns `USERS`

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
  passwordHash  String?  // nullable: OAuth-only accounts have no password
  fullName      String
  role          Role     @default(CUSTOMER)
  oauthProvider String?  // "google" | "facebook" | null
  oauthId       String?
  isOrganizerVerified Boolean @default(false) // set by Admin after reviewing an organizer application
  isLocked      Boolean  @default(false)
  emailVerifiedAt DateTime?
  passwordChangedAt DateTime? // set on reset (or when an unverified password is dropped on OAuth link); sign-out itself is done by revoking Sessions
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([email])
  @@index([role])
}

// Single-use "forgot password" token — only its SHA-256 is stored; 30 min TTL; a successful reset burns all of the user's outstanding tokens
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

// One row per signed-in device; every access/refresh token carries its id (`sid`).
// Redis key auth:session:<sid> ("active" | "revoked:<reason>") is what api-gateway checks
// on every request; this row is the durable record. One active session per user — a new
// login revokes the others ("replaced"). Refresh tokens rotate; presenting a rotated-out
// one (outside a 30 s grace window) revokes the session ("refresh_reuse").
model Session {
  id                   String    @id @default(uuid())
  userId               String
  user                 User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  method               String    // "password" | "register" | "google" | "facebook"
  refreshTokenHash     String    // SHA-256 of the one currently valid refresh token
  prevRefreshTokenHash String?   // the one rotated out last (grace window)
  rotatedAt            DateTime?
  ipAddress            String?
  userAgent            String?
  expiresAt            DateTime
  revokedAt            DateTime?
  revokedReason        String?   // "logout" | "replaced" | "password_reset" | "locked" | "refresh_reuse"
  createdAt            DateTime  @default(now())

  @@index([userId, revokedAt])
}

// Single-use, 60 s handoff from the OAuth callback redirect to apps/web (POST /auth/oauth/exchange) — only its SHA-256 is stored
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

## 2. `event-service` — owns `EVENTS`, `CATEGORIES`, `TICKET_TYPES`, `SEAT_MAPS`, `SEAT_ZONES`, `SEATS`, `DISCOUNT_CODES`

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
  organizerId    String      // ID-only reference into user-service
  categoryId     String
  category       Category    @relation(fields: [categoryId], references: [id])
  title          String
  description    String?
  bannerUrl      String?
  organizerName        String?  // "Ban tổ chức" section — per event, so one account can run several brands
  organizerLogoUrl     String?
  organizerDescription String?
  terms          String?     // event-specific terms & conditions
  minAge         Int?        // display only, not checked at check-in; null = all ages
  zoneMapUrl     String?     // image of the venue's ticket zones, shown above the tiers
  venueName      String
  venueAddress   String
  startTime      DateTime
  endTime        DateTime
  ticketMode     TicketMode
  status         EventStatus @default(DRAFT)
  salesStartTime DateTime?
  salesEndTime   DateTime?
  refundPolicy   Json?       // RefundPolicy in libs/event-contracts: { customerRefundable, tiers, evidenceRequiredFor?, autoApprove? } — autoApprove: eligible requests are approved & paid out at once
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  ticketTypes   TicketType[]
  seatMap       SeatMap?
  discountCodes DiscountCode[]

  @@index([startTime])
  @@index([organizerId])
  @@index([status])
}

// One performance of a multi-date event; each has its own ticket types (inventory).
// Event.startTime/endTime = span of all showtimes. GENERAL events only.
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
  showtimeId    String?   // set when the event has showtimes
  name          String    // "VIP", "Regular"
  price         Decimal   @db.Decimal(12, 2)
  quantityTotal Int
  quantitySold  Int       @default(0)
  salesStart    DateTime?
  salesEnd      DateTime?
  description   String?   // what the tier includes; shown under it on the event page
  minPerOrder   Int       @default(1)  // per-ORDER bounds, enforced at reserve time; isHidden = off sale & not listed publicly
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
  isGeneral Boolean  @default(false) // true = capacity-only zone, no individual seats (e.g. standing area)
  capacity  Int?     // used only when isGeneral = true
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

**Note on `SEAT_HOLDS`:** as flagged in [03-system-design.md](03-system-design.md), `Seat.status = HELD` alone can get "stuck" if a process crashes mid-update. The actual hold state with its TTL lives in **Redis** (`seat:hold:<seatId>` → `{orderId, expiresAt}`, `SETNX` + `EXPIRE`), not in this table — `Seat.status` is a read-optimized projection kept in sync by the Booking Service via the internal hold/release/confirm endpoints (see [08-api-contracts.md](08-api-contracts.md)). No separate `SEAT_HOLDS` table is needed once Redis owns the TTL.

---

## 3. `booking-service` — owns `ORDERS`, `ORDER_ITEMS`

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
  userId         String      // ID-only reference into user-service
  eventId        String      // ID-only reference into event-service (denormalized for query convenience)
  status         OrderStatus @default(PENDING_PAYMENT)
  subtotal       Decimal     @db.Decimal(12, 2)
  discountCode   String?
  discountAmount Decimal     @default(0) @db.Decimal(12, 2)
  totalAmount    Decimal     @db.Decimal(12, 2)
  refundedAmount Decimal     @default(0) @db.Decimal(12, 2) // sum of per-ticket refunds so far — revenue = totalAmount - refundedAmount
  expiresAt      DateTime?   // hold expiry for the whole order (mirrors the Redis TTL)
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
  ticketTypeId String? // ID-only reference into event-service — set for General Admission
  seatId       String? // ID-only reference into event-service — set for Seat Map
  price        Decimal @db.Decimal(12, 2) // snapshot at purchase time, never re-read from event-service
  quantity     Int     @default(1)        // 1 per admission (one ticket/QR each, cancelable one by one); older GA rows may be > 1
  refundedAt   DateTime?                  // this ticket was paid back (per-ticket refund); the order is CANCELED only once every item is

  @@index([orderId])
}
```

```sql
-- Prisma can't express this CHECK constraint declaratively (pre-5.x) — add via a raw migration:
ALTER TABLE "OrderItem"
  ADD CONSTRAINT chk_order_item_one_of
  CHECK (
    (ticket_type_id IS NOT NULL AND seat_id IS NULL) OR
    (ticket_type_id IS NULL AND seat_id IS NOT NULL)
  );
```

---

## 4. `payment-service` — owns `PAYMENTS`, `REFUNDS`

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
  orderId            String        // ID-only reference into booking-service
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
  orderId     String       // ID-only reference into booking-service, denormalized for lookup
  orderItemIds String[]    // the tickets (order items) this refund pays back; empty = the whole order. An order may have several Refunds; a ticket belongs to at most one open/completed one
  reason      String
  amount      Decimal      @db.Decimal(12, 2)
  feeAmount   Decimal      @default(0) @db.Decimal(12, 2)
  status      RefundStatus @default(REQUESTED)
  requestedBy String       // userId
  decidedBy   String?      // organizer/admin userId
  createdAt   DateTime     @default(now())
  decidedAt   DateTime?

  @@index([orderId])
  @@index([status])
}
```

---

## 5. `ticket-service` — owns `TICKETS`

```prisma
enum TicketStatus {
  ISSUED
  USED
  CANCELED
}

model Ticket {
  id          String       @id @default(uuid())
  orderItemId String       @unique // ID-only reference into booking-service, 1-to-1
  eventId     String       // ID-only reference into event-service, denormalized for check-in lookups
  userId      String       // ID-only reference into user-service, denormalized for "my tickets"
  qrPayload   String       @unique // signed payload encoded into the QR (see 09-event-contracts.md)
  qrSignature String
  status      TicketStatus @default(ISSUED)
  checkedInAt DateTime?
  checkedInBy String?      // staff userId
  createdAt   DateTime     @default(now())

  @@index([eventId])
  @@index([userId])
}
```

---

## 6. `notification-service` — no business table

Purely a broker consumer (see [09-event-contracts.md](09-event-contracts.md)); no schema needed. If a delivery audit trail is wanted later, a `NotificationLog` table can be added without affecting any other service, since nothing else reads it.

---

## 7. Cross-service ID references — quick lookup

| Field | Lives in | Points to (ID-only, no DB-level FK) |
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

Consistency across these is maintained through the event flow in [09-event-contracts.md](09-event-contracts.md), not through transactions — this is the practical consequence of choosing Saga choreography in [03-system-design.md](03-system-design.md).

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md, 12-resilience-and-failure-design.md*
