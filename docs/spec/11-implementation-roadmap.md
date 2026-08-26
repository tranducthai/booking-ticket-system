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
- [ ] Wire the Ingress-equivalent path map from [docs/spec/k8s/ingress.yaml](k8s/ingress.yaml) into the gateway's proxy config so local routing matches the eventual k8s routing

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

## Phase 9 — Kubernetes demo (already designed, not yet applied)

- [ ] Enable Docker Desktop Kubernetes (or minikube) locally
- [ ] Write Dockerfiles per service (multi-stage: build → slim runtime image)
- [ ] Copy `docs/spec/k8s/*` into `infra/k8s/booking-service/`, adjust image refs
- [ ] Duplicate for the other 5 services per the README's per-service checklist
- [ ] Run the self-healing demo (delete a pod, record it recovering) and the HPA demo (`maxReplicas: 6`, load with `hey`/k6) per [docs/spec/k8s/README.md](k8s/README.md)

---

## Phase 10 — Load testing & CI

- [ ] k6 script simulating the flash-sale scenario from [04-deployment-design.md](04-deployment-design.md), with/without the waiting room, to get real p95/p99 numbers for the report
- [ ] GitHub Actions workflow: lint + test + build per service on push

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md*
