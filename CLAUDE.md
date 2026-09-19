# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ticketbox — a microservices event-ticketing platform (NestJS/TypeScript backend, React/Vite frontend), pnpm monorepo. The full spec (business analysis, ERD, API/event contracts, sequence diagrams, implementation roadmap) lives in `docs/spec/` — **that directory is the source of truth**; most non-trivial files carry a comment citing the specific doc/section they implement (e.g. `docs/spec/12-resilience-and-failure-design.md "circuit breaker"`). When a design decision looks non-obvious, check the cited doc before assuming it's wrong. `docs/spec-vi/` is a Vietnamese translation of the same docs — keep both in sync when editing either.

## Commands

```bash
pnpm install
pnpm infra:up                                  # Postgres ×6, Redis, RabbitMQ, Mailpit — docker compose (infra/docker-compose.yml)
pnpm infra:down

# Per-service, after infra is up (first run only, per service):
pnpm --filter @booking-ticket-system/<service> exec prisma migrate deploy

# Run a service with hot reload (each is a standalone NestJS app):
pnpm --filter @booking-ticket-system/<service> start:dev
pnpm --filter @booking-ticket-system/web dev     # Vite dev server, proxies /api to the gateway

pnpm build                                      # pnpm -r --filter=./apps/* --filter=./libs/* build
pnpm lint                                       # pnpm -r --filter=./apps/* --filter=./libs/* lint
pnpm test                                        # pnpm -r --filter=./apps/* test (jest per service)

# Single test file within one service:
pnpm --filter @booking-ticket-system/<service> exec jest path/to/file.spec.ts

# Prisma, per service (schema at apps/<service>/prisma/schema.prisma):
pnpm --filter @booking-ticket-system/<service> exec prisma migrate dev --name <name>   # new migration
pnpm --filter @booking-ticket-system/<service> exec prisma generate                     # regen client only

# Type-check a service/lib without emitting (fast correctness check after edits):
pnpm --filter @booking-ticket-system/<service> exec tsc --noEmit
```

Services and default ports: gateway `3000`, user `3001`, event `3002`, booking `3003`, payment `3004`, ticket `3005`, notification `3006`, web `5173`. Each backend service exposes `GET /health/live`, `GET /health/ready`, and Swagger at `GET /docs` (except notification-service, whose only REST surface is `/notifications/*`).

Payments default to a mock gateway (`PAYMENT_GATEWAY_MODE=mock`, `apps/payment-service/.env`) — no real VNPay/MoMo/PayPal credentials needed for the full checkout flow (`apps/payment-service/src/gateway/mock.gateway.ts`).

There's also a demo data seeder: `node scripts/seed-demo-data.mjs` (talks to the system over HTTP through the gateway, like a real client — needs infra + all services up first).

## Architecture

**Database per service, ID-only cross-references.** Each backend service owns its own Postgres DB (`apps/<service>/prisma/schema.prisma`, its own `DATABASE_URL`) and never imports another service's Prisma client. A reference to another service's entity is just a bare string ID field with a comment like `// ID-only reference into user-service`. There is no cross-service join at the DB level — a service either denormalizes what it needs at write time or calls the other service's HTTP API.

**Two ways services talk to each other:**
- **Synchronous internal HTTP** — a small typed client per dependency (e.g. `apps/booking-service/src/event-client/event-service.client.ts`) calling the other service's `/internal/*` routes, guarded by `INTERNAL_TOKEN` and wrapped in an `opossum` circuit breaker (open → `ServiceUnavailableException` instead of piling up hung requests). Used for anything that needs an immediate answer (reserve a seat, check ownership).
- **Asynchronous events over RabbitMQ** — `libs/event-contracts` defines every `EXCHANGES`/`ROUTING_KEYS`/payload type shared across services; a service publishes via its own `RabbitMqService.publish(exchange, routingKey, payload)` and consumers register with `RabbitMqService.consume<T>(exchange, queue, routingKey, handler)`. Every envelope carries a UUID `eventId`; consumers record it in a per-service `ProcessedEvent` table inside the same transaction as the side effect, so a broker redelivery (at-least-once) is a no-op, not a double-charge/double-ticket. A handler that throws nacks to a dead-letter queue (metrics track `dlqMessagesTotal`) rather than crash-looping. This is the backbone of the booking saga: `OrderPaid → TicketIssued → (email + in-app notification)`, with compensating flows (`OrderCanceled`, `RefundApproved`) for failure paths — see `docs/spec/09-event-contracts.md` for the full catalog and `docs/spec/03-system-design.md` for the saga sequence.

**api-gateway is the only trust boundary.** It's an Express app (`apps/api-gateway/src/main.ts`) that verifies the JWT itself (`proxy/jwt-context.middleware.ts`, raw `jsonwebtoken`, `JWT_ACCESS_SECRET`) and forwards the decoded identity to every downstream service as trusted `X-User-Id`/`X-User-Role` headers — no other service re-verifies the token; they just read those headers via a `CurrentActor` decorator + `RequireAuthGuard` (same shape copy-pasted per service: `src/auth/current-actor.decorator.ts`, `src/auth/require-auth.guard.ts`). Path prefix → upstream service is a static table in `apps/api-gateway/src/proxy/routes.ts`; `http-proxy-middleware` does the actual proxying with **no path rewrite** (Express's `app.use(prefix, ...)` mounting already strips the prefix — do not add an explicit `pathRewrite`, it double-strips prefixes that also appear mid-path, e.g. `/user` inside `/users/me`). The gateway only proxies plain HTTP, not WebSocket upgrades — a service's Socket.io gateway (event-service's seat map, notification-service's live notifications) is reached by the frontend directly on that service's own port, not through the gateway.

**Everything is at-least-once and expected to be retried/redelivered.** Idempotency isn't optional anywhere a broker or a payment webhook is involved — check for the existing `ProcessedEvent`/unique-constraint guard pattern before adding a new consumer or webhook handler.

**Shared packages live in `libs/`** (`@booking-ticket-system/<name>`, `private: true`, `workspace:*` dependency, built via `tsc -p tsconfig.json` into `dist/`, consumed via `main`/`types` pointing at `dist/`). Currently: `event-contracts` (broker payload/routing-key types) and `email-templates` (subject/HTML content per notification type, one function per type — keeps content out of the consumers that send it). Follow this exact shape for any new shared package.

**Prisma client is generated per-service into `src/generated/prisma`** (not `node_modules/.prisma`), gitignored, regenerated by `prisma generate` (prefixed onto every `build`/`start*`/`test` script in that service's `package.json`). A NestJS app built via `nest build`'s webpack pipeline needs an explicit `assets` entry in `nest-cli.json` (`{"include": "generated/**/*", "outDir": "dist"}`) or the generated client silently won't be copied into `dist/` on the next full build — if a freshly-`start:dev`'d service throws `Cannot find module '../generated/prisma'`, check that file first.

**Email is provider-agnostic.** `apps/notification-service`'s `MailerService` picks a nodemailer transport by `EMAIL_PROVIDER`: `smtp` (default, local dev, targets the `mailpit` container) or `ses` (production, AWS SES via nodemailer's built-in SES transport, credentials from the standard AWS SDK chain — never hardcoded). Content comes from `libs/email-templates`, not inline strings in the consumer.

**Frontend** (`apps/web`) is React + Vite + TanStack Query + Tailwind, no Redux — server state lives in Query cache, the only client-side global state is `AuthContext` (JWT + user in `localStorage`, key `ticketbox.auth`). API calls go through a single `axios` instance (`src/api/client.ts`) with an auth-refresh interceptor; per-domain API modules (`src/api/events.ts`, `src/api/tickets.ts`, ...) wrap it. Routes are grouped by role (Customer/Organizer/Admin) in `src/App.tsx`. In dev, Vite proxies `/api/*` to the gateway (`vite.config.ts`) — WebSocket connections (notification-service) bypass this and connect directly to that service's own port via `VITE_NOTIFICATION_WS_URL`.

## Status

Phases 0–7 of `docs/spec/11-implementation-roadmap.md` (full backend saga: register → browse → hold → pay → ticket → email → check-in → refund) plus the matching frontend are implemented and have been run end-to-end against real infra. Phase 8's Swagger + error envelope are wired; the deeper resilience items in 8b/8c (Redis read-through cache, circuit breakers, DLQ alerting, waiting room) are designed in `12-resilience-and-failure-design.md` but not fully built. Phase 9 (Dockerfiles + Swarm stack) and Phase 10 (k6 scripts + CI) exist but haven't been run through a real deploy/load test — treat their numbers as unverified until someone does.
