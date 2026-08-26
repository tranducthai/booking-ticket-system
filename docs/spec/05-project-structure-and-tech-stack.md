# PROJECT STRUCTURE & TECH STACK
## Online Event Ticketing System (similar to Ticketbox)

---

## 1. Stack selection

The project is implemented as **true microservices** (skipping the modular-monolith-first path suggested in [03-system-design.md](03-system-design.md)), using **a single language — TypeScript/NestJS** across all services, to reduce context-switching cost and take advantage of NestJS's built-in microservices module (which maps directly onto the Saga/event-driven design already in place).

| Component | Choice | Why |
|---|---|---|
| Language | TypeScript (Node.js 20+) | Type-safe, shareable with the frontend if built with React/Next later |
| Framework per service | NestJS | Clear DI + modules, a mindset close to Spring Boot, ships with `@nestjs/microservices` |
| API Gateway | Dedicated NestJS app (`api-gateway`) | Routes requests, verifies JWT, rate-limit/waiting-room per the 5 defense layers in [04-deployment-design.md](04-deployment-design.md) |
| ORM | Prisma | Clear migrations, one schema per service — matches the Database-per-Service principle |
| Database | PostgreSQL (1 DB/service) | As recommended in [03-system-design.md](03-system-design.md) |
| Cache & seat-hold TTL | Redis (`ioredis`) | Seat holding, waiting room (sorted set `ZADD`), locking via `SETNX`/Lua script |
| Message broker | RabbitMQ (`@nestjs/microservices` + `amqplib`) | Easier to set up than Kafka for a school project, enough to demo Saga choreography |
| Realtime seat map | Socket.IO (`@nestjs/websockets`) in the Event Service | Pushes seat state directly to customers viewing the same map |
| Auth | JWT + `passport-jwt`, issued by the User Service | Gateway/other services verify the token locally, no need to call User Service on every request |
| E-ticket QR | `qrcode` + HMAC/RSA signing | Prevents forgery/screenshot reuse as required in [01-business-analysis.md](01-business-analysis.md) |
| Validation/DTO | `class-validator` + `class-transformer` | NestJS standard |
| API docs | `@nestjs/swagger` per service | Fast testing, doubles as report documentation |
| Testing | Jest (built into NestJS) | Unit + e2e |
| Containerization | Docker + Docker Compose (local dev) | Maps directly onto the k8s manifests already prepared in [docs/spec/k8s](k8s) |
| CI/CD | GitHub Actions | build → test → build image |
| Load testing | k6 | Already mentioned in [04-deployment-design.md](04-deployment-design.md) to get real load-capacity numbers |

*(If you want to showcase technology diversity in the report, you could rewrite one service — e.g. the Payment Service — in Java/Spring Boot to demonstrate polyglot skills, but that isn't necessary from day one.)*

---

## 2. Folder structure (monorepo)

Use a **monorepo with pnpm workspaces** — fits the project's scale (a single person/small team); skip Nx/Turborepo since 6-7 services don't need that much extra tooling. Each service still stays fully independent (its own Dockerfile, schema, `package.json`) so it can be split into its own repo later if needed.

```
booking-ticket-system/
├── apps/
│   ├── api-gateway/            # routing, JWT verification, rate-limit/waiting-room
│   ├── user-service/           # USERS — register/login, JWT, 3-role access control
│   ├── event-service/          # EVENTS, CATEGORIES, TICKET_TYPES,
│   │                           #   SEAT_MAPS, SEAT_ZONES, SEATS, DISCOUNT_CODES
│   │                           #   + WebSocket gateway for realtime seat map
│   ├── booking-service/        # ORDERS, ORDER_ITEMS — cart, Redis seat-hold, saga participant
│   ├── payment-service/        # PAYMENTS, REFUNDS — payment gateway integration, webhook handling
│   ├── ticket-service/         # TICKETS — QR generation & signing, check-in
│   └── notification-service/   # no dedicated DB — RabbitMQ consumer, sends email/SMS
│
├── libs/
│   └── event-contracts/        # shared type/interface for messages on the broker
│                                #   (PaymentSucceeded, SeatHeld, TicketIssued...)
│
├── infra/
│   ├── docker-compose.yml      # postgres (per service) + redis + rabbitmq + all apps, for local dev
│   └── k8s/                    # real deploy-time manifests — copied & adapted from docs/spec/k8s
│
├── docs/spec/                  # analysis/design documentation (already in place)
├── .github/workflows/          # CI: build, test, docker build
├── pnpm-workspace.yaml
├── package.json
└── .gitignore
```

### Service ↔ data-table mapping (cross-checked with [03-system-design.md](03-system-design.md))

| Service | Owns tables |
|---|---|
| `user-service` | `USERS` |
| `event-service` | `EVENTS`, `CATEGORIES`, `TICKET_TYPES`, `SEAT_MAPS`, `SEAT_ZONES`, `SEATS`, `DISCOUNT_CODES` |
| `booking-service` | `ORDERS`, `ORDER_ITEMS` |
| `payment-service` | `PAYMENTS`, `REFUNDS` |
| `ticket-service` | `TICKETS` |
| `notification-service` | (owns no business table) |

---

## 3. Code organization principles

- **`libs/event-contracts` is the one shared library worth having.** It only holds types/interfaces for messages exchanged between services over the broker, to prevent schema drift between the publishing service and the consuming service. Don't add other `libs/shared-*` packages unless real code duplication is found across multiple services. Payload shapes: [09-event-contracts.md](09-event-contracts.md).
- **Database per Service, strictly enforced:** each service has its own Prisma schema at `apps/<service>/prisma/schema.prisma`, migrated independently, and **never** imports another service's Prisma client directly. Cross references (e.g. `ORDER_ITEMS.seat_id` pointing to a table owned by `event-service`) only store the ID, with no database-level FK — cross-service data consistency is handled via events on the broker (saga choreography), not a shared transaction. Draft schema per service: [07-database-schema.md](07-database-schema.md).
- **`docs/spec/k8s/`** is currently a **sample design reference** (for `booking-service`, meant as a template for the other services) — keep it as-is for reference. When actually deploying, duplicate it into `infra/k8s/<service>/` per service, renaming labels/routes as noted in the README.
- **Real environment variables/secrets** must never be committed (already blocked via `.env`, `*.key`, `*.pem` in `.gitignore`) — only template files with placeholder values, like `configmap-secret.yaml`, should be committed.

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md*
