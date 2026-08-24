# DEPLOYMENT & LOAD DESIGN
## Online Event Ticketing System (similar to Ticketbox)

---

## 1. High-load design (Flash sale / ticket sales opening)

*(The full load-flow diagram was shown during the discussion — 5 layers: Client → CDN & Load Balancer → Waiting Room → Booking Service (Redis lock) → Queue & Database.)*

### Why this is the most dangerous bottleneck
At the moment tickets go on sale (especially for a hot event), tens of thousands of people can send requests within seconds — very different from average daily load. Without designing specifically for this scenario, the system can easily crash or oversell.

### 5 defense layers

| Layer | Role | Specific technique |
|---|---|---|
| **CDN & Load Balancer** | Block static load at the source, evenly distribute dynamic load | CDN caches images/landing pages; Load balancer (round-robin or least-connection) distributes requests across multiple API Gateway instances |
| **Waiting room (virtual queue)** | Control how many requests get into the booking system at once | Store the queue in a Redis sorted set (ordered by arrival time), release batches into the Booking Service at exactly the safe processing rate measured via load testing |
| **Booking Service + Redis lock** | Ensure no 2 people can hold the same seat/ticket | Atomic `SETNX` operation or a Lua script on Redis; TTL ~10 min to auto-release the seat if the customer abandons the flow |
| **Queue & Database** | Decouple the rate of receiving requests from the rate of writing data | Confirmed booking requests are pushed to a message queue, workers write to the DB at a rate the DB can handle, avoiding a bottleneck/crash at the storage layer |
| **Auto-scaling & Circuit breaker** *(additional)* | Auto-expand under load, prevent cascading failures | Horizontal auto-scale the Booking Service based on queue length/CPU; circuit breaker between services (e.g. a Payment Service failure doesn't take down the whole system) |

### Work needed to get concrete numbers for the report
- **Load test** with k6 or JMeter to determine the requests/second threshold the Booking Service + Database can handle — this number is used to configure the "release" rate from the waiting room.
- Measure response time (p95/p99 latency) before and after applying each defense layer, to prove effectiveness with data in the report.
- Simulate a ticket-sales-opening scenario with a load test script for N simultaneous users, comparing the error/oversell rate "with" vs "without" the waiting room.

---

## 2. Capacity design for 100,000 concurrent requests

*(The full capacity-funnel diagram was shown during the discussion — narrowing from 100,000 concurrent connections down to 500-1,000 writes/second into the database.)*

### Design principle
The bottleneck isn't in **receiving** 100,000 requests — it's in **processing** them without crashing the database or double-selling tickets. So the correct design is: **accept everything immediately** at the cheap layer (load balancer, Redis), then **release gradually** into the expensive layer (booking, database) at exactly the rate verified to be sustainable.

### Per-layer capacity table

| Layer | Target capacity | How to achieve it |
|---|---|---|
| CDN & Load Balancer | 100,000 concurrent connections | 3-5 Nginx/ALB nodes, OS tuning (ulimit, file descriptors, connection backlog) — a cheap layer, not the bottleneck |
| Waiting room (Redis) | ~100,000 enqueues/second | `ZADD` into a Redis sorted set — 1 Redis node handles >100,000 ops/second |
| Release rate into processing | 1,000–2,000 req/second *(needs to be measured via real load testing)* | The "throttle valve" — set to exactly the verified sustainable capacity of Booking Service + Database |
| Booking Service | 1,000–2,000 req/second | Auto-scaling group of ~8-15 instances (if each instance measures ~150-250 req/second) |
| Database (via Queue) | 500–1,000 writes/second | Workers read from the queue, write in batches, connection pooling (PgBouncer), separate read replica for the read/browse path |

### Instance-count formula

```
Instance count = ceil( target_RPS / measured_RPS_per_instance ) × 1.3 (buffer factor)
```

Example: target 1,500 req/second, each instance measures 200 req/second → `1,500/200 = 7.5 → 8 × 1.3 ≈ 10-11 instances`.

**Note:** the RPS/instance numbers above are only illustrative examples — the real numbers depend on the tech stack and specific configuration. A **real load test** (k6/JMeter) needs to be run against the actual deployment to get accurate numbers; this is a part worth including in the report to prove the design with experimental data, not just theory.

### User experience when being "throttled"
At a release rate of 1,500 req/second, processing all 100,000 queued people takes about ~67 seconds. This is normal behavior for a real ticketing system (even Ticketmaster) — as long as the waiting room shows the queue position/estimated wait time, the experience remains acceptable, and most importantly the system doesn't crash and doesn't oversell.

---

## 3. Load design at the container layer (Kubernetes)

*(The full architecture diagram was shown during the discussion — Client → ALB (Ingress) → Target Group (Service, multiple containers/pods) → Orchestrator monitoring & self-healing.)*

### Mapping concepts to Kubernetes

| Concept | In Kubernetes |
|---|---|
| ALB | **Ingress** (+ Ingress Controller, e.g. NGINX) |
| Target Group | **Service** (selects pods via label selector) |
| Container | **Pod** |
| Orchestrator (monitoring & self-healing) | **Deployment controller** (based on `replicas` + probes) |
| Auto Scaling | **HorizontalPodAutoscaler (HPA)** |
| Guarantee a minimum of N containers during maintenance | **PodDisruptionBudget (PDB)** |

### Self-healing mechanism

The Deployment controller continuously compares `desired_count` (the declared pod count, e.g. 3) with `actual_count` (the number of pods currently healthy). If they diverge (due to a pod crashing/being OOM-killed/failing a health check), the controller **automatically creates a replacement pod** within seconds, with no human intervention needed.

There are 2 independent probe layers, easy to confuse if not carefully distinguished:

| Probe | Checked by | On failure |
|---|---|---|
| **Readiness probe** | Service (equivalent to an ALB health check) | Stops sending traffic to the pod, does **not** kill it (used when the pod is temporarily overloaded/warming up) |
| **Liveness probe** | Deployment controller | **Kills the pod and creates a replacement** — this is exactly the "self-replace on crash" mechanism |
| **Startup probe** | Deployment controller | Gives the pod time to start up (connect to DB/Redis) before the 2 probes above start counting |

### Auto Scaling (HPA)

HPA monitors the pods' average CPU/RAM, automatically scales the pod count within a `minReplicas`–`maxReplicas` range. The floor (`minReplicas: 3`) is an independent redundancy baseline, not derived from load — it just guarantees fault-tolerance headroom regardless of traffic. Scale up reacts immediately once the threshold is crossed (prioritizing crash avoidance), scale down waits a few minutes of stable load to avoid flapping.

**Two different ceilings — don't confuse them when defending the project:**
- **Target production ceiling** (the design number, for the report's capacity-planning story): ~8-15 instances, estimated from 1,000–2,000 req/s ÷ ~150-250 req/s per instance in section 2 above. This is what the system would need to scale to if it were actually deployed at flash-sale scale.
- **Local demo ceiling** (`maxReplicas: 6` in `hpa.yaml`, what actually runs on minikube/k3s): a much smaller number chosen to be practical on a laptop and to demo cleanly — `3 → 6` is exactly one doubling step under the `scaleUp` policy below (100%/30s), so generating enough load to trigger one scale-up event is enough to show the mechanism working end-to-end. Only `booking-service` needs HPA enabled for the demo; the other 5 services can stay at a fixed 1-2 replicas.

### Sample manifests

A complete set of sample YAML files has been prepared for the Booking Service (applied the same way to the other 5 services): `deployment.yaml`, `service.yaml`, `hpa.yaml`, `pdb.yaml`, `ingress.yaml`, `configmap-secret.yaml`, along with a README with deployment instructions and a **live demo of the self-replacement mechanism** (manually deleting a pod, watching Kubernetes automatically create a new one) — well worth recording as visual evidence when defending the project.

### Current status
This section is currently at the **design** stage — not yet deployed to a real cluster. Once coding starts, this mechanism can be tested on a local cluster (minikube/k3s) before moving to a real cloud (EKS/GKE) if needed.

---

## 4. Next steps for the deployment section

- Write a **concrete load-test script** (k6 script) to get real numbers instead of the example ones above
- Write a **Dockerfile** for each service (to build the image used in the Kubernetes manifests in section 3)
- Set up a **local Kubernetes cluster** (minikube/k3s) to test the self-healing & auto-scaling mechanisms before going to the cloud
- Design a basic **CI/CD pipeline** (build → test → deploy)
- Configure **monitoring & alerting** (Prometheus + Grafana, or something simpler depending on time)

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md*
