# IMPLEMENTATION ROADMAP
## Online Event Ticketing System (similar to Ticketbox)

---

Checklist form so progress can be tracked directly in git history — check a box, commit, move to the next. Each phase should land as its own commit (or a few small ones), never one giant commit at the end. Ordered so each phase only depends on phases above it being usable (not necessarily "finished").

**Open question before Phase 0:** no frontend framework has been decided anywhere in the spec docs — everything so far (01-10) is backend-only. If a frontend is in scope for the defense, it needs its own stack decision (likely React/Next, given the NestJS/TypeScript choice in [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md)) and its own phase. Flagging this now rather than assuming.

---

## Phase 0 — Monorepo scaffolding

- [ ] `pnpm-workspace.yaml` + root `package.json` (shared devDependencies: TypeScript, ESLint, Prettier, Jest config)
- [ ] `apps/api-gateway`, `apps/user-service`, `apps/event-service`, `apps/booking-service`, `apps/payment-service`, `apps/ticket-service`, `apps/notification-service` — each a fresh `nest new` skeleton
- [ ] `libs/event-contracts` package — paste in the interfaces from [09-event-contracts.md](09-event-contracts.md)
- [ ] `infra/docker-compose.yml` — Postgres × 5 (one per service that owns tables), Redis, RabbitMQ, all 7 apps
- [ ] `.env.example` per service (DB URL, Redis URL, RabbitMQ URL, JWT secret, ports)
- [ ] Root `README.md` — how to run `docker compose up`, where each doc lives

**Commit checkpoint:** empty-but-running skeleton, `docker compose up` boots all 7 services + infra with no errors.

---

## Phase 1 — User Service (auth foundation)

Everything else needs JWTs, so this goes first.

- [ ] Prisma schema: `User` model from [07-database-schema.md](07-database-schema.md) §1, migration
- [ ] `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` per [08-api-contracts.md](08-api-contracts.md) §1
- [ ] JWT strategy (`passport-jwt`) + role guard (`CUSTOMER`/`ORGANIZER`/`ADMIN`)
- [ ] `GET/PATCH /users/me`
- [ ] Unit tests for auth flows (register duplicate email, wrong password, token refresh)
- [ ] *(stretch, can defer)* OAuth Google/Facebook

**Commit checkpoint:** can register, log in, get back a JWT that decodes correctly.

---

## Phase 2 — API Gateway skeleton

- [ ] Reverse-proxy routing to User Service (`/user/*`)
- [ ] JWT verification middleware — decodes the token, forwards `X-User-Id` / `X-User-Role` headers downstream, rejects invalid/expired tokens
- [ ] Wire the path-prefix → service map from [08-api-contracts.md](08-api-contracts.md) (`/user`, `/event`, `/booking`, `/payment`, `/ticket`) into the gateway's proxy config — the gateway is the edge router (no separate Ingress under Swarm)

**Commit checkpoint:** hitting the gateway's `/user/auth/login` proxies through correctly with a real JWT round-trip.

---

## Phase 3 — Event Service

- [ ] Prisma schema: `Category`, `Event`, `TicketType`, `SeatMap`, `SeatZone`, `Seat`, `DiscountCode` from [07-database-schema.md](07-database-schema.md) §2
- [ ] Event CRUD + submit/approve/reject flow (UC-03, UC-08)
- [ ] Category endpoints
- [ ] Ticket type CRUD (General Admission)
- [ ] Seat map builder endpoints (zones + row/column seat grid)
- [ ] Search/filter endpoint (UC-06) — category, location, date range, price range, keyword
- [ ] Discount code CRUD + validate endpoint (UC-07)
- [ ] Internal hold/release/confirm endpoints (Redis `SETNX` + TTL ~10 min, per [09-event-contracts.md](09-event-contracts.md) QR/hold design and [01-business-analysis.md](01-business-analysis.md) §5)
- [ ] WebSocket gateway (`Socket.IO`) broadcasting seat status changes per event room
- [ ] Concurrency test: 2 simultaneous hold requests for the same seat → exactly one wins

**Commit checkpoint:** an event with a seat map can be created, browsed, and a seat held/released with a visible TTL in Redis.

---

## Phase 4 — Booking Service

- [ ] Prisma schema: `Order`, `OrderItem` from [07-database-schema.md](07-database-schema.md) §3 (+ the raw-SQL CHECK constraint migration)
- [ ] `POST /cart/hold` — calls Event Service's internal hold endpoint, creates the `Order`
- [ ] Discount application, order retrieval/listing, customer-initiated cancel
- [ ] RabbitMQ consumer: `PaymentSucceeded` → `Order.status = PAID`, publish `OrderPaid`
- [ ] RabbitMQ consumer: `PaymentFailed` → release the hold via Event Service, `Order.status = EXPIRED`
- [ ] RabbitMQ consumer: `RefundApproved` → `Order.status = CANCELED`, publish `OrderCanceled`
- [ ] Scheduled job: sweep expired holds that never got a payment attempt at all

**Commit checkpoint:** full hold → (simulated) payment event → order status transition works end-to-end without Payment Service existing yet (publish the event manually via the RabbitMQ management UI to test).

---

## Phase 5 — Payment Service

- [ ] Prisma schema: `Payment`, `Refund` from [07-database-schema.md](07-database-schema.md) §4
- [ ] `POST /payments` — integrate one sandbox gateway first (VNPay sandbox is the most commonly documented for VN student projects)
- [ ] Webhook handler, signature verification per the provider's docs
- [ ] Publish `PaymentSucceeded` / `PaymentFailed`
- [ ] Refund request/approve/reject endpoints (UC-04), publish `RefundApproved` on completion

**Commit checkpoint:** a real (sandbox) payment round-trip updates Booking Service's order status via the broker, no manual event injection needed anymore.

---

## Phase 6 — Ticket Service

- [ ] Prisma schema: `Ticket` from [07-database-schema.md](07-database-schema.md) §5
- [ ] RabbitMQ consumer: `OrderPaid` → generate one signed QR per order item (HMAC scheme from [09-event-contracts.md](09-event-contracts.md)), publish `TicketIssued`
- [ ] `POST /tickets/:id/check-in` (UC-02) — signature verify (offline-safe) then DB status check
- [ ] RabbitMQ consumer: `OrderCanceled` → `Ticket.status = CANCELED`
- [ ] `GET /tickets/mine`, `GET /events/:id/attendees`

**Commit checkpoint:** a paid order produces a scannable QR, and check-in correctly rejects a second scan of the same ticket.

---

## Phase 7 — Notification Service

- [ ] RabbitMQ consumer: `TicketIssued` → send the e-ticket email with the QR attached
- [ ] Local dev: use Mailhog or Ethereal instead of a real SMTP provider so email sending is testable without external accounts

**Commit checkpoint:** the full UC-01 happy path, watched end-to-end, ends with an email landing in Mailhog.

---

## Phase 8 — Cross-cutting hardening

- [ ] Swagger (`@nestjs/swagger`) on all 6 services, cross-checked against [08-api-contracts.md](08-api-contracts.md)
- [ ] Centralized error envelope + validation pipe (`class-validator`) on every service
- [ ] Basic integration test per Saga path (happy path + payment-failed path + refund path) against docker-compose infra

---

## Phase 8b — Read-path scaling (login + browse + seat map)

Implements the read-path capacity design in [04-deployment-design.md](04-deployment-design.md) §2a — the flash-sale read burst (~6,000 req/s) that the write-path design doesn't cover.

- [ ] API Gateway: per-route rate-limit config; strict limit on `/user/auth/login` (e.g. 5/min/IP, 20/min/account); exponential backoff after N failed logins in User Service
- [ ] Auth burst handling ([04-deployment-design.md](04-deployment-design.md) §2a, "login burst itself is large"): client silently `POST /auth/refresh` at T0 instead of showing a login form; User Service login tasks at 1–2 vCPU + `UV_THREADPOOL_SIZE=8`, bounded bcrypt work queue with `503` shed; scheduled pre-scale of User Service before a known on-sale; CAPTCHA on the login form for `high_demand` windows
- [ ] Event Service: Redis read-through cache module — `event:{id}` (TTL 15–30 s), `search:{queryKey}` (TTL 10 s); cache-bust hooks in `events.update/approve/reject`
- [ ] Event Service: split `getSeatMap` → `getSeatMapLayout` (cached in `seatmap:layout:{eventId}`, busted on `createOrReplace`) + `getSeatMapState` (reads the Redis snapshot only)
- [ ] Remove the `healStaleHolds` call from the seat-map read path
- [ ] `SeatSnapshotJob` — per active event, 1 s tick: rebuild `seatmap:state:{eventId}` from Redis holds + booked-set, compute the diff, emit **one** batched `seat:batch` WS frame per room
- [ ] `HoldsService`: stop emitting `broadcastSeatUpdate` per seat — write the change to Redis and let `SeatSnapshotJob` fan it out
- [ ] `StaleHoldSweeper` cron (30–60 s) — reconcile `SEATS.status` in Postgres against expired Redis holds
- [ ] Client seat map: poll `GET /event/:id/seat-map/state` every 2–3 s by default; Socket.IO + `@socket.io/redis-adapter` only if the realtime path is kept for the demo
- [ ] `events.high_demand` boolean + waiting-room middleware that gates the event-page routes (not only checkout) when set
- [ ] Waiting-room overload guards ([04-deployment-design.md](04-deployment-design.md) §2, "arrivals far exceed capacity"): queue-length cap at ~3× remaining inventory (reject new entries past it), sticky one-token-per-session, position/ETA in the queue response, `503` + `Retry-After` load-shed past edge capacity
- [ ] Load test (Phase 10 k6 script) the read path specifically: cache hit ratio, origin Postgres req/s, seat-map state latency under 20k virtual users

**Commit checkpoint:** with the cache + snapshot job running, a k6 run of 5,000 virtual users hitting one event's detail + seat map holds origin Postgres under ~50 req/s and seat-map state p95 under ~50 ms.

---

## Phase 8c — Resilience & failure handling

Implements [12-resilience-and-failure-design.md](12-resilience-and-failure-design.md). Correctness-critical items first.

**Oversell / correctness (do first — these are bugs in the current code):**
- [ ] Ownership-checked `confirmSeat(seatId, orderId)` and `releaseSeat(seatId, orderId)` via a Redis Lua script (`GET == orderId` before `DEL`); on a lost hold at confirm, fire a compensating auto-refund instead of `BOOKED`
- [ ] Hold extension on payment start: `POST /internal/seats/:id/extend-hold` (capped once) + order flag `PAYMENT_IN_PROGRESS` so the sweeper skips it
- [ ] Atomic multi-seat hold: acquire the seat-key set in one Lua script, roll back partial acquisitions on failure
- [ ] Per-consumer idempotency: `processed_events` table written in the handler transaction; ticket generation `INSERT ... ON CONFLICT (orderItemId) DO NOTHING`
- [ ] GA inventory: make `releaseTicketType` idempotent (track `reservationReleased` on the order)
- [ ] Discount codes: add an atomic `redeem` (`UPDATE ... WHERE quantityUsed < quantityTotal`) at order-confirm + guarded release on cancel
- [ ] Per-user per-event ticket cap enforced atomically at hold time (Redis counter in the acquire Lua script)

**Failure isolation:**
- [ ] Timeouts on every inter-service + external call; circuit breaker (`opossum`) around Payment→gateway and gateway→each service
- [ ] `api-gateway`: per-downstream connection pool / concurrency budget (bulkhead) + `503`+`Retry-After` load-shed past the budget
- [ ] RabbitMQ: per-queue DLX + delivery-limit + consumer prefetch cap; alert on any `*.dlq` depth > 0
- [ ] Payment reconciliation poller (poll the gateway for `PENDING` payments older than ~2 min) + client-polled `GET /payment/payments/:id`
- [ ] Redis: AOF `everysec` locally; document Sentinel/ElastiCache for AWS; fail-closed on holds when Redis is unreachable
- [ ] Cache stampede guard: single-flight lock-on-miss + jittered early recompute for hot keys
- [ ] `X-Internal-Token` guard (or mTLS) on all `/internal/*` routes
- [ ] Waiting-room release worker as a singleton (Redis leader lock or dedicated 1-replica service) + adaptive release rate driven by Booking p99 / DB pool / ack-lag
- [ ] Graceful shutdown (`SIGTERM` drain, `enableShutdownHooks`), WS reconnect-with-jitter hint; CD pipeline refuses to deploy during an active `high_demand` window
- [ ] `events.search`: drop `COUNT(*)`, use cursor pagination; statement timeout on all DB connections

**Observability:**
- [ ] Prometheus `/metrics` per service: rate/latency/errors, waiting-room queue depth + release rate, DB pool, Redis, RabbitMQ queue + DLQ depth, **oversell counter (== 0)**, hold→paid conversion
- [ ] Alerts: DLQ > 0, oversell > 0 (page), queue depth flat > 60 s, p99 > SLO > 2 min, node down, reconciliation mismatch
- [ ] Correlation ID from `api-gateway` through every service and broker message; structured logs keyed on `orderId` / `eventId`
- [ ] "Flash-sale control room" dashboard: the funnel arrivals → queued → admitted → held → paid → ticketed + release rate

**Commit checkpoint:** replay a `PaymentSucceeded` from the RabbitMQ UI → exactly one ticket set + one email; force a Redis hold to expire mid-payment in a test → the order auto-refunds instead of overselling; kill the release worker → an alert fires and a standby takes the leader lock.

---

## Phase 9 — Docker Swarm demo (already designed, not yet applied)

- [ ] Write Dockerfiles per service (multi-stage: build → slim runtime image)
- [ ] `docker swarm init` locally (single node), build the autoscaler image
- [ ] Copy `docs/spec/swarm/docker-stack.yml` into `infra/swarm/`, adjust image + env refs
- [ ] Duplicate the service block for the other 5 services per the README's per-service checklist
- [ ] Run the self-healing demo (`docker rm -f` a task, record the manager recreating it) and the autoscaling demo (`3 → MAX 6`, load with `hey`/k6) per [docs/spec/swarm/README.md](swarm/README.md)

---

## Phase 10 — Load testing & CI

- [ ] k6 script simulating the flash-sale scenario from [04-deployment-design.md](04-deployment-design.md), with/without the waiting room, to get real p95/p99 numbers for the report
- [ ] k6 read-path script (event detail + seat-map state under 5k VUs) — verify cache hit ratio and origin Postgres req/s per [04-deployment-design.md](04-deployment-design.md) §2a
- [ ] Chaos checks from [12-resilience-and-failure-design.md](12-resilience-and-failure-design.md): redelivered broker message → one ticket; Redis hold expiry mid-payment → auto-refund, oversell counter stays 0; kill a task / the release worker → recovery + alert
- [ ] GitHub Actions workflow: lint + test + build per service on push

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 12-resilience-and-failure-design.md*
