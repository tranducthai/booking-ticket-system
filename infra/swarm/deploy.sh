#!/usr/bin/env bash
# Build every image and (re)deploy the Swarm stack, run from the repo root
# on the target VM. Requires infra/swarm/.env to exist (copy .env.example
# and fill it in first) and `docker swarm init` to have already run.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

ENV_FILE="infra/swarm/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy infra/swarm/.env.example and fill in real values first." >&2
  exit 1
fi
set -a; source "$ENV_FILE"; set +a

DB_SERVICES=(user-service event-service booking-service payment-service ticket-service notification-service)

for s in "${DB_SERVICES[@]}" api-gateway; do
  echo "== building $s =="
  docker build -f "apps/$s/Dockerfile" -t "$s:local" .
done
# also tag the (already-cached) builder stage for each DB service — it still
# has the prisma CLI, which gets pruned out of the runtime image, so it's
# what runs `prisma migrate deploy` below.
for s in "${DB_SERVICES[@]}"; do
  docker build -f "apps/$s/Dockerfile" --target builder -t "$s:builder" .
done

echo "== building web =="
docker build -f apps/web/Dockerfile \
  --build-arg VITE_NOTIFICATION_WS_URL="http://${PUBLIC_HOST}:3006" \
  -t web:local .

echo "== deploying stack =="
(cd infra/swarm && docker stack deploy -c docker-stack.yml ticketing)

echo "== waiting for databases to be ready =="
sleep 15

declare -A DB_NAME=(
  [user-service]=user_db [event-service]=event_db [booking-service]=booking_db
  [payment-service]=payment_db [ticket-service]=ticket_db [notification-service]=notification_db
)
declare -A DB_HOST=(
  [user-service]=postgres-user [event-service]=postgres-event [booking-service]=postgres-booking
  [payment-service]=postgres-payment [ticket-service]=postgres-ticket [notification-service]=postgres-notification
)

for s in "${DB_SERVICES[@]}"; do
  echo "== migrating $s =="
  docker run --rm --network ticketing_backend \
    -e DATABASE_URL="postgresql://user:password@${DB_HOST[$s]}:5432/${DB_NAME[$s]}" \
    -w "/repo/apps/$s" "$s:builder" \
    pnpm exec prisma migrate deploy
done

echo "== done — check status with: docker stack services ticketing =="
