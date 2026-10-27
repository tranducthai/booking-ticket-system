# API CONTRACTS
## Online Event Ticketing System (similar to Ticketbox)

---

Endpoint list per service, matching the API Gateway path prefixes (`/user`, `/event`, `/booking`, `/payment`, `/ticket` — the gateway is the edge router, see [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md)) and the tables owned per [07-database-schema.md](07-database-schema.md). This is a working draft — exact DTOs get refined once implementation starts, but the shape/ownership below shouldn't change.

## Conventions

- **Auth**: `Authorization: Bearer <JWT>` issued by User Service. Gateway verifies the signature **and that the token's session (`sid` claim) is still active** in Redis, then forwards the decoded `{ userId, role }` to services via an internal header (`X-User-Id`, `X-User-Role`) — services trust the Gateway and don't re-verify JWTs themselves. One active session per account: a new login signs the previous device out. A rejected token gets `401 { ..., code }` with `code` = `TOKEN_INVALID` \| `SESSION_REVOKED` \| `SESSION_REPLACED` (signed in elsewhere); `503` if the session store is unreachable (fails closed).
- **Pagination**: `?page=1&limit=20`, response wraps as `{ data: [...], page, limit, total }`.
- **Errors**: `{ statusCode, message, error }` (Nest's default `HttpException` shape).
- **Internal-only** endpoints are not exposed through the API Gateway — only called service-to-service on the internal overlay network.

---

## 1. User Service (`/user`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | none | Create an account (email/phone + password) |
| GET | `/auth/google` \| `/auth/facebook` | none | Redirect to the provider's consent screen (browser navigation, not XHR) |
| GET | `/auth/google/callback` \| `/auth/facebook/callback` | none | Provider's redirect back — checks the `state` cookie, find-or-create the User (an existing account is only linked when the provider verified the email), then redirects into apps/web's `/oauth/callback?code=<one-time code>`; failures go to `/login?loi=<code>` |
| POST | `/auth/oauth/exchange` | none | `{ code }` (single-use, 60 s) → access + refresh token, like login |
| POST | `/auth/login` | none | Log in, returns access + refresh token; revokes the user's other session |
| POST | `/auth/refresh` | refresh token | Rotate: returns a new access + refresh token pair; the old refresh token stops working. Re-presenting a rotated-out one revokes the session |
| POST | `/auth/logout` | refresh token | `{ refreshToken }` → `200 { ok: true }`; revokes the session, so its access token is rejected immediately |
| POST | `/auth/forgot-password` | none | `{ email }` → always `200 { ok: true }` (no account enumeration). Emails a single-use link valid 30 min; max one email/account/minute |
| POST | `/auth/reset-password` | none | `{ token, newPassword }` (token = 64 hex from the link, password ≥ 8) → `200 { ok: true }`; burns every outstanding reset token and signs out all sessions. `400` if invalid/used/expired |
| GET | `/users/me` | customer+ | Current user's profile |
| PATCH | `/users/me` | customer+ | Update own profile |
| POST | `/organizers/apply` | customer | Apply to become an Organizer (sets a pending verification flag) |
| GET | `/users` | admin | List/search/filter users |
| PATCH | `/users/:id/lock` | admin | Lock or unlock an account |
| PATCH | `/users/:id/verify-organizer` | admin | Approve an organizer application |
| POST | `/partner-invites` | admin | Invite a partner organizer by email (`{ email, fullName, phone? }`). Stores a single-use token (SHA-256 only, 7 days) and emails the link; **no account exists yet**. Re-inviting the same email replaces the earlier link; `409` if the email is already registered |
| GET | `/partner-invites/preview` | none | `?token=` → `{ email, fullName }` for the set-password page; `400` if invalid/used/expired |
| POST | `/partner-invites/accept` | none | `{ token, password }` → creates the ORGANIZER account (verified, email confirmed) in one transaction and burns the token; the partner then logs in normally |
| PATCH | `/users/:id/partner` | admin | Edit a partner organizer's `fullName`, `phone` (`null` clears), `avatarUrl`, `organizerDescription`. The email (login) is not editable; `404` unless the target is an ORGANIZER |

---

## 2. Event Service (`/event`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/events` | none | Search/filter published events (category, location, date range, price range, keyword) |
| GET | `/events/:id` | none | Event details (incl. `showtimes` and their `ticketTypes`) |
| GET | `/events/:id/recommendations` | none | "You may also like" — hybrid recommender: TF-IDF content similarity + item-item co-favorites + city/price/date signals, Redis-cached 10 min |
| GET | `/media/config` | none | `{ uploadEnabled, maxBytes }` — whether Supabase Storage is configured (web hides the upload button otherwise) |
| POST | `/media/images` | user | `multipart/form-data` `file` + `kind` (`banner`/`logo`/`zone-map`/`avatar`/`artist`/`content`) → `{ url }`. Content-sniffed JPG/PNG/WEBP/GIF, ≤5MB, stored in the public Supabase bucket `media` at `<kind>/<userId>/<uuid>.<ext>`. The returned CDN URL is then saved into `bannerUrl`/`avatarUrl`/... like a pasted link |
| GET | `/events/admin` | admin | Every event, any status, filterable (`status`, `q`, `organizerId`), with tickets sold/total |
| POST | `/events/:id/showtimes` | organizer (owner) / admin | Add one or many performances (`items[]`, optional `copyTicketTypesFrom`); GENERAL events only |
| DELETE | `/showtimes/:id` | organizer (owner) / admin | Remove an unsold performance |
| POST | `/events` | organizer | Create an event (`status = DRAFT`) |
| PATCH | `/events/:id` | organizer (owner) / admin | Edit event info (admins may also `POST /events` with `organizerId` to create on a partner's behalf). Once `PUBLISHED`, `startTime`/`endTime` are locked for everyone (use postpone) and the venue fields (`venueName`, `venueAddress`, `isOnline`, `province`, `ward`, `streetAddress`) are editable by an **admin only** |
| POST | `/events/:id/submit` | organizer (owner) | Submit for Admin approval (`status = PENDING_APPROVAL`) |
| PATCH | `/events/:id/approve` | admin | Approve (`status = PUBLISHED`) |
| PATCH | `/events/:id/reject` | admin | Reject with a reason (`status = REJECTED`) |
| GET | `/categories` | none | List categories |
| POST | `/categories` | admin | Create a category |
| POST | `/events/:id/ticket-types` | organizer (owner) | Add a ticket tier (General Admission events) |
| PATCH | `/ticket-types/:id` | organizer (owner) | Edit a ticket tier |
| POST | `/events/:id/seat-map` | organizer (owner) / admin | Create/replace the seat map (zones + seat grid). Canvas mode may carry `canvas.rowLabels` (by grid row) for halls whose lettering isn't A, B, C… (e.g. skips F and J); frozen once any seat is held/booked |
| GET | `/events/:id/seat-map/layout` | none | Immutable structure (zones, rows, seat IDs, coords, zone price). CDN + Redis cached — see [04-deployment-design.md](04-deployment-design.md) §2a |
| GET | `/events/:id/seat-map/state` | none | Volatile per-seat status snapshot (Available/Held/Booked/Blocked). Served from the Redis snapshot rebuilt ~1/s; poll every 2–3 s |
| PATCH | `/seats/:id/block` | organizer (owner) | Mark a seat Blocked (broken/reserved) |
| POST | `/events/:id/discount-codes` | organizer (owner) | Create a discount code |
| GET | `/discount-codes/validate` | customer | `?eventId=&code=` — validate a code before checkout |
| POST | `/events/:id/favorite` \| DELETE `/events/:id/favorite` | customer | Save/unsave an event (wishlist) |
| GET | `/events/favorites/mine` | customer | My saved events, paginated |
| GET | `/events/favorites/ids` | customer | `?eventIds=a,b,c` — bulk membership check for a search-results grid |
| POST | `/artists` | organizer / admin | Create an artist. An organizer's is `PENDING` until an admin approves; an **admin must send `organizerId`** (the partner it belongs to) and the artist is approved + verified at once |
| POST | `/artists/:id/follow` \| DELETE `/artists/:id/follow` | customer | Follow / unfollow an artist. **Customers only** (`403` for organizer/admin); `GET /artists/:id/viewer` returns `canFollow` |
| GET | `/captcha/challenge` | user | Slider-puzzle captcha: `{ challengeId, background, piece, width, height, pieceSize, pieceY }` — a photo with a gap and the piece to slide into it. The gap position never leaves the server. ≤30 challenges/min/user |
| POST | `/captcha/verify` | user | `{ challengeId, x }` (px the piece was slid) → `{ token, expiresIn }` (single-use, 5 min, bound to the user). One try per challenge; ±6 px tolerance; answers faster than 0.7 s are rejected. `400` with `code` = `CAPTCHA_WRONG` \| `CAPTCHA_EXPIRED` |
| POST | `/internal/captcha/consume` | internal (Booking Service) | `{ token, userId }` → `{ ok }` — spends the token (single use) |
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
| POST | `/cart/hold` | customer | `{ eventId, items: [{ ticketTypeId? \| seatId?, quantity }] }` → calls Event Service to hold seats/quantity, creates `Order` (`PENDING_PAYMENT`). Needs header `x-captcha-token` (from the slider captcha); without a valid one: `403 { code: "CAPTCHA_REQUIRED" }`. `CAPTCHA_ENABLED=false` turns the gate off; trusted tooling (seeder, k6) may send `x-captcha-bypass: <CAPTCHA_BYPASS_KEY>` |
| GET | `/resale/listings` | none | Marketplace: ACTIVE resale listings (`?eventId=`, paginated), never the seller's identity |
| GET | `/resale/listings/:id` | none | One listing for its detail page (any status except `CANCELED`; `404` otherwise) |
| POST | `/resale/listings` | customer | `{ ticketId, price }` — list your ticket; price is an integer **> 0 and ≤ the face price** (no other minimum) |
| POST | `/resale/listings/:id/buy` | customer | Reserve the ticket and open a `RESALE` order to pay at `/checkout/:orderId`; needs `x-captcha-token` like `/cart/hold` |
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
| POST | `/payments` | customer | `{ orderId, method }` (`method` ∈ vnpay/momo/paypal/sepay) → creates a payment intent, returns the gateway redirect URL (for `sepay` — real-money bank transfer via VietQR — a URL back into apps/web's checkout page, which shows the QR) |
| POST | `/payments/webhook/:provider` | gateway signature (SePay: `Authorization: Apikey …`) | Server-to-server async callback (IPN) from the gateway confirming success/failure; SePay calls it for every movement on the linked bank account, unmatched ones are acknowledged and ignored |
| GET | `/payments/return/:provider` | gateway redirect | Browser redirect back from the gateway's own checkout page; redirects on into apps/web with the outcome |
| GET | `/payments/:id` | customer (owner) | Payment status; a PENDING `sepay` payment also carries `bankTransfer` (QR image URL, account, amount, transfer content) |
| GET | `/refunds/quote` | customer | `?orderId&orderItemIds=a,b&reasonCategory` → what those exact tickets would get back (pro rata on what was paid, discount included), plus `autoApprove` |
| POST | `/refunds` | customer | `{ orderId, orderItemIds?, reasonCategory?, reason }` + evidence files — UC-04 per-ticket cancellation (omitted `orderItemIds` = every remaining ticket). If the event has `refundPolicy.autoApprove` and the reason needs no evidence: approved and paid out at once, otherwise it waits for the organizer |
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
