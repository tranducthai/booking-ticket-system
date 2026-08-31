# Docker Swarm stack — Booking Service (template for the other services)

Single-node Docker Swarm is what this project actually runs for the load / self-healing
/ autoscaling demo. No Kubernetes: on one local node a control plane + `kubectl` +
an ingress controller buy nothing over `docker stack deploy`, which is the same
`docker` CLI already in use. K8s becomes worth it multi-node on cloud — noted as
future work in [../04-deployment-design.md](../04-deployment-design.md).

## Concept mapping ↔ Docker Swarm

| Concept | Kubernetes | Docker Swarm |
|---|---|---|
| Edge / L7 routing | Ingress + NGINX controller | `api-gateway` service on a published port + Swarm's routing mesh; add Traefik only if you want edge path-rules / rate-limit |
| "Target group" (pick instances) | Service + label selector | Swarm service VIP + built-in round-robin over healthy tasks |
| One running instance | Pod | Task (a single container) |
| Desired count + self-healing | Deployment controller (`replicas` + probes) | Swarm manager reconciliation loop (`deploy.replicas` + `healthcheck`) |
| Autoscale on CPU | HorizontalPodAutoscaler (+ metrics-server) | `autoscaler` sidecar: `docker stats` → `docker service scale` |
| Keep N up during maintenance | PodDisruptionBudget | `update_config.parallelism: 1` + `order: start-first` |
| Config / secrets | ConfigMap / Secret | `docker config` / `docker secret` (plain env for the demo) |
| Zero-downtime deploy | RollingUpdate `maxUnavailable: 0` | `update_config: order: start-first, failure_action: rollback` |

## Setup

```bash
docker swarm init                                        # one-time; a single node is fine

# build images (once each service has a Dockerfile — Phase 9)
docker build -t booking-service:local apps/booking-service
docker build -t swarm-autoscaler:local docs/spec/swarm/autoscaler

docker stack deploy -c docs/spec/swarm/docker-stack.yml ticketing
docker stack services ticketing
```

Postgres / Redis / RabbitMQ still come from [../../../infra/docker-compose.yml](../../../infra/docker-compose.yml).
For a self-contained stack, copy those blocks into `docker-stack.yml` on the same
`backend` network.

## Demo 1 — self-healing (worth recording for the defense)

```bash
# terminal 1: watch the tasks
watch -n1 docker service ps --no-trunc ticketing_booking-service

# terminal 2: kill a task's container outright (simulates a crash)
docker rm -f "$(docker ps -q -f label=com.docker.swarm.service.name=ticketing_booking-service | head -1)"
```

In terminal 1 you'll see the killed task go `Failed`/`Shutdown`, and the manager start
a **new** task within seconds (it detects running < desired = 3 and compensates). The
same thing happens when the `healthcheck` fails 3 times in a row — the manager marks the
task `unhealthy` and replaces it.

## Demo 2 — autoscaling

```bash
# terminal 1: autoscaler decisions
docker service logs -f ticketing_autoscaler

# terminal 2: generate load (hey or k6)
hey -z 90s -c 200 http://localhost/booking/health
```

The autoscaler logs the average CPU climbing past `CPU_UP` (60%) and prints
`>> scale UP 3 -> 6`; `docker service ps ticketing_booking-service` then shows 6 tasks.
Stop the load and after `DOWN_COUNT` low readings it steps back down toward `MIN`.

## The single healthcheck vs K8s liveness + readiness

Swarm has **one** `healthcheck`, not two probes. The two K8s behaviours are recovered by:

- **"liveness" (dead → replace):** healthcheck fails `retries` times → manager kills and
  recreates the task.
- **"readiness" (not ready → don't route / don't cut over):** `start_period` holds off
  health evaluation while the app boots, and `update_config: order: start-first` means a
  new task must pass its healthcheck **before** the old one is removed during a deploy.
  Swarm's routing mesh only sends traffic to tasks currently passing the healthcheck.

## Applying to the other 5 services

Copy the `booking-service` block, then change:

- `image:` and the `environment:` values
- Ingress-equivalent routing is the `api-gateway` path map ([../08-api-contracts.md](../08-api-contracts.md)) — nothing to edit here
- Only `booking-service` gets the `autoscaler` for the demo; the others stay at a fixed
  `replicas: 1-2` (bump `event-service` to 2-3 — the browse/search path carries the most read traffic)

## Points worth emphasising when defending the project

- Swarm's **reconciliation loop** (desired vs running, replace the difference) is the
  self-healing mechanism — conceptually identical to a K8s Deployment, minus the control plane.
- **Autoscaling is not native to Swarm** (nor to K8s without metrics-server). The sidecar
  is a deliberate, minimal control loop: *measure → compare to target → actuate → cooldown*.
  Being able to explain every line of `autoscale.sh` is stronger than a black-box HPA.
- `order: start-first` + `failure_action: rollback` give **zero-downtime deploys** and
  automatic rollback of a bad image.
