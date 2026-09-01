# CẤU TRÚC DỰ ÁN & TECH STACK
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

## 1. Lựa chọn stack

Dự án được triển khai theo hướng **microservices thật sự** (bỏ qua bước modular-monolith-first được gợi ý ở [03-system-design.md](03-system-design.md)), dùng **một ngôn ngữ duy nhất — TypeScript/NestJS** cho toàn bộ service, để giảm chi phí chuyển đổi ngữ cảnh (context-switching) và tận dụng module microservices có sẵn của NestJS (ánh xạ trực tiếp vào thiết kế Saga/event-driven đã có).

| Thành phần | Lựa chọn | Lý do |
|---|---|---|
| Ngôn ngữ | TypeScript (Node.js 20+) | Type-safe, có thể dùng chung với frontend nếu sau này build bằng React/Next |
| Framework mỗi service | NestJS | DI + module rõ ràng, tư duy gần giống Spring Boot, đi kèm sẵn `@nestjs/microservices` |
| API Gateway | Ứng dụng NestJS riêng (`api-gateway`) | Định tuyến request, xác thực JWT, rate-limit/waiting-room theo 5 lớp phòng thủ trong [04-deployment-design.md](04-deployment-design.md) |
| ORM | Prisma | Migration rõ ràng, mỗi service một schema — khớp nguyên tắc Database-per-Service |
| Database | PostgreSQL (1 DB/service) | Theo khuyến nghị trong [03-system-design.md](03-system-design.md) |
| Cache & seat-hold TTL | Redis (`ioredis`) | Giữ chỗ ghế, waiting room (sorted set `ZADD`), khóa qua `SETNX`/Lua script |
| Message broker | RabbitMQ (`@nestjs/microservices` + `amqplib`) | Dễ setup hơn Kafka cho đồ án trường học, đủ để demo Saga choreography |
| Realtime seat map | Socket.IO (`@nestjs/websockets`) trong Event Service | Đẩy trạng thái ghế trực tiếp cho khách đang xem cùng sơ đồ |
| Auth | JWT + `passport-jwt`, do User Service cấp | Gateway/service khác xác thực token cục bộ (local), không cần gọi User Service ở mỗi request |
| QR vé điện tử | `qrcode` + ký HMAC/RSA | Chống làm giả/chụp màn hình dùng lại theo yêu cầu ở [01-business-analysis.md](01-business-analysis.md) |
| Validation/DTO | `class-validator` + `class-transformer` | Chuẩn của NestJS |
| API docs | `@nestjs/swagger` cho từng service | Test nhanh, đồng thời làm tài liệu báo cáo |
| Testing | Jest (tích hợp sẵn trong NestJS) | Unit + e2e |
| Containerization | Docker + Docker Compose (dev local); Docker Swarm cho demo load/self-heal/autoscale | Swarm dùng cùng CLI `docker` — không cần control plane K8s cho 1 node local. Stack mẫu ở [docs/spec/swarm](swarm) |
| CI/CD | GitHub Actions | build → test → build image |
| Load testing | k6 | Đã nhắc tới trong [04-deployment-design.md](04-deployment-design.md) để lấy số liệu tải thực tế |

*(Nếu muốn thể hiện sự đa dạng công nghệ trong báo cáo, có thể viết lại một service — ví dụ Payment Service — bằng Java/Spring Boot để chứng minh khả năng polyglot, nhưng không bắt buộc ngay từ đầu.)*

---

## 2. Cấu trúc thư mục (monorepo)

Dùng **monorepo với pnpm workspaces** — phù hợp quy mô dự án (một người/nhóm nhỏ); bỏ qua Nx/Turborepo vì 6-7 service không cần nhiều tooling phụ như vậy. Mỗi service vẫn hoàn toàn độc lập (Dockerfile riêng, schema riêng, `package.json` riêng) để có thể tách thành repo riêng sau này nếu cần.

```
booking-ticket-system/
├── apps/
│   ├── api-gateway/            # định tuyến, xác thực JWT, rate-limit/waiting-room
│   ├── user-service/           # USERS — đăng ký/đăng nhập, JWT, phân quyền 3 vai trò
│   ├── event-service/          # EVENTS, CATEGORIES, TICKET_TYPES,
│   │                           #   SEAT_MAPS, SEAT_ZONES, SEATS, DISCOUNT_CODES
│   │                           #   + WebSocket gateway cho seat map realtime
│   ├── booking-service/        # ORDERS, ORDER_ITEMS — giỏ hàng, giữ chỗ Redis, saga participant
│   ├── payment-service/        # PAYMENTS, REFUNDS — tích hợp cổng thanh toán, xử lý webhook
│   ├── ticket-service/         # TICKETS — sinh & ký QR, check-in
│   └── notification-service/   # không có DB riêng — RabbitMQ consumer, gửi email/SMS
│
├── libs/
│   └── event-contracts/        # type/interface dùng chung cho message trên broker
│                                #   (PaymentSucceeded, SeatHeld, TicketIssued...)
│
├── infra/
│   ├── docker-compose.yml      # postgres (mỗi service) + redis + rabbitmq + toàn bộ app, cho dev local
│   └── swarm/                  # stack file dùng khi deploy thật — copy & chỉnh từ docs/spec/swarm
│
├── docs/spec/                  # tài liệu phân tích/thiết kế (đã có sẵn)
├── .github/workflows/          # CI: build, test, docker build
├── pnpm-workspace.yaml
├── package.json
└── .gitignore
```

### Ánh xạ service ↔ bảng dữ liệu (đối chiếu với [03-system-design.md](03-system-design.md))

| Service | Sở hữu bảng |
|---|---|
| `user-service` | `USERS` |
| `event-service` | `EVENTS`, `CATEGORIES`, `TICKET_TYPES`, `SEAT_MAPS`, `SEAT_ZONES`, `SEATS`, `DISCOUNT_CODES` |
| `booking-service` | `ORDERS`, `ORDER_ITEMS` |
| `payment-service` | `PAYMENTS`, `REFUNDS` |
| `ticket-service` | `TICKETS` |
| `notification-service` | (không sở hữu bảng nghiệp vụ nào) |

---

## 3. Nguyên tắc tổ chức code

- **`libs/event-contracts` là thư viện dùng chung duy nhất đáng có.** Nó chỉ chứa type/interface cho các message trao đổi giữa các service qua broker, để tránh lệch schema giữa service phát (publish) và service tiêu thụ (consume). Không thêm các package `libs/shared-*` khác trừ khi phát hiện trùng lặp code thật sự giữa nhiều service. Hình dạng payload: [09-event-contracts.md](09-event-contracts.md).
- **Database per Service, tuân thủ nghiêm ngặt:** mỗi service có Prisma schema riêng tại `apps/<service>/prisma/schema.prisma`, migrate độc lập, và **không bao giờ** import trực tiếp Prisma client của service khác. Tham chiếu chéo (ví dụ `ORDER_ITEMS.seat_id` trỏ tới bảng do `event-service` sở hữu) chỉ lưu ID, không có foreign key ở tầng database — tính nhất quán dữ liệu xuyên service được xử lý qua event trên broker (saga choreography), không qua transaction dùng chung. Bản nháp schema từng service: [07-database-schema.md](07-database-schema.md).
- **`docs/spec/swarm/`** là **tài liệu thiết kế mẫu** (cho `booking-service`, dùng làm template cho các service khác) — giữ nguyên để tham khảo. Khi deploy thật, nhân bản `docker-stack.yml` vào `infra/swarm/` cho từng service, chỉnh image + env như ghi trong README.
- **Biến môi trường/secret thật** không bao giờ được commit (đã chặn sẵn qua `.env`, `*.key`, `*.pem` trong `.gitignore`) — dùng `docker secret` / `docker config` lúc deploy; chỉ giá trị env placeholder được đưa vào stack file đã commit.

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md*
