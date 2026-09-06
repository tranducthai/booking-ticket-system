# API CONTRACTS
## Online Event Ticketing System (similar to Ticketbox)

---

Endpoint list per service, matching the API Gateway path prefixes (`/user`, `/event`, `/booking`, `/payment`, `/ticket` — the gateway is the edge router, see [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md)) and the tables owned per [07-database-schema.md](07-database-schema.md). This is a working draft — exact DTOs get refined once implementation starts, but the shape/ownership below shouldn't change.

## Conventions

- **Auth**: `Authorization: Bearer <JWT>` issued by User Service. Gateway verifies the signature and forwards the decoded `{ userId, role }` to services via an internal header (`X-User-Id`, `X-User-Role`) — services trust the Gateway and don't re-verify JWTs themselves.
- **Pagination**: `?page=1&limit=20`, response wraps as `{ data: [...], page, limit, total }`.
- **Errors**: `{ statusCode, message, error }` (Nest's default `HttpException` shape).
- **Internal-only** endpoints are not exposed through the API Gateway — only called service-to-service on the internal overlay network.

---

## 1. User Service (`/user`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | none | Create an account (email/phone + password) |
| GET | `/auth/google` \| `/auth/facebook` | none | Redirect to the provider's consent screen (browser navigation, not XHR) |
| GET | `/auth/google/callback` \| `/auth/facebook/callback` | none | Provider's redirect back — find-or-create the User, then redirects into apps/web's `/oauth/callback` with tokens |
| POST | `/auth/login` | none | Log in, returns access + refresh token |
| POST | `/auth/refresh` | refresh token | Issue a new access token |
| GET | `/users/me` | customer+ | Current user's profile |
| PATCH | `/users/me` | customer+ | Update own profile |
| POST | `/organizers/apply` | customer | Apply to become an Organizer (sets a pending verification flag) |
| GET | `/users` | admin | List/search/filter users |
| PATCH | `/users/:id/lock` | admin | Lock or unlock an account |
| PATCH | `/users/:id/verify-organizer` | admin | Approve an organizer application |

---

## 2. Event Service (`/event`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/events` | none | Search/filter published events (category, location, date range, price range, keyword) |
| GET | `/events/:id` | none | Event details |
| POST | `/events` | organizer | Create an event (`status = DRAFT`) |
| PATCH | `/events/:id` | organizer (owner) | Edit event info |
| POST | `/events/:id/submit` | organizer (owner) | Submit for Admin approval (`status = PENDING_APPROVAL`) |
| PATCH | `/events/:id/approve` | admin | Approve (`status = PUBLISHED`) |
| PATCH | `/events/:id/reject` | admin | Reject with a reason (`status = REJECTED`) |
| GET | `/categories` | none | List categories |
| POST | `/categories` | admin | Create a category |
| POST | `/events/:id/ticket-types` | organizer (owner) | Add a ticket tier (General Admission events) |
| PATCH | `/ticket-types/:id` | organizer (owner) | Edit a ticket tier |
| POST | `/events/:id/seat-map` | organizer (owner) | Create/replace the seat map (zones + seat grid) |
| GET | `/events/:id/seat-map/layout` | none | Immutable structure (zones, rows, seat IDs, coords, zone price). CDN + Redis cached — see [04-deployment-design.md](04-deployment-design.md) §2a |
| GET | `/events/:id/seat-map/state` | none | Volatile per-seat status snapshot (Available/Held/Booked/Blocked). Served from the Redis snapshot rebuilt ~1/s; poll every 2–3 s |
| PATCH | `/seats/:id/block` | organizer (owner) | Mark a seat Blocked (broken/reserved) |
| POST | `/events/:id/discount-codes` | organizer (owner) | Create a discount code |
| GET | `/discount-codes/validate` | customer | `?eventId=&code=` — validate a code before checkout |
| POST | `/events/:id/favorite` \| DELETE `/events/:id/favorite` | customer | Save/unsave an event (wishlist) |
| GET | `/events/favorites/mine` | customer | My saved events, paginated |
| GET | `/events/favorites/ids` | customer | `?eventIds=a,b,c` — bulk membership check for a search-results grid |
| GET | `/internal/events/needing-reminder` | internal (Notification Service) | Published events starting in `?hoursBefore=±bandHours/2` with no reminder sent yet |
| POST | `/internal/events/:id/mark-reminder-sent` | internal | One-shot flag so the reminder cron doesn't resend |
| WS | `/events/:id/seat-map/subscribe` | none | Socket.IO namespace (optional — polling `/seat-map/state` is the default). Emits **one batched `seat:batch` frame per room per second**, not per-seat — see [04-deployment-design.md](04-deployment-design.md) §2a |
| POST | `/internal/seats/:id/hold` | internal (Booking Service) | Redis `SETNX` lock, TTL ~10 min, sets `status=HELD` |
| POST | `/internal/seats/:id/release` | internal | Releases a hold, `status=AVAILABLE` |
| POST | `/internal/seats/:id/confirm` | internal | Payment succeeded, `status=BOOKED` |
| POST | `/internal/ticket-types/:id/reserve` | internal | Decrement `quantityTotal` remaining / increment `quantitySold` for General Admission |
| POST | `/internal/ticket-types/:id/release` | internal | Reverse a reservation (hold expired/canceled) |

---

## 3. Booking Service (`/booking`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/cart/hold` | customer | `{ eventId, items: [{ ticketTypeId? \| seatId?, quantity }] }` → calls Event Service to hold seats/quantity, creates `Order` (`PENDING_PAYMENT`) |
| POST | `/orders/:id/apply-discount` | customer (owner) | `{ code }` → validates against Event Service, recalculates total |
| GET | `/orders/:id` | customer (owner) | Order detail |
| GET | `/orders` | customer | My orders, paginated |
| POST | `/orders/:id/cancel` | customer (owner) | Customer-initiated cancel before payment (releases the hold) |
| GET | `/orders` (admin/organizer view) | admin/organizer | Filter by event/status for dashboards |
| GET | `/orders/stats` | organizer/admin | `?eventId=` for one of the caller's own events (or any event as admin), omitted for admin-only system-wide stats. `?days=` window (default 30) — revenue, order/ticket counts, daily trend, top events (system-wide only) |

Booking Service exposes no refund endpoint — refunds are owned and served by Payment Service (see below); Booking only reacts to the resulting `RefundApproved`/`OrderCanceled` events (see [09-event-contracts.md](09-event-contracts.md)).

---

## 4. Payment Service (`/payment`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/payments` | customer | `{ orderId, method }` (`method` ∈ vnpay/momo/paypal) → creates a payment intent, returns the gateway redirect URL |
| POST | `/payments/webhook/:provider` | gateway signature | Server-to-server async callback (IPN) from the gateway confirming success/failure |
| GET | `/payments/return/:provider` | gateway redirect | Browser redirect back from the gateway's own checkout page; redirects on into apps/web with the outcome |
| GET | `/payments/:id` | customer (owner) | Payment status |
| POST | `/refunds` | customer | `{ orderId, reason }` — UC-04 refund request |
| GET | `/refunds` | organizer/admin | List refund requests (filterable by event/status) |
| PATCH | `/refunds/:id/approve` | organizer/admin | Approve → executes the refund via the gateway |
| PATCH | `/refunds/:id/reject` | organizer/admin | Reject with a reason |

---

## 5. Ticket Service (`/ticket`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tickets/mine` | customer | My tickets |
| GET | `/tickets/:id` | customer (owner) | Ticket detail incl. QR |
| POST | `/tickets/:id/check-in` | check-in staff | `{ qrPayload }` — validates & marks `USED` |
| GET | `/events/:id/attendees` | organizer (owner) | Export the attendee list |
| GET | `/internal/tickets/by-event/:eventId` | internal (Notification Service) | Distinct userIds holding a live (non-canceled) ticket — feeds the event-reminder cron |

---

## 6. Notification Service

No customer-facing REST API — mainly a broker consumer (see
[09-event-contracts.md](09-event-contracts.md)) plus one background poll:
`EventReminderService` periodically asks Event Service which published
events start soon (`/internal/events/needing-reminder`), pulls attendees
from Ticket Service, and emails each one once. Exposes only `/health` and
`/metrics` — no inbound HTTP routes of its own.

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md, 12-resilience-and-failure-design.md*
