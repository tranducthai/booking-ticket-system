# SƠ ĐỒ HẠ TẦNG
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

Các sơ đồ dưới đây được viết bằng [Mermaid](https://mermaid.js.org) — render trực tiếp trong trình xem markdown của GitHub và hầu hết editor (VS Code với extension Mermaid). Không cần công cụ ngoài; nếu cần xuất ảnh raster/PNG cho báo cáo, dán code block vào mermaid.live hoặc draw.io (File → Import from → Mermaid).

## 1. Hạ tầng tổng thể

Mũi tên liền = gọi REST đồng bộ. Mũi tên đứt = event bất đồng bộ qua message broker (Saga choreography, xem [03-system-design.md](03-system-design.md)).

```mermaid
flowchart TB
    web["Web / Mobile Client"]

    subgraph edge["Edge Layer"]
        cdn["CDN<br/>cache trang sự kiện + layout seat-map"]
        lb["Load Balancer<br/>(AWS ALB / Swarm routing mesh)"]
    end

    subgraph gw["API Gateway Layer"]
        gateway["API Gateway (NestJS)<br/>xác thực JWT + định tuyến + rate-limit"]
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
        seatcache[("Cache giữ chỗ ghế<br/>Redis, TTL ~10 phút")]
        readcache[("Read cache + snapshot trạng thái seat-map<br/>Redis, TTL 1s–30s, dựng lại 1 lần/giây")]
    end

    mq{{"RabbitMQ<br/>event broker"}}

    paygw["Payment Gateway<br/>(VNPay / Momo / ZaloPay)"]
    emailsms["Email/SMS Gateway"]

    web -->|HTTPS| cdn --> lb --> gateway

    gateway -->|REST: login| user
    gateway -->|REST: search/browse<br/>phục vụ từ cache| event
    gateway -->|REST: checkout| waitroom
    waitroom -->|thả ra theo tốc độ an toàn đã kiểm chứng| booking
    booking -->|REST: khóa ghế| event
    booking --- seatcache
    event --- seatcache
    event --- readcache
    gateway -->|REST: thanh toán| payment
    payment -->|redirect / webhook| paygw

    user --- userdb
    event --- eventdb
    booking --- bookingdb
    payment --- paymentdb
    ticket --- ticketdb

    payment -.->|publish PaymentSucceeded| mq
    mq -.->|consume: đánh dấu đơn Paid| booking
    mq -.->|consume: sinh QR| ticket
    mq -.->|consume: gửi vé điện tử| notif
    notif -->|SMTP/API| emailsms
```

## 2. Topology service Docker Swarm (theo từng service)

Cùng một mẫu áp dụng cho toàn bộ 6 service — minh họa ở đây cho `booking-service` (xem [docs/spec/swarm](swarm) để lấy stack template, và [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md) để biết cách nó ánh xạ vào `infra/swarm/`).

```mermaid
flowchart LR
    gw["api-gateway<br/>path: /booking"]

    subgraph swarm["Docker Swarm (1 node local)"]
        vip["Service VIP: booking-service<br/>routing mesh, round-robin"]

        subgraph svc["Service: booking-service (deploy.replicas 3)"]
            t1["Task"]
            t2["Task"]
            t3["Task"]
        end

        auto["autoscaler sidecar<br/>MIN 3 / MAX 6 (demo local)<br/>trần production mục tiêu ~6-10, xem 04-deployment-design.md"]
        upd["update_config<br/>parallelism 1, order start-first<br/>(tương đương PDB)"]
        mgr["Swarm manager<br/>reconciliation loop"]
    end

    gw --> vip
    vip --> t1
    vip --> t2
    vip --> t3
    auto -.->|docker stats CPU pct, sau đó docker service scale| svc
    upd -.->|từng task một, task mới qua healthcheck trước khi gỡ task cũ| svc
    mgr -.->|desired vs running, thay thế task crash hoặc unhealthy<br/>một healthcheck cộng start_period| svc
```

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md*
