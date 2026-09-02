# Ticketbox — Online Event Ticketing System

Microservices booking platform (Node.js/NestJS + TypeScript backend, React frontend). Full spec, ERD, API/event contracts, sequence diagrams, and the implementation roadmap live in [docs/spec/](docs/spec/) — start with [docs/spec/05-project-structure-and-tech-stack.md](docs/spec/05-project-structure-and-tech-stack.md) and [docs/spec/11-implementation-roadmap.md](docs/spec/11-implementation-roadmap.md). A Vietnamese translation of the same docs is in [docs/spec-vi/](docs/spec-vi/).

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io) (`npm install -g pnpm`, or `corepack enable && corepack prepare pnpm@latest --activate` if you don't have it)
- Docker Desktop (for the infra containers below)

## Setup

```bash
pnpm install
cp apps/user-service/.env.example apps/user-service/.env
cp apps/event-service/.env.example apps/event-service/.env
cp apps/booking-service/.env.example apps/booking-service/.env
cp apps/payment-service/.env.example apps/payment-service/.env
cp apps/ticket-service/.env.example apps/ticket-service/.env
cp apps/notification-service/.env.example apps/notification-service/.env
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/web/.env.example apps/web/.env
```

## Run infra (Postgres × 5, Redis, RabbitMQ, Mailhog)

```bash
pnpm infra:up      # docker compose -f infra/docker-compose.yml up -d
pnpm infra:down    # tear it down
```

- RabbitMQ management UI: http://localhost:15672 (guest/guest)
- Mailhog (catches order-confirmed / e-ticket emails in dev): http://localhost:8025

First run only — apply migrations against the fresh containers:

```bash
for s in user-service event-service booking-service payment-service ticket-service; do
  pnpm --filter @booking-ticket-system/$s exec prisma migrate deploy
done
```

## Run everything

Each backend service is a standalone NestJS app under `apps/<service>`, run with hot reload:

```bash
pnpm --filter @booking-ticket-system/user-service start:dev
pnpm --filter @booking-ticket-system/event-service start:dev
pnpm --filter @booking-ticket-system/booking-service start:dev
pnpm --filter @booking-ticket-system/payment-service start:dev
pnpm --filter @booking-ticket-system/ticket-service start:dev
pnpm --filter @booking-ticket-system/notification-service start:dev
pnpm --filter @booking-ticket-system/api-gateway start:dev
pnpm --filter @booking-ticket-system/web dev
```

Then open **http://localhost:5173** for the app (Vite dev server, proxies `/api` to the gateway — see `apps/web/vite.config.ts`).

Each backend service exposes `GET /health/live` + `GET /health/ready` (backs the Docker healthcheck in `infra/swarm/docker-stack.yml`) and interactive API docs at `GET /docs` (Swagger — every service except `notification-service`, which has no REST API).

Default ports: gateway `3000`, user `3001`, event `3002`, booking `3003`, payment `3004`, ticket `3005`, notification `3006`, web `5173`.

Payments run against a **mock gateway** by default (`PAYMENT_GATEWAY_MODE=mock` in `apps/payment-service/.env`) — no real VNPay account needed to exercise the full checkout flow; see `apps/payment-service/src/gateway/mock.gateway.ts`.

## Monorepo layout

```
apps/
  web/                 React + Vite frontend (Customer/Organizer/Admin)
  api-gateway/          reverse proxy + JWT context
  user-service/         auth, profiles, admin user management
  event-service/        events, categories, seat maps, holds, discounts
  booking-service/      cart hold, orders, payment/refund sagas
  payment-service/      payment gateway (mock + VNPay sandbox), refunds
  ticket-service/       QR generation/signing, check-in
  notification-service/ order-confirmed + e-ticket emails
libs/
  event-contracts/      shared broker event types (docs/spec/09-event-contracts.md)
infra/
  docker-compose.yml    local infra (Postgres/Redis/RabbitMQ/Mailhog)
  swarm/                real Docker Swarm deploy stack (self-contained)
  k6/                   load test scripts (flash-sale write path, read path)
docs/spec/               full design docs — business analysis through implementation roadmap
docs/spec-vi/             same docs, Vietnamese
```

## Status

Following the phased roadmap in [docs/spec/11-implementation-roadmap.md](docs/spec/11-implementation-roadmap.md). Phases 0–7 (full backend Saga: register → browse → hold → pay → ticket → email → check-in → refund) and 3b/7b (frontend) are implemented and were run end-to-end at least once against real infra. Phase 8's Swagger + error envelope are wired; the deeper resilience items in 8b/8c (Redis read-through cache, circuit breakers, DLQ alerting, waiting room) are designed in [12-resilience-and-failure-design.md](docs/spec/12-resilience-and-failure-design.md) but not yet built. Phase 9 (Dockerfiles + Swarm stack) and Phase 10 (k6 scripts + CI) exist but haven't been run through a real deploy/load test — treat their numbers as unverified until someone does.
