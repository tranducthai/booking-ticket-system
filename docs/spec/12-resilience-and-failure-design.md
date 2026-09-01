# RESILIENCE & FAILURE DESIGN
## Online Event Ticketing System (similar to Ticketbox)

---

[04-deployment-design.md](04-deployment-design.md) sizes capacity (how much load the system takes). This document is the other half: **what happens when load is exceeded or a component fails** — the behaviour guarantees, the failure modes that break correctness (especially overselling), and the concrete mechanisms that hold the line. It also carries a self-review from a reviewer / examiner's point of view (§4).

Scope note: several items below describe hardening that is **not in the code yet** — they are called out here so the roadmap ([11-implementation-roadmap.md](11-implementation-roadmap.md) Phase 8c) can pick them up, and so the report can state them as deliberate design, not omissions.

---

## 1. Overload behaviour — the three guarantees

When arrivals far exceed capacity (the "50,000 show up for a 20,000 design" case, and "50,000 logins at once"), the system must keep three promises. Each is delivered by a specific mechanism, not by hope.

| Guarantee | Why it holds | Mechanism |
|---|---|---|
| **The site does not crash** | Excess load is *rejected cleanly*, never queued until memory/threads run out | (a) connection cap + accept-queue limit on the edge / `api-gateway`; (b) **load-shedding**: past a concurrency budget, return `503` + `Retry-After` immediately (cheap) instead of processing; (c) every upstream call has a **timeout** and a **circuit breaker** so a slow dependency can't tie up all workers; (d) bounded work queues inside each service (e.g. the bcrypt queue in User Service) that shed rather than grow unbounded; (e) the DB is shielded by the waiting-room release valve — it never sees more than the verified safe write rate |
| **Users can still log in** | The crowd is moved off the expensive path, and the expensive path degrades to "retry", never to "fail" | (a) ~95% arrive with a valid refresh token → silent `POST /auth/refresh` (JWT verify + 1 indexed `SELECT`, thousands/s per task); (b) real logins are rate-limited and, when User Service is saturated, get `503` + `Retry-After` — the client shows "system busy, retrying…", not an error; (c) login sits behind the waiting room for `high_demand` events, so its rate is paced anyway; (d) nobody is ever permanently locked out — worst case is a few retry cycles (seconds to ~2 min) |
| **The UI loads** | The UI shell and all read-heavy content are served from the edge / cache, independent of backend load | (a) HTML/JS/CSS/images and the **queue-screen page** are static → CDN; (b) event detail + seat-map **layout** are CDN + Redis cached (>95% hit); (c) seat-map **state** and "X left" come from a Redis snapshot rebuilt ~1/s, never Postgres-per-request; (d) the only "slow" parts are the login round-trip and waiting-room admission — both shown with progress UI (spinner, queue position, ETA), which is paced behaviour, not a broken UI |

### Graceful-degradation ladder

As load climbs past thresholds, the system sheds non-essential work in order, automatically:

1. **Normal** — everything on.
2. **Busy** (release-rate throttle active) — raise cache TTLs (event page 10 s → 60 s); real-time WebSocket updates fall back to 3–5 s polling; disable "related events" / recommendations / search facets.
3. **Heavy** (waiting room gating the event page) — only N users in the page; everyone else on the static queue screen; search limited to cached queries only.
4. **Overload** (edge concurrency budget hit) — `503` + `Retry-After` for new sessions already in flight; existing queued users keep their position and are unaffected.

Each step is reversible and driven by a measured signal (release-rate backlog, CPU, edge connection count), not a manual switch.

---

## 2. Failure modes that break correctness

These are the ones a ticketing system must get right. "The site is up" is not enough if it oversells or double-charges.

### 2.1 Seat-hold TTL vs. slow payment — the classic oversell race

**The bug.** `holdSeat` sets `seat:hold:<seatId>` in Redis with `SET NX EX 600`. The customer then spends >10 min on the payment-gateway page. The Redis key expires. A second customer's `tryAcquire` now succeeds on the same seat. Customer 1's payment webhook finally arrives → `confirmSeat` sets `Seat.status = BOOKED`. Customer 2 also pays → also `BOOKED`. **The seat is sold twice.** The current `confirmSeat` / `releaseSeat` don't even check *who* holds the lock, so this passes silently.

**The fix — three layers:**

1. **Ownership-checked confirm (hard guarantee).** `confirmSeat(seatId, orderId)` runs a Lua script atomically: `if redis.call('GET', KEYS[1]) == ARGV[1] then <delete, proceed> else return 0`. If it returns 0, the hold was lost → Booking Service does **not** mark the order paid-complete; it fires a **compensating auto-refund** (`RefundApproved`-style flow) and notifies the customer. Oversell becomes *impossible*; the worst case is a rare, auditable auto-refund.
2. **Hold extension on payment start (makes the loss rare).** `POST /payments` first calls Event Service `POST /internal/seats/:id/extend-hold` which bumps the Redis TTL to cover the gateway window (e.g. +15 min) and flags the order `PAYMENT_IN_PROGRESS` so the stale-hold sweeper skips it. Extension is capped (once) so it can't be gamed into an indefinite hold.
3. **Shorter base TTL + live client countdown (UX).** 5–7 min base hold; the checkout page shows the countdown and blocks submission once expired, so customers rarely reach the race in the first place.

`releaseSeat` gets the same ownership check (`GET == orderId` before `DEL`) so a stray `PaymentFailed` for an old order can't release a seat a *different* order legitimately holds now.

### 2.2 Multi-seat holds are not atomic

Holding 5 seats = 5 separate `tryAcquire` calls. If the 3rd fails, seats 1–2 are left held with no rollback. **Fix:** Booking Service wraps the group — on any failure, release the ones already acquired and return the whole request as failed ("seats X, Y no longer available"). For all-or-nothing zones, do the acquire in one Lua script over the seat-key list.

### 2.3 Redis ↔ Postgres are two writes, not one

`tryAcquire` (Redis) then `seat.update` (Postgres) — a crash between them leaves Redis and the `Seat.status` projection disagreeing. Redis is the **source of truth for hold state**; `Seat.status` is a projection.

- On the read path, the seat-map **state** is derived from Redis (per §2a), so a stale `Seat.status` never misleads a buyer.
- A **`StaleHoldSweeper`** (every 30–60 s) reconciles Postgres: any `Seat.status = HELD` with no live Redis key and no `PAYMENT_IN_PROGRESS` order → back to `AVAILABLE`; any `BOOKED` seat is left alone.
- The sweeper is **idempotent** and safe to run on every Event Service instance (it's a conditional `UPDATE`), or pinned to one via a Redis leader lock.

### 2.4 At-least-once delivery with no idempotency = duplicate tickets

`EventEnvelope.eventId` exists "for de-duplication" but **no consumer stores processed IDs**. A redelivered `PaymentSucceeded` → order marked `PAID` twice → `OrderPaid` published twice → Ticket Service generates the QR set twice (or hits the `Ticket.orderItemId @unique` constraint and the message dies with nowhere to go).

**Fix — every consumer is idempotent:**
- A `processed_events` table per service (`eventId` PK, `processedAt`) written in the **same DB transaction** as the handler's effect. Handler starts with `INSERT ... ON CONFLICT DO NOTHING`; if 0 rows, it's a redelivery → ack and return.
- Or, for handlers whose effect is already naturally idempotent (status transitions guarded by a `WHERE status = <expected>`), rely on that and document it.
- Ticket generation keys on `orderItemId` (`INSERT ... ON CONFLICT DO NOTHING`) so a double `OrderPaid` yields one ticket set.

### 2.5 Dead-letter queues & poison messages

RabbitMQ is at-least-once and single-node in the design. Needed:
- **Per-queue DLX**: after N failed deliveries (`x-delivery-limit` / manual nack-count), the message goes to `<queue>.dlq` instead of redelivering forever (a poison message otherwise blocks the consumer).
- A **DLQ drain**: an operator tool + an alert when any `*.dlq` depth > 0. For a Saga, a stuck message = a customer whose order is half-processed; it needs a human or a scripted retry.
- **Consumer prefetch** (`prefetch: 20–50`) so one consumer can't pull thousands of messages and OOM.
- RabbitMQ HA: single node for local/demo; **3-node quorum-queue cluster on AWS** (already noted in [04-deployment-design.md](04-deployment-design.md) §2).

### 2.6 Saga compensation — what if the compensation also fails

Choreography Saga: if ticket generation fails after payment succeeded, a compensating auto-refund is published. If *that* fails too:
- Compensating events are **idempotent** and **retried with backoff** (via the DLX → retry-with-delay pattern), so transient failures self-heal.
- After the retry budget is exhausted, the message lands in the DLQ and raises an alert → manual resolution. This is acceptable *because it is rare and visible*, and because the **payment provider is the money source of truth**: a daily **reconciliation job** compares Payment Service records against the provider's settlement report and flags any charge without a completed order (→ refund) or any completed order without a charge (→ investigate).
- The report should state plainly: the system targets **eventual** consistency with a bounded manual-intervention tail, not distributed ACID.

### 2.7 Payment gateway failure modes

`POST /payments → PG: create transaction` and the webhook are the fragile points.

| Failure | Handling |
|---|---|
| PG slow / timing out | 5–8 s timeout on the create-transaction call + circuit breaker; on trip, return "payment temporarily unavailable, your seats are held until HH:MM" — don't leave the user hanging. Seats stay held (TTL), so retry is safe |
| Duplicate webhook | Webhook handler is idempotent on `paymentId` (`processed_events` / status guard) — a second `SUCCEEDED` webhook is a no-op |
| Webhook never arrives (lost) | **Reconciliation poller**: every 1–2 min, Payment Service queries the PG for the status of every `PENDING` payment older than ~2 min. Also a client-facing `GET /payment/payments/:id` the checkout page polls. The webhook is an optimisation, never the only path to `PAID` |
| Webhook out of order (`FAILED` then late `SUCCEEDED`) | State machine only advances (`PENDING → SUCCEEDED`/`FAILED`, terminal); a late contradicting webhook is logged and dropped, reconciliation is the tie-breaker |
| Signature invalid | Reject `4xx`, log, alert if the rate spikes (someone probing) |
| Refund to PG fails | Retried with backoff; after budget → DLQ + alert; the customer-visible `Refund.status` stays `PROCESSING`, never silently `COMPLETED` |

### 2.8 Redis is a single point of failure

Redis holds the locks, the seat-map state snapshot, the waiting-room queue, rate-limit counters and idempotency keys. One container = one blast radius.

- **Local/demo:** single node with **AOF persistence (`appendfsync everysec`)** so a restart loses ≤ 1 s of writes, plus `restart: unless-stopped`.
- **AWS:** Redis **Sentinel (3 nodes)** or managed ElastiCache with automatic failover; the client (`ioredis`) is Sentinel-aware and reconnects.
- **Degrade sanely when Redis is briefly unavailable — fail *closed* on anything that risks oversell:** new holds are **rejected** ("try again in a moment"), not allowed through unguarded. Reads fall back to a short-TTL in-process cache or a "seat map temporarily unavailable" state. The waiting room, if its Redis is down, holds everyone at the door rather than admitting a flood.
- Keep the datasets separable (different logical DBs or instances) so, e.g., losing the cache instance doesn't also lose the locks.

### 2.9 Cache stampede (thundering herd)

The hot event's `event:{id}` key expires mid-on-sale → ~6,000 req/s all miss → 6,000 simultaneous identical Postgres queries.

- **Single-flight / lock-on-miss:** the first miss takes a short Redis lock (`SET NX EX 5`), recomputes, repopulates; concurrent misses briefly serve stale-or-wait.
- **Probabilistic early expiry:** recompute a hot key slightly before its TTL, jittered, so expiry never lines up across requests.
- **`stale-while-revalidate`** at the CDN so an expired edge entry is still served (once) while it refreshes.

### 2.10 Waiting-room release worker

The waiting room only works if something drains the Redis sorted set at the safe rate. Undesigned so far:

- The **release worker must be a singleton** — if every `api-gateway` instance runs its own, the effective release rate is N × target. Use a **Redis leader lock** (`SET NX EX`, renewed) or a dedicated single-replica `release-worker` service.
- If the worker **dies, the queue stops draining** and everyone is stuck. It needs a liveness check and fast restart (Swarm reconciliation), plus an alert on "queue depth not decreasing".
- **Adaptive rate, not a hardcoded 400:** the worker watches Booking Service p99 latency, DB pool utilisation and consumer-ack lag, and lowers the release rate automatically when they degrade (closed-loop). The load-tested number is the *starting* point and the ceiling.
- **Admission token** (cookie / short-lived JWT) with a TTL; on refresh the user keeps their position; **abandonment reclaim** — an admitted user who doesn't start checkout within M minutes frees their slot.

---

## 3. Cross-cutting design

### 3.1 Timeouts, circuit breakers, bulkheads

- **Every** inter-service HTTP call and every external call (PG, SMTP) has an explicit timeout (typically 3–8 s) — no unbounded waits.
- **Circuit breaker** (e.g. `opossum`) around Payment Service → PG, and around `api-gateway` → each service: after an error-rate threshold, trip for a cooldown and fail fast with a friendly message instead of piling up connections.
- **Bulkhead**: the `api-gateway` uses a **separate connection pool / concurrency budget per downstream service**, so Booking Service being slow doesn't starve login and browse. `http-proxy-middleware` today has neither timeout nor pool limits — this is a concrete gap.

### 3.2 Rate limiting (concrete)

- Enforced at `api-gateway`, backed by **Redis** (so limits are global across gateway instances), token-bucket.
- `POST /user/auth/login`: 5/min/IP, 20/min/account. `POST /user/auth/register`: 3/min/IP. `POST /booking/cart/hold`: 10/min/user. `POST /payment/payments`: 5/min/user. Browse/search: 60/min/IP (generous — it's cached anyway).
- Response `429` + `Retry-After` + `X-RateLimit-*` headers.
- The waiting room is a *fairness/pacing* device; rate limits are an *abuse* device — both are needed.

### 3.3 Purchase limits & anti-scalping

Nothing today stops one account (or one bot farm) from holding hundreds of seats.

- **Per-user, per-event cap** (e.g. 4–8 tickets) enforced **at hold time**: a Redis counter `hold:count:<eventId>:<userId>` incremented under the same Lua script as the seat acquire, checked against the cap, decremented on release/expiry.
- One **waiting-room token per account**; CAPTCHA at queue entry for `high_demand` events.
- Optional: flag orders from the same payment instrument / device fingerprint across many accounts.

### 3.4 Discount-code concurrency

`discount-codes.validate` only **reads** `quantityUsed < quantityTotal` — two concurrent orders with the last remaining use of a code both pass. There is no redemption step at all.

- Add **redeem** at order-confirm: `UPDATE "DiscountCode" SET "quantityUsed" = "quantityUsed" + 1 WHERE id = $1 AND "quantityUsed" < "quantityTotal"` — 0 rows affected → the code is now exhausted, recompute the total without it and tell the user.
- **Release** on order cancel/expiry (`quantityUsed = GREATEST(quantityUsed - 1, 0)`), guarded so it can't double-release (track redemption on the order).

### 3.5 GA inventory release must be idempotent

`reserveTicketType`'s conditional `UPDATE` is correct (atomic, can't oversell). But `releaseTicketType` is called from both `PaymentFailed` **and** the `Order.expiresAt` sweep — releasing twice under-counts `quantitySold` and silently inflates available inventory. **Fix:** record `reservationReleased` on the Order; release only if not already released, in the same transaction as the status change.

### 3.6 Internal endpoints need authentication

Event Service `/internal/seats/:id/hold|release|confirm` and `/internal/ticket-types/:id/reserve` are not routed through `api-gateway`, but they **are** reachable by anything on the overlay network. A compromised or buggy service (or a misrouted request) could confirm/release seats directly.

- **Shared secret header** (`X-Internal-Token`) checked by a guard on all `/internal/*` routes, or mTLS between services, or a Docker overlay network scoped so only Booking Service can reach Event Service's internal port.

### 3.7 Graceful shutdown & deploy freeze

- **`stop_grace_period: 30s`** + the app traps `SIGTERM`: stop accepting new requests, finish in-flight ones, close the RabbitMQ channel after the current message is acked, close DB pool. Nest's `enableShutdownHooks()` + `app.close()`.
- **WebSocket drain:** on shutdown, send the clients a `reconnect` hint with jittered backoff so 20k sockets don't reconnect in the same 100 ms; the Redis adapter means they can reattach to another instance.
- **Deploy freeze:** no deploys during an on-sale window (and for ~15 min after). This is a documented operational rule; ideally the CD pipeline checks an "active high-demand event" flag and refuses.

### 3.8 Database resilience

- **Connection pooling:** Prisma pool sized per service; **PgBouncer** (transaction mode) in front for the flash-sale write path so a spike of connections doesn't exhaust Postgres.
- **Backups:** automated daily + point-in-time recovery (WAL archiving) on AWS; documented restore procedure.
- **Read replica** for Event Service browse (per [04-deployment-design.md](04-deployment-design.md) §2) — but seat-map **state** always comes from Redis, and seat *confirm* always hits the primary, so replica lag can't cause an oversell, only a slightly stale browse list.
- **Slow-query guard:** statement timeout (e.g. 5 s) so a pathological query can't pin a connection; the `events.search` `COUNT(*)` is replaced with cursor pagination (no total) or a cached/approximate count.

### 3.9 Observability (you are blind during a flash sale without this)

Minimum viable, because the failure modes above are only manageable if visible:

- **Metrics** (`/metrics`, Prometheus): request rate + p50/p95/p99 latency + error rate per service; **waiting-room queue depth and release rate**; DB pool utilisation; Redis memory + hit rate; RabbitMQ queue depth per queue + **DLQ depth**; **oversell counter (must always be 0)**; hold count, hold→paid conversion.
- **Alerts:** any `*.dlq` > 0; oversell counter > 0 (page immediately); queue depth not decreasing for > 60 s; p99 > SLO for > 2 min; Redis/RabbitMQ node down; payment reconciliation mismatch.
- **Structured logs** with a correlation ID propagated from `api-gateway` through every service and broker message (`eventId` / `orderId` as the join key).
- **Dashboards:** one "flash-sale control room" board with the funnel (arrivals → queued → admitted → held → paid → ticketed) and the release rate, so the operator can adjust or abort.

---

### 3.10 Schema deltas this design requires

New tables / columns beyond [07-database-schema.md](07-database-schema.md):

- **`processed_events`** — one per consuming service (`booking-service`, `ticket-service`, `event-service`, `notification-service`). `eventId` PK (UUID), `processedAt` timestamptz. Written in the same transaction as the handler effect.
- **`Order`** (booking-service): `+ paymentInProgress boolean default false` (set on `POST /payments`, tells the stale-hold sweeper to skip), `+ reservationReleased boolean default false` (idempotent GA release guard), `+ discountRedeemed boolean default false` (idempotent discount release guard).
- **`Event`** (event-service): `+ highDemand boolean default false` (waiting-room gating).
- **`DiscountCode`** (event-service): no new column — `quantityUsed` already exists; needs the atomic `redeem` UPDATE and a release path.
- **Redis keys** (not SQL): `seat:hold:<seatId>` (exists), `hold:count:<eventId>:<userId>` (per-user cap), `seatmap:layout:<eventId>` / `seatmap:state:<eventId>` (§2a), `waitroom:<eventId>` sorted set, `waitroom:leader` (release-worker lock), `ratelimit:<rule>:<subject>` token buckets, `idem:<key>` for POST idempotency keys.

---

## 4. Reviewer / examiner critique — weaknesses, defence, and fixes

An honest pass over the whole design as it stands, from the point of view of someone trying to break it in a defence.

| # | Challenge a reviewer would raise | Is it a real problem? | Defence / fix |
|---|---|---|---|
| 1 | "You claim tickets are *never* oversold, but the Redis hold TTL expires while the user is on the payment page." | **Yes, real** — the current code oversells here. | Fixed by §2.1: ownership-checked `confirmSeat` (Lua `GET == orderId`) makes oversell impossible; hold-extension-on-payment makes the loss rare; auto-refund + reconciliation covers the residual. State this as "oversell is structurally impossible; a rare lost-hold becomes an auto-refund". |
| 2 | "At-least-once broker delivery — where is your idempotency? Show me what happens on redelivery." | **Yes, real** — `eventId` is defined but unused. | Fixed by §2.4: `processed_events` table written in the handler's transaction; ticket generation keys on `orderItemId`. Demo it by replaying a message from the RabbitMQ UI and showing exactly one ticket/email. |
| 3 | "Choreography Saga has no coordinator — how do you know the flow completed? What if a compensation fails?" | Partly — it's a known trade-off, but needs an answer. | §2.6: compensations are idempotent + retried + DLQ'd + alerted; a daily reconciliation against the payment provider is the backstop. The design targets **eventual** consistency with a bounded manual tail — say so explicitly rather than claiming ACID. |
| 4 | "Redis is on the critical path for locks, queue, cache, rate limits — and it's one container." | **Yes, real.** | §2.8: AOF persistence locally; Sentinel/ElastiCache on AWS; **fail-closed** on holds when Redis is unavailable (reject, don't risk oversell). Separate instances per concern so blast radius is limited. |
| 5 | "The release rate (400 req/s) is a magic number." | Fair. | It's explicitly "measure via load test" ([04-deployment-design.md](04-deployment-design.md) §2), and §2.10 makes it **adaptive** — the worker lowers it automatically when Booking p99 / DB pool / ack-lag degrade. The load-tested figure is the ceiling, not a fixed value. |
| 6 | "What stops one person (or a bot farm) buying 500 tickets?" | **Yes, real** — nothing does today. | §3.3: per-user per-event cap enforced atomically at hold time; one queue token per account; CAPTCHA for `high_demand`. |
| 7 | "Internal `/internal/*` endpoints have no auth — anything on the network can confirm a seat." | **Yes, real.** | §3.6: shared-secret guard / mTLS / scoped overlay network. Cheap to add, important to mention. |
| 8 | "20,000 WebSocket connections on Socket.IO — on the laptop you're demoing on?" | The demo number is smaller; the *design* must scale. | §2a: Redis adapter + **one batched frame per room per second** + **polling fallback as the default**. Defend with a load-test number for the batched design, and note the demo runs a scaled-down connection count. |
| 9 | "Discount codes with a usage limit — same race as inventory?" | **Yes, real** — and there's no redemption step at all today. | §3.4: atomic conditional `UPDATE` on redeem, release on cancel, guarded against double-release. |
| 10 | "`events.search` runs `COUNT(*)` with `ILIKE` on every browse request." | **Yes** — expensive under browse load. | §3.8: cursor pagination without a total, or a cached/approximate count; plus the whole search response is Redis-cached (§2a). |
| 11 | "If the payment webhook is lost, the customer is charged and gets no ticket." | **Yes, real** — webhook is the only path to `PAID` today. | §2.7: reconciliation poller + client-polled `GET payment status`; the webhook becomes an optimisation, not the only path. |
| 12 | "The waiting-room release worker — one process? What if it crashes?" | **Yes, real** — undesigned. | §2.10: singleton via Redis leader lock or a dedicated 1-replica service; liveness + fast restart; alert on "queue depth flat". |
| 13 | "You moved `healStaleHolds` out of the read path — so when *does* Postgres get reconciled?" | Consistent, but needs stating. | §2.3: the `StaleHoldSweeper` cron (30–60 s), idempotent conditional `UPDATE`; the read path never needs the projection to be fresh because seat-map state is derived from Redis. |
| 14 | "No metrics, no alerts — how would you even know it's failing during the on-sale?" | **Yes, real.** | §3.9: Prometheus metrics incl. queue depth / DLQ depth / **oversell counter**, alerts, correlation IDs, a flash-sale funnel dashboard. This is Phase 8c / Phase 10. |
| 15 | "Single-node RabbitMQ, no DLQ — a poison message stalls the Saga for everyone." | **Yes, real.** | §2.5: per-queue DLX + delivery limit + prefetch cap; DLQ-depth alert; quorum-queue cluster on AWS. |
| 16 | "Rolling deploy during an on-sale drops holds and 20k sockets." | **Yes** — operationally. | §3.7: graceful shutdown (SIGTERM drain), WS reconnect-with-jitter, and a **deploy-freeze rule** during on-sale windows enforced by the CD pipeline. |

### Honest limitations to state in the report (not defend away)

- **Single region.** No multi-region DR. A region outage is total downtime. Acceptable for the project scope; mentioned as future work.
- **Eventual consistency.** Between "paid" and "ticket in hand" there is a window (usually sub-second, rarely minutes if the Saga retries). The UI must show "processing" honestly.
- **The demo runs at reduced scale.** Numbers in [04-deployment-design.md](04-deployment-design.md) §2 are the *design target* proven by load test, not what the laptop Swarm runs. Say which is which.
- **bcrypt cost is a deliberate throughput limit.** We do not lower it for speed; we move the crowd off login instead (§1).

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md*
