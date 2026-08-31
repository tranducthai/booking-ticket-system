# Ticketbox — Online Event Ticketing System

Microservices booking platform (Node.js/NestJS + TypeScript). Full spec, ERD, API/event contracts, sequence diagrams, and the implementation roadmap live in [docs/spec/](docs/spec/) — start with [docs/spec/05-project-structure-and-tech-stack.md](docs/spec/05-project-structure-and-tech-stack.md) and [docs/spec/11-implementation-roadmap.md](docs/spec/11-implementation-roadmap.md).

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io) (`npm install -g pnpm` if you don't have it)
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
```

## Run infra (Postgres × 5, Redis, RabbitMQ, Mailhog)

```bash
pnpm infra:up      # docker compose -f infra/docker-compose.yml up -d
pnpm infra:down    # tear it down
```

- RabbitMQ management UI: http://localhost:15672 (guest/guest)
- Mailhog (catches e-ticket emails in dev): http://localhost:8025

## Run a service

Each service is a standalone NestJS app under `apps/<service>`, run with hot reload:

```bash
pnpm --filter user-service start:dev
pnpm --filter event-service start:dev
pnpm --filter booking-service start:dev
pnpm --filter payment-service start:dev
pnpm --filter ticket-service start:dev
pnpm --filter notification-service start:dev
pnpm --filter api-gateway start:dev
```

Each exposes `GET /health/live` and `GET /health/ready` (backs the Docker healthcheck in [docs/spec/swarm/docker-stack.yml](docs/spec/swarm/docker-stack.yml)).

Default ports: gateway `3000`, user `3001`, event `3002`, booking `3003`, payment `3004`, ticket `3005`, notification `3006`.

## Monorepo layout

```
apps/            one NestJS app per microservice + the API gateway
libs/
  event-contracts/  shared broker event types (docs/spec/09-event-contracts.md)
infra/
  docker-compose.yml   local infra (Postgres/Redis/RabbitMQ/Mailhog)
  swarm/              (Phase 9) real deploy stack files, adapted from docs/spec/swarm
docs/spec/       full design docs — business analysis through implementation roadmap
```

## Status

Following the phased roadmap in [docs/spec/11-implementation-roadmap.md](docs/spec/11-implementation-roadmap.md). Currently: **Phase 0 — monorepo scaffolding.**
