# INFRASTRUCTURE DIAGRAM
## Online Event Ticketing System (similar to Ticketbox)

---

Diagrams below are written in [Mermaid](https://mermaid.js.org) — they render natively in GitHub's markdown viewer and in most editors (VS Code with the Mermaid extension). No external tool required; if a raster/PNG export is needed for the report, paste the code block into mermaid.live or draw.io (File → Import from → Mermaid).

## 1. Overall infrastructure

Solid arrows = synchronous REST calls. Dashed arrows = asynchronous events via the message broker (Saga choreography, see [03-system-design.md](03-system-design.md)).

```mermaid
flowchart TB
    web["Web / Mobile Client"]

    subgraph edge["Edge Layer"]
        cdn["CDN"]
        lb["Load Balancer"]
        ingress["Kubernetes Ingress<br/>(NGINX Ingress Controller)"]
    end

    subgraph gw["API Gateway Layer"]
        gateway["API Gateway (NestJS)<br/>JWT verify + routing + rate-limit"]
        waitroom[("Waiting Room<br/>Redis sorted set, ZADD")]
    end

    subgraph services["Business Microservices (NestJS)"]
        user["User Service"]
        event["Event Service"]
        booking["Booking Service"]
        payment["Payment Service"]
        ticket["Ticket Service"]
        notif["Notification Service"]
    end

    subgraph data["Data Layer — Database per Service"]
        userdb[("user_db<br/>PostgreSQL")]
        eventdb[("event_db<br/>PostgreSQL")]
        bookingdb[("booking_db<br/>PostgreSQL")]
        paymentdb[("payment_db<br/>PostgreSQL")]
        ticketdb[("ticket_db<br/>PostgreSQL")]
        seatcache[("Seat-hold cache<br/>Redis, TTL ~10 min")]
    end

    mq{{"RabbitMQ<br/>event broker"}}

    paygw["Payment Gateway<br/>(VNPay / Momo / ZaloPay)"]
    emailsms["Email/SMS Gateway"]

    web -->|HTTPS| cdn --> lb --> ingress --> gateway

    gateway -->|REST: login| user
    gateway -->|REST: search/browse| event
    gateway -->|REST: checkout| waitroom
    waitroom -->|released at verified safe rate| booking
    booking -->|REST: lock seat| event
    booking --- seatcache
    event --- seatcache
    gateway -->|REST: pay| payment
    payment -->|redirect / webhook| paygw

    user --- userdb
    event --- eventdb
    booking --- bookingdb
    payment --- paymentdb
    ticket --- ticketdb

    payment -.->|publish PaymentSucceeded| mq
    mq -.->|consume: mark order Paid| booking
    mq -.->|consume: generate QR| ticket
    mq -.->|consume: send e-ticket| notif
    notif -->|SMTP/API| emailsms
```

## 2. Kubernetes object topology (per service)

Same pattern applies to all 6 services — shown here for `booking-service` (see [docs/spec/k8s](k8s) for the actual manifests, and [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md) for how they map into `infra/k8s/<service>/`).

```mermaid
flowchart LR
    ing["Ingress<br/>path: /booking"]

    subgraph cluster["Kubernetes Cluster"]
        svc["Service: booking-service<br/>ClusterIP, label selector"]

        subgraph deploy["Deployment: booking-service"]
            pod1["Pod"]
            pod2["Pod"]
            pod3["Pod"]
        end

        hpa["HorizontalPodAutoscaler<br/>minReplicas 3 / maxReplicas 6 (local demo)<br/>target prod ceiling ~8-15, see 04-deployment-design.md"]
        pdb["PodDisruptionBudget<br/>minAvailable 2"]
        dc["Deployment Controller"]
    end

    ing --> svc
    svc --> pod1
    svc --> pod2
    svc --> pod3
    hpa -.->|watches CPU/RAM, scales replica count| deploy
    pdb -.->|blocks voluntary eviction below minAvailable| deploy
    dc -.->|desired vs actual count, replaces crashed pods<br/>liveness/readiness/startup probes| deploy
```

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md*
