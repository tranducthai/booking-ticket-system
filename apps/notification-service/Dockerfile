# syntax=docker/dockerfile:1
# Build from the repo root — see apps/booking-service/Dockerfile for why.

FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @booking-ticket-system/event-contracts build
RUN pnpm --filter @booking-ticket-system/notification-service build
RUN pnpm prune --prod --no-optional

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=builder /repo ./
WORKDIR /repo/apps/notification-service
EXPOSE 3006
CMD ["node", "dist/main.js"]
