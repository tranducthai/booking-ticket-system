# syntax=docker/dockerfile:1
#
# Build from the REPO ROOT (not this folder) — a pnpm workspace package needs
# the root lockfile + its workspace siblings (libs/event-contracts) to
# resolve, so `docker build -f apps/booking-service/Dockerfile .` from the
# repo root is required; `docker build apps/booking-service` alone (the
# shape shown in docs/spec/swarm/README.md before this Dockerfile existed)
# would NOT work for a workspace: dependency. See docs/spec/swarm/README.md
# for the updated build command.

FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @booking-ticket-system/event-contracts build
RUN pnpm --filter @booking-ticket-system/booking-service build
RUN pnpm prune --prod --no-optional

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=builder /repo ./
WORKDIR /repo/apps/booking-service
EXPOSE 3003
CMD ["node", "dist/main.js"]
