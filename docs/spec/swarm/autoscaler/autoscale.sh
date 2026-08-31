#!/bin/sh
# Poll-based CPU autoscaler for a single Docker Swarm service — the HPA replacement.
#
# Loop: read `docker stats` for the service's tasks on this node, average the CPU%,
# then `docker service scale` up (double, capped at MAX) or down (one step) within
# [MIN, MAX], with a cooldown after every action so it doesn't flap.
#
# Single-node only: `docker stats` sees local containers, which is every task on a
# one-node Swarm. Multi-node would need one collector per node feeding a shared view.
set -eu

SERVICE="${SERVICE:-ticketing_booking-service}"
MIN="${MIN:-3}"
MAX="${MAX:-6}"
CPU_UP="${CPU_UP:-60}"        # avg CPU% above this -> scale up
CPU_DOWN="${CPU_DOWN:-25}"    # avg CPU% below this for DOWN_COUNT checks in a row -> scale down
INTERVAL="${INTERVAL:-15}"    # seconds between checks
COOLDOWN="${COOLDOWN:-60}"    # seconds to wait after any scaling action
DOWN_COUNT="${DOWN_COUNT:-4}" # consecutive low readings required before scaling down

low_streak=0

desired_replicas() {
  docker service inspect "$SERVICE" --format '{{.Spec.Mode.Replicated.Replicas}}'
}

avg_cpu() {
  ids=$(docker ps -q --filter "label=com.docker.swarm.service.name=$SERVICE")
  if [ -z "$ids" ]; then echo 0; return; fi
  # docker stats CPUPerc looks like "37.5%" — strip the % and average
  docker stats --no-stream --format '{{.CPUPerc}}' $ids \
    | tr -d '%' \
    | awk '{ s += $1; n++ } END { if (n) printf "%.0f", s / n; else print 0 }'
}

echo "autoscaler: watching $SERVICE  min=$MIN max=$MAX  up>${CPU_UP}%  down<${CPU_DOWN}%"

while true; do
  cpu=$(avg_cpu)
  reps=$(desired_replicas)
  echo "$(date -u +%H:%M:%S)  cpu=${cpu}%  replicas=${reps}  low_streak=${low_streak}"

  if [ "$cpu" -ge "$CPU_UP" ] && [ "$reps" -lt "$MAX" ]; then
    target=$((reps * 2))
    [ "$target" -gt "$MAX" ] && target=$MAX
    echo ">> scale UP ${reps} -> ${target}"
    docker service scale "${SERVICE}=${target}" >/dev/null
    low_streak=0
    sleep "$COOLDOWN"
  elif [ "$cpu" -lt "$CPU_DOWN" ] && [ "$reps" -gt "$MIN" ]; then
    low_streak=$((low_streak + 1))
    if [ "$low_streak" -ge "$DOWN_COUNT" ]; then
      target=$((reps - 1))
      echo ">> scale DOWN ${reps} -> ${target}"
      docker service scale "${SERVICE}=${target}" >/dev/null
      low_streak=0
      sleep "$COOLDOWN"
    else
      sleep "$INTERVAL"
    fi
  else
    low_streak=0
    sleep "$INTERVAL"
  fi
done
