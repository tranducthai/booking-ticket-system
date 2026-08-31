# DEPLOYMENT & LOAD DESIGN
## Online Event Ticketing System (similar to Ticketbox)

---

## 1. High-load design (Flash sale / ticket sales opening)

*(The full load-flow diagram was shown during the discussion — 5 layers: Client → CDN & Load Balancer → Waiting Room → Booking Service (Redis lock) → Queue & Database.)*

### Why this is the most dangerous bottleneck
At the moment tickets go on sale (especially for a hot event), a large fraction of the user base can send requests within seconds — very different from average daily load. On this platform's target scale (**~100,000 registered users**), a hot on-sale realistically draws **~20,000 concurrent users all trying to buy at once** in the first minute. That is 50–100× the normal daily peak, so without designing specifically for this scenario the system can easily crash or oversell. The 5 layers below are what absorb that spike; the numbers in section 2 are sized to the 20k figure.

### 5 defense layers

| Layer | Role | Specific technique |
|---|---|---|
| **CDN & Load Balancer** | Block static load at the source, evenly distribute dynamic load | CDN caches images/landing pages; Load balancer (round-robin or least-connection) distributes requests across multiple API Gateway instances |
| **Waiting room (virtual queue)** | Control how many requests get into the booking system at once | Store the queue in a Redis sorted set (ordered by arrival time), release batches into the Booking Service at exactly the safe processing rate measured via load testing. **Toggled per event** via a `high_demand` flag — ordinary events skip the waiting room entirely and go straight to the Booking Service behind the API Gateway rate-limit; the queue only engages for flagged on-sales |
| **Booking Service + Redis lock** | Ensure no 2 people can hold the same seat/ticket | Atomic `SETNX` operation or a Lua script on Redis; TTL ~10 min to auto-release the seat if the customer abandons the flow |
| **Queue & Database** | Decouple the rate of receiving requests from the rate of writing data | Confirmed booking requests are pushed to a message queue, workers write to the DB at a rate the DB can handle, avoiding a bottleneck/crash at the storage layer |
| **Auto-scaling & Circuit breaker** *(additional)* | Auto-expand under load, prevent cascading failures | Horizontal auto-scale the Booking Service based on queue length/CPU; circuit breaker between services (e.g. a Payment Service failure doesn't take down the whole system) |

### Work needed to get concrete numbers for the report
- **Load test** with k6 or JMeter to determine the requests/second threshold the Booking Service + Database can handle — this number is used to configure the "release" rate from the waiting room.
- Measure response time (p95/p99 latency) before and after applying each defense layer, to prove effectiveness with data in the report.
- Simulate a ticket-sales-opening scenario with a load test script for N simultaneous users, comparing the error/oversell rate "with" vs "without" the waiting room.

---

## 2. Capacity design for ~20,000 concurrent buyers (flash-sale peak on a 100k-user platform)

*(The full capacity-funnel diagram was shown during the discussion — narrowing from ~20,000 concurrent connections down to 200-400 writes/second into the database.)*

### Sizing assumptions

| Input | Value | Basis |
|---|---|---|
| Registered users (platform target) | ~100,000 | Given |
| Concurrent users at a hot on-sale | ~20,000 | All hitting checkout in the first ~minute |
| Arrival burst | ~1,000–2,000 enqueues/second | 20,000 users landing within ~10–20 seconds |
| Normal daily peak (non-flash) | ~1,000–2,000 concurrent, ~200–400 req/s | Mostly reads (browse/search); waiting room not engaged |

### Design principle
The bottleneck isn't in **receiving** ~20,000 requests — it's in **processing** them without crashing the database or double-selling tickets. So the correct design is: **accept everything immediately** at the cheap layer (load balancer, Redis), then **release gradually** into the expensive layer (booking, database) at exactly the rate verified to be sustainable.

### Per-layer capacity table

| Layer | Target capacity | How to achieve it |
|---|---|---|
| Entrypoint & Load Balancer | ~20,000–40,000 concurrent connections | 2–3 `api-gateway` tasks behind Swarm's routing mesh locally, or 1 AWS ALB later — with OS tuning (ulimit, file descriptors, connection backlog). A cheap layer, not the bottleneck. CDN in front for event images/landing pages |
| Waiting room (Redis) | ~5,000 enqueues/second (headroom over the ~1,000–2,000 expected) | `ZADD` into a Redis sorted set — a single Redis node handles >100,000 ops/second, so this is never the limit |
| Release rate into processing | **300–500 req/second** *(needs to be measured via real load testing)* | The "throttle valve" — set to exactly the verified sustainable capacity of Booking Service + booking_db |
| Booking Service | 300–500 req/second | Autoscaled pool of ~6–10 tasks (if each task measures ~60–100 req/second for the Redis-bound seat-lock path) — see section 3 |
| Database (via Queue) | **200–400 writes/second** | Workers read from the queue, batch-insert `order_items`, connection pooling (Prisma pool / PgBouncer). One PostgreSQL primary per service for writes; add a **read replica for the Event Service** to carry the browse/search path at this scale |
| RabbitMQ | < 1,000 messages/second | Single node (cluster of 3 later on AWS for HA) |

### Instance-count formula

```
Instance count = ceil( target_RPS / measured_RPS_per_instance ) × 1.3 (buffer factor)
```

Example: target 400 req/second, each task measures 80 req/second → `400/80 = 5 → 5 × 1.3 ≈ 7 tasks`.

**Note:** the RPS/instance numbers above are still illustrative — the real numbers depend on the tech stack and configuration. A **real load test** (k6/JMeter) needs to be run against the actual deployment to get accurate numbers; this is a part worth including in the report to prove the design with experimental data, not just theory.

### User experience when being "throttled"
At a release rate of 400 req/second, processing all ~20,000 queued people takes about **~50 seconds**. This is normal behavior for a real ticketing system (even Ticketmaster) — as long as the waiting room shows the queue position/estimated wait time, the experience remains acceptable, and most importantly the system doesn't crash and doesn't oversell.

### When arrivals far exceed capacity (e.g. 50,000 show up for a 20,000 design)

**The waiting room already handles this — that is its whole purpose.** "Handles 20,000" means 20,000 in the *processing* stage (release rate ~400 req/s). Arrivals are decoupled: 50,000 (or 500,000) all get `ZADD`-ed into the Redis queue instantly, then released at the safe rate. The extra 30,000 simply wait longer.

- 20,000 queued ÷ 400 req/s ≈ 50 s to drain
- 50,000 queued ÷ 400 req/s ≈ **~125 s** to drain

Nobody is dropped, nothing crashes, nothing oversells — the only change is a longer wait, shown as queue position + ETA. Five things still have to be right:

1. **Size the "accept" layer for the arrival peak, not the processing capacity.** Edge connections + Redis `ZADD` + the static queue-screen page must take ~50k concurrent connections. Redis `ZADD` at >100k ops/s and a CDN-served queue page make this cheap. If the edge itself saturates → **load-shed**: return `503` + `Retry-After` beyond edge capacity (a clean bounce, not a crash).
2. **Bound the queue length.** If only 5,000 tickets exist, the 45,000th person in line has ~zero chance and a 2-minute wait for nothing is bad UX. Once queue length exceeds a factor of remaining inventory (e.g. ×3), stop admitting new entries ("queue full — tickets may free up if others drop out"). This also caps Redis memory and keeps the ETA honest. Show realistic odds on entry ("#38,000 in line, ~5,000 tickets").
3. **Fairness under overload:** the sorted set is ordered by arrival timestamp → strict FIFO. One queue token per account/session (sticky — refreshing does not re-enter or jump the line). CAPTCHA at queue entry for `high_demand` events so bots don't inflate the number.
4. **Autoscaling is not the escape hatch.** Scaling `booking-service` 6→10 tasks only nudges the release rate; the DB write ceiling (200–400/s) and seat-lock contention are the real limits — you smooth 50k over ~2 min, you don't absorb it in 10 s. What autoscaling *does* protect is the **read path** (§2a): the 50k people waiting and browsing must not knock over Event Service, and that path scales cleanly because it is stateless + cached.
5. **Degradation levers if far over capacity:** drop real-time WS → poll at 5 s; raise cache TTLs (event page 10 s → 60 s); disable recommendations / related events / search facets; if the booking queue backs up past N, tell newly-released users "holding your place, system busy" instead of erroring.

---

## 2a. Read-path capacity design (login → event page → seat map)

Section 2 sizes the **write path** (checkout / hold / pay). But when an on-sale opens, the **read burst is bigger than the write burst**: all ~20,000 users load the event page, the seat map and a live-updates channel, while only a few thousand ever reach checkout. The read path is what falls over first if it isn't designed, so it gets its own funnel.

### What each user does at T0 (on-sale opens)

Within the first ~10–20 seconds, each of ~20,000 users roughly does: (1) log in *or* silently refresh a token, (2) `GET` event detail, (3) `GET` seat-map **layout**, (4) `GET` seat-map **state**, (5) open a live channel (WebSocket or poll), then dwell 1–5 min receiving updates while choosing seats.

≈ 4–5 initial reads/user → **~90,000 requests in ~15 s ≈ ~6,000 req/s peak read**, versus ~400 req/s on the write path. The whole strategy is to serve that from **cache and Redis, never from Postgres per request**.

### Design principle
Split every read into an **immutable part** (cache hard, near-infinite hit rate) and a **volatile part** (rebuild once per second in Redis, fan that one copy out to everyone). Nothing on the read path writes to the database.

### Per-layer capacity table

| Layer | Peak load (20k on-sale) | How it's absorbed |
|---|---|---|
| **Login** | ~100 logins/s + ~200 token-refreshes/s (see the note below on a bigger login burst) | Announce the on-sale in advance so most users arrive with a valid refresh token (15 min access / 7 day refresh, already in the code) → the spike is cheap *refresh* (JWT verify + 1 indexed `SELECT`), not *login*. Gateway rate-limit on `/user/auth/login` (e.g. 5/min/IP, 20/min/account) to kill credential-stuffing spikes. User Service autoscaled 4–6 tasks — `bcrypt` cost 10 ≈ 60–100 ms CPU/login is the only expensive bit and can't be cached |
| **Event detail / search** | ~6,000 req/s, of which >95% are cache hits | CDN caches `GET /event/:id` (`Cache-Control: public, max-age=10, stale-while-revalidate=30`) + a Redis read-through cache in Event Service (`event:{id}` TTL 15–30 s, `search:{queryKey}` TTL 10 s), busted on organizer update/approve/reject. Origin Postgres sees **< 50 req/s** no matter how big the crowd. The volatile "X tickets left" counter is served from the Redis inventory counter, not the cached blob |
| **Seat-map layout** (zones, rows, seat IDs, coordinates, zone price) | ~20,000 initial reads | Immutable once the event is published → CDN + Redis `seatmap:layout:{eventId}` (TTL hours), busted only on `createOrReplace`. **~1 Postgres read per event, ever** |
| **Seat-map state** (per-seat Available / Held / Booked / Blocked) | ~10,000–20,000 Redis `GET`/s | One background job per active event rebuilds a compact snapshot `seatmap:state:{eventId}` (array indexed by seat position; ~5–20 KB for a 5,000-seat venue) from the Redis holds + a cached booked-set **every 1 second**. Readers only `GET` that key (~0.2 ms). One Redis node handles this comfortably. **No Postgres, no writes on the read path** |
| **Live seat updates** | ~20,000 concurrent channels per hot event | **Default (recommended for the project): the client polls `GET /event/:id/seat-map/state` every 2–3 s** — it's a single Redis `GET`, and 2 s staleness is fine UX for a seat map. **Realtime option:** Socket.IO with the `@socket.io/redis-adapter` so multiple Event Service instances share the `event:{id}` room; the 1 s snapshot job computes the diff and emits **one batched `seat:batch` frame per room per second** (never per-seat-per-change). Cap ~15k sockets/instance, autoscale on connection count → 2–3 Event Service instances for one 20k event |
| **Stale-hold cleanup** | continuous | Redis TTL auto-expires holds. A background `StaleHoldSweeper` (every 30–60 s) reconciles `SEATS.status` in Postgres for any leak. This is **moved off the read path** — `getSeatMap` must not heal holds inline |

### Where the waiting room sits (decided per event)

- **`normal` event:** no waiting room. The read burst is absorbed by CDN + Redis cache + autoscaling; the write path takes the plain Gateway rate-limit + Redis lock.
- **`high_demand` event:** the waiting room gates **entry to the event page itself**, not just checkout. Only the first N (≈ 3,000–5,000) are admitted to the page, so the seat-map + live-channel load is bounded to N instead of 20,000; everyone else sees the queue screen (static, served from CDN, ~zero cost). The next batch is admitted as people buy or leave.
- The waiting-room token is issued **only to authenticated users**, which forces login to happen *before* queueing — spreading auth load across the queue wait instead of concentrating it at T0.

### When the login burst itself is large (e.g. 50,000 logins at T0)

Login is **CPU-bound on `bcrypt`** (~60–100 ms/login, cost 10). 50,000 logins in 60 s ≈ 830/s would need ~40–80 User Service tasks — brute-force scaling is the wrong answer (those tasks idle the rest of the day). In priority order:

1. **Keep the burst off the login path.** Announce the on-sale early; prompt users to log in in the hours before. At T0 the client should **silently `POST /auth/refresh`** (JWT verify + 1 indexed `SELECT` — a task does thousands/s) instead of showing a login form. Target: 95%+ of the T0 crowd is already authenticated and only refreshes; real fresh logins drop to ~2,000–5,000, spread across the queue wait.
2. **Login sits behind the waiting room** for `high_demand` events — you must be authenticated to get a queue token, and the queue's release rate paces everything after it. If User Service is saturated, `/user/auth/login` returns `503` + `Retry-After`; the user is about to wait minutes in the queue anyway, so a few seconds of login retry is invisible.
3. **Make each login cheaper to serve, not cheaper cryptographically.** Keep `bcrypt` cost 10 (security floor). Raise `UV_THREADPOOL_SIZE` (8–16) and give login tasks **1–2 vCPU each, fewer replicas** — `bcrypt` parallelises across cores, not across tiny 0.5-CPU tasks. Bound the in-process work: if all bcrypt threads are busy, queue briefly (≤ 500 ms) then shed `503` rather than piling on unbounded work.
4. **Isolate + pre-scale.** A dedicated autoscaling group for the auth path (token *verification* is already done locally at the gateway, so `/users/me` etc. are unaffected). For a scheduled on-sale, a cron **pre-scales User Service and the Redis/DB pools 15–30 min before T0** and scales back after — reactive autoscaling (~30–60 s to react) is the safety net, not the plan, because the spike is over in ~2 min.
5. **Rate-limit + bot defence.** Much of a "50k logins" number at an on-sale is credential-stuffing: per-IP (5/min), per-account (20/min), CAPTCHA on the login form during `high_demand` windows.

**Sizing after mitigations:** ≤ 5,000 real logins spread over 3–5 min ≈ 20–30 logins/s → User Service 2–4 tasks (1–2 vCPU, `UV_THREADPOOL_SIZE=8`, ~15–25 logins/s each), pre-scaled to 4–6 for the window; refresh path 1–2 tasks; the per-login indexed `SELECT` is negligible. **You do not need to serve 50k logins in 10 s** — the crowd is queueing for minutes; login latency of a couple of seconds is not visible.

### Code changes this implies (tracked in the roadmap)
- Event Service: a Redis read-through cache module + cache-bust hooks in `events.update/approve/reject` and `seatMap.createOrReplace`.
- Split `getSeatMap` → `getSeatMapLayout` (cached) + `getSeatMapState` (Redis snapshot); **remove the `healStaleHolds` call from the read path**.
- New `SeatSnapshotJob` (per active event, 1 s tick): rebuild the state key, compute the diff, emit one batched WS frame.
- New `StaleHoldSweeper` cron (30–60 s).
- `HoldsService`: stop emitting `broadcastSeatUpdate` per seat — just write the change to Redis and let the job fan it out.
- API Gateway: per-route rate-limit config, especially `/user/auth/login`.
- `events.high_demand` boolean + waiting-room middleware that gates event-page routes (not only checkout) when it's set.

> **Correctness and failure behaviour** — what keeps the site up under overload, and the failure modes that would break correctness (oversell race, idempotency, payment-gateway outage, Redis/RabbitMQ SPOF, saga compensation, observability) — are designed in [12-resilience-and-failure-design.md](12-resilience-and-failure-design.md), which also carries a reviewer/examiner critique of the whole design.

---

## 3. Load design at the container layer (Docker Swarm)

*(The full architecture diagram was shown during the discussion — Client → entrypoint (api-gateway) → service VIP (round-robin over tasks) → Swarm manager monitoring & self-healing.)*

**Why Swarm, not Kubernetes:** the project runs locally first (single node), moving to AWS later. On one node a K8s control plane + `kubectl` + an ingress controller add moving parts with no benefit over `docker stack deploy`, which is the same `docker` CLI already used for Compose. Swarm gives the two mechanisms the report needs — reconciliation-based self-healing and a rolling update — natively; only CPU autoscaling is a small add-on (below). K8s is revisited as future work if the system goes multi-node on cloud.

### Mapping concepts to Docker Swarm

| Concept | Kubernetes | Docker Swarm |
|---|---|---|
| Edge / L7 routing | Ingress (+ NGINX controller) | `api-gateway` service on a published port + Swarm routing mesh (Traefik only if edge path-rules / rate-limit are wanted) |
| Target Group (pick instances) | Service + label selector | Service VIP + built-in round-robin over healthy tasks |
| One running instance | Pod | Task (a container) |
| Orchestrator (monitoring & self-healing) | Deployment controller (`replicas` + probes) | Swarm manager reconciliation loop (`deploy.replicas` + `healthcheck`) |
| Auto Scaling | HorizontalPodAutoscaler | `autoscaler` sidecar (`docker stats` → `docker service scale`) |
| Guarantee a minimum of N containers during maintenance | PodDisruptionBudget | `update_config.parallelism: 1` + `order: start-first` |
| Config / secrets | ConfigMap / Secret | `docker config` / `docker secret` (plain env for the demo) |

### Self-healing mechanism

The Swarm manager continuously compares `desired` (the declared `deploy.replicas`, e.g. 3) with the number of tasks currently running and healthy. If they diverge — a container crashes, is OOM-killed, or fails its `healthcheck` `retries` times in a row — the manager **stops the bad task and starts a replacement** within seconds, no human intervention. This is the same reconciliation idea as a K8s Deployment, without a separate control plane.

Swarm has **one** `healthcheck`, not K8s's separate liveness/readiness/startup probes. The behaviours are recovered like this:

| K8s behaviour | How Swarm covers it |
|---|---|
| **Liveness** (dead → kill & replace) | `healthcheck` fails `retries` times → manager kills and recreates the task — the "self-replace on crash" mechanism |
| **Readiness** (not ready → don't route / don't cut over) | Routing mesh only sends traffic to tasks currently passing the `healthcheck`; during a deploy, `update_config: order: start-first` requires the new task to pass its healthcheck **before** the old one is removed |
| **Startup** (grace period while booting) | `healthcheck.start_period` (e.g. 30s) suppresses health evaluation while the app connects to DB/Redis/broker |

### Auto Scaling

Swarm has no built-in CPU autoscaler (neither does K8s without metrics-server). A small `autoscaler` sidecar fills the gap: it polls `docker stats` for the service's tasks, averages the CPU%, and calls `docker service scale` within a `MIN`–`MAX` range — scale up when the average crosses `CPU_UP` (60%), scale down after several consecutive low readings, with a `COOLDOWN` after each action to avoid flapping. `MIN` (3) is an independent redundancy baseline, not derived from load — it just guarantees fault-tolerance headroom regardless of traffic. Being able to explain every line of this control loop (measure → compare to target → actuate → cooldown) is a stronger defense point than a black-box HPA.

**Two different ceilings — don't confuse them when defending the project:**
- **Target production ceiling** (the design number, for the report's capacity-planning story): ~6-10 `booking-service` tasks, estimated from 300–500 req/s ÷ ~60-100 req/s per task in section 2 above, with the ×1.3 buffer. The other 5 services run at a fixed 2-3 replicas each (Event Service leans higher because the browse/search path carries the most traffic). This is what the system would scale to on AWS during a flash-sale on-sale.
- **Local demo ceiling** (`MAX: 6` in `docker-stack.yml`, what actually runs on the single-node Swarm): a much smaller number chosen to be practical on a laptop and to demo cleanly — `3 → 6` is one doubling step, so generating enough load to trigger a single scale-up event is enough to show the mechanism end-to-end. Only `booking-service` needs the autoscaler for the demo; the other 5 services stay at a fixed 1-2 replicas.

### Sample stack files

A complete template has been prepared for the Booking Service (applied the same way to the other 5 services): [swarm/docker-stack.yml](swarm/docker-stack.yml) (healthcheck + `deploy.replicas` + `restart_policy` + `update_config` + `resources`), [swarm/autoscaler/](swarm/autoscaler/) (the CPU autoscaler — `autoscale.sh` + `Dockerfile`), and [swarm/README.md](swarm/README.md) with deploy instructions plus two recordable demos: **self-healing** (`docker rm -f` a task, watch the manager recreate it) and **autoscaling** (load it, watch `3 → 6`). Both are worth recording as visual evidence when defending the project.

### Current status
This section is at the **design** stage — not yet deployed. Once each service has a Dockerfile (Phase 9), it can be run on a single-node Swarm (`docker swarm init`) locally, then moved to AWS (ECS, or EKS if K8s is wanted) later.

---

## 4. Next steps for the deployment section

- Write a **concrete load-test script** (k6 script) to get real numbers instead of the example ones above
- Write a **Dockerfile** for each service (to build the image used in the stack files in section 3)
- Bring up a **single-node Docker Swarm** (`docker swarm init`) to test the self-healing & autoscaling mechanisms before going to the cloud
- Design a basic **CI/CD pipeline** (build → test → deploy)
- Configure **monitoring & alerting** (Prometheus + Grafana, or something simpler depending on time)

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md, 12-resilience-and-failure-design.md*
