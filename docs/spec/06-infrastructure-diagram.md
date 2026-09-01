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
        cdn["CDN<br/>caches event pages + seat-map layout"]
        lb["Load Balancer<br/>(AWS ALB / Swarm routing mesh)"]
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
        readcache[("Read cache + seat-map state snapshot<br/>Redis, TTL 1s–30s, rebuilt 1/s")]
    end

    mq{{"RabbitMQ<br/>event broker"}}

    paygw["Payment Gateway<br/>(VNPay / Momo / ZaloPay)"]
    emailsms["Email/SMS Gateway"]

    web -->|HTTPS| cdn --> lb --> gateway

    gateway -->|REST: login| user
    gateway -->|REST: search/browse<br/>served from cache| event
    gateway -->|REST: checkout| waitroom
    waitroom -->|released at verified safe rate| booking
    booking -->|REST: lock seat| event
    booking --- seatcache
    event --- seatcache
    event --- readcache
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

## 2. Docker Swarm service topology (per service)

Same pattern applies to all 6 services — shown here for `booking-service` (see [docs/spec/swarm](swarm) for the stack template, and [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md) for how it maps into `infra/swarm/`).

```mermaid
flowchart LR
    gw["api-gateway<br/>path: /booking"]

    subgraph swarm["Docker Swarm (single node local)"]
        vip["Service VIP: booking-service<br/>routing mesh, round-robin"]

        subgraph svc["Service: booking-service (deploy.replicas 3)"]
            t1["Task"]
            t2["Task"]
            t3["Task"]
        end

        auto["autoscaler sidecar<br/>MIN 3 / MAX 6 (local demo)<br/>target prod ceiling ~6-10, see 04-deployment-design.md"]
        upd["update_config<br/>parallelism 1, order start-first<br/>(PDB equivalent)"]
        mgr["Swarm manager<br/>reconciliation loop"]
    end

    gw --> vip
    vip --> t1
    vip --> t2
    vip --> t3
    auto -.->|docker stats CPU pct, then docker service scale| svc
    upd -.->|one task at a time, new passes healthcheck before old removed| svc
    mgr -.->|desired vs running, replaces crashed or unhealthy tasks<br/>single healthcheck plus start_period| svc
```

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md*
