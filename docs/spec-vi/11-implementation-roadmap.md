# LỘ TRÌNH TRIỂN KHAI
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

Trình bày dưới dạng checklist để có thể theo dõi tiến độ trực tiếp qua lịch sử git — tick một ô, commit, chuyển sang mục tiếp theo. Mỗi phase nên lên thành một commit riêng (hoặc vài commit nhỏ), không bao giờ dồn thành một commit khổng lồ ở cuối. Thứ tự được sắp xếp sao cho mỗi phase chỉ phụ thuộc vào việc các phase phía trên đã **dùng được** (không nhất thiết phải "hoàn thiện").

**Câu hỏi còn bỏ ngỏ trước Phase 0:** chưa có quyết định nào về frontend framework ở bất kỳ đâu trong các tài liệu spec — mọi thứ từ trước tới nay (01-10) chỉ thuần backend. Nếu frontend nằm trong phạm vi bảo vệ đồ án, nó cần một quyết định stack riêng (nhiều khả năng là React/Next, do lựa chọn NestJS/TypeScript trong [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md)) và một phase riêng. Nêu ra ở đây thay vì mặc định giả định.

---

## Phase 0 — Scaffold monorepo

- [ ] `pnpm-workspace.yaml` + `package.json` gốc (devDependencies dùng chung: TypeScript, ESLint, Prettier, cấu hình Jest)
- [ ] `apps/api-gateway`, `apps/user-service`, `apps/event-service`, `apps/booking-service`, `apps/payment-service`, `apps/ticket-service`, `apps/notification-service` — mỗi service khởi tạo từ một skeleton `nest new` mới
- [ ] Package `libs/event-contracts` — dán vào các interface từ [09-event-contracts.md](09-event-contracts.md)
- [ ] `infra/docker-compose.yml` — Postgres × 5 (mỗi service sở hữu bảng có một instance), Redis, RabbitMQ, cả 7 app
- [ ] `.env.example` cho từng service (DB URL, Redis URL, RabbitMQ URL, JWT secret, port)
- [ ] `README.md` gốc — cách chạy `docker compose up`, tài liệu nào nằm ở đâu

**Commit checkpoint:** skeleton rỗng nhưng chạy được, `docker compose up` khởi động cả 7 service + hạ tầng không lỗi.

---

## Phase 1 — User Service (nền tảng xác thực)

Mọi thứ khác đều cần JWT, nên phase này đi trước.

- [ ] Prisma schema: model `User` từ [07-database-schema.md](07-database-schema.md) §1, migration
- [ ] `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` theo [08-api-contracts.md](08-api-contracts.md) §1
- [ ] JWT strategy (`passport-jwt`) + role guard (`CUSTOMER`/`ORGANIZER`/`ADMIN`)
- [ ] `GET/PATCH /users/me`
- [ ] Unit test cho các luồng auth (đăng ký trùng email, sai mật khẩu, refresh token)
- [ ] *(mở rộng, có thể để sau)* OAuth Google/Facebook

**Commit checkpoint:** đăng ký được, đăng nhập được, nhận về một JWT giải mã đúng.

---

## Phase 2 — Skeleton API Gateway

- [ ] Reverse-proxy định tuyến tới User Service (`/user/*`)
- [ ] Middleware xác thực JWT — giải mã token, chuyển tiếp header `X-User-Id` / `X-User-Role` xuống downstream, từ chối token không hợp lệ/hết hạn
- [ ] Nối bảng map path-prefix → service từ [08-api-contracts.md](08-api-contracts.md) (`/user`, `/event`, `/booking`, `/payment`, `/ticket`) vào cấu hình proxy của gateway — gateway là bộ định tuyến ở biên (không có Ingress riêng dưới Swarm)

**Commit checkpoint:** gọi tới `/user/auth/login` của gateway proxy đúng qua với một JWT round-trip thật.

---

## Phase 3 — Event Service

- [ ] Prisma schema: `Category`, `Event`, `TicketType`, `SeatMap`, `SeatZone`, `Seat`, `DiscountCode` từ [07-database-schema.md](07-database-schema.md) §2
- [ ] CRUD sự kiện + luồng submit/approve/reject (UC-03, UC-08)
- [ ] Endpoint danh mục (category)
- [ ] CRUD loại vé (General Admission)
- [ ] Endpoint xây dựng seat map (khu vực + lưới ghế hàng/cột)
- [ ] Endpoint tìm kiếm/lọc (UC-06) — danh mục, địa điểm, khoảng thời gian, khoảng giá, từ khóa
- [ ] CRUD mã giảm giá + endpoint validate (UC-07)
- [ ] Endpoint nội bộ hold/release/confirm (Redis `SETNX` + TTL ~10 phút, theo thiết kế QR/hold ở [09-event-contracts.md](09-event-contracts.md) và [01-business-analysis.md](01-business-analysis.md) §5)
- [ ] WebSocket gateway (`Socket.IO`) broadcast thay đổi trạng thái ghế theo từng room sự kiện
- [ ] Test concurrency: 2 request hold đồng thời cho cùng 1 ghế → đúng 1 request thắng

**Commit checkpoint:** một sự kiện có seat map có thể được tạo, duyệt xem, và một ghế được hold/release với TTL nhìn thấy được trong Redis.

---

## Phase 4 — Booking Service

- [ ] Prisma schema: `Order`, `OrderItem` từ [07-database-schema.md](07-database-schema.md) §3 (+ migration ràng buộc CHECK bằng raw SQL)
- [ ] `POST /cart/hold` — gọi endpoint hold nội bộ của Event Service, tạo `Order`
- [ ] Áp mã giảm giá, lấy/liệt kê đơn hàng, khách hàng tự hủy đơn
- [ ] RabbitMQ consumer: `PaymentSucceeded` → `Order.status = PAID`, publish `OrderPaid`
- [ ] RabbitMQ consumer: `PaymentFailed` → nhả hold qua Event Service, `Order.status = EXPIRED`
- [ ] RabbitMQ consumer: `RefundApproved` → `Order.status = CANCELED`, publish `OrderCanceled`
- [ ] Scheduled job: quét các hold đã hết hạn mà chưa từng có lượt thử thanh toán nào

**Commit checkpoint:** toàn bộ luồng hold → event thanh toán (giả lập) → chuyển trạng thái đơn hàng chạy end-to-end mà Payment Service chưa cần tồn tại (publish event thủ công qua RabbitMQ management UI để test).

---

## Phase 5 — Payment Service

- [ ] Prisma schema: `Payment`, `Refund` từ [07-database-schema.md](07-database-schema.md) §4
- [ ] `POST /payments` — tích hợp một cổng sandbox trước (VNPay sandbox là lựa chọn phổ biến nhất có tài liệu cho đồ án sinh viên VN)
- [ ] Webhook handler, xác minh chữ ký theo tài liệu của nhà cung cấp
- [ ] Publish `PaymentSucceeded` / `PaymentFailed`
- [ ] Endpoint yêu cầu/duyệt/từ chối hoàn tiền (UC-04), publish `RefundApproved` khi hoàn tất

**Commit checkpoint:** một round-trip thanh toán thật (sandbox) cập nhật trạng thái đơn hàng của Booking Service qua broker, không cần inject event thủ công nữa.

---

## Phase 6 — Ticket Service

- [ ] Prisma schema: `Ticket` từ [07-database-schema.md](07-database-schema.md) §5
- [ ] RabbitMQ consumer: `OrderPaid` → sinh một QR đã ký cho mỗi order item (cơ chế HMAC từ [09-event-contracts.md](09-event-contracts.md)), publish `TicketIssued`
- [ ] `POST /tickets/:id/check-in` (UC-02) — xác minh chữ ký (an toàn offline) rồi mới kiểm tra trạng thái trong DB
- [ ] RabbitMQ consumer: `OrderCanceled` → `Ticket.status = CANCELED`
- [ ] `GET /tickets/mine`, `GET /events/:id/attendees`

**Commit checkpoint:** một đơn hàng đã thanh toán sinh ra một QR quét được, và check-in từ chối đúng lượt quét thứ hai của cùng một vé.

---

## Phase 7 — Notification Service

- [ ] RabbitMQ consumer: `TicketIssued` → gửi email vé điện tử kèm QR
- [ ] Dev local: dùng Mailhog hoặc Ethereal thay vì một SMTP provider thật để việc gửi email test được mà không cần tài khoản bên ngoài

**Commit checkpoint:** toàn bộ luồng thành công UC-01, theo dõi end-to-end, kết thúc bằng một email xuất hiện trong Mailhog.

---

## Phase 8 — Hardening xuyên suốt

- [ ] Swagger (`@nestjs/swagger`) trên cả 6 service, đối chiếu chéo với [08-api-contracts.md](08-api-contracts.md)
- [ ] Envelope lỗi tập trung + validation pipe (`class-validator`) trên mọi service
- [ ] Integration test cơ bản cho mỗi luồng Saga (luồng thành công + luồng thanh toán thất bại + luồng hoàn tiền) chạy trên hạ tầng docker-compose

---

## Phase 8b — Mở rộng quy mô đường đọc (login + duyệt + seat map)

Triển khai thiết kế sức chứa đường đọc ở [04-deployment-design.md](04-deployment-design.md) §2a — đợt burst đọc lúc flash sale (~6.000 req/s) mà thiết kế đường ghi chưa bao phủ.

- [ ] API Gateway: cấu hình rate-limit theo từng route; giới hạn chặt cho `/user/auth/login` (ví dụ 5/phút/IP, 20/phút/account); exponential backoff sau N lượt đăng nhập thất bại ở User Service
- [ ] Xử lý burst auth ([04-deployment-design.md](04-deployment-design.md) §2a, "bản thân burst login đã lớn"): client âm thầm gọi `POST /auth/refresh` tại T0 thay vì hiện form login; task login của User Service ở mức 1–2 vCPU + `UV_THREADPOOL_SIZE=8`, hàng đợi công việc bcrypt có giới hạn kèm shed `503`; pre-scale theo lịch cho User Service trước một đợt mở bán đã biết trước; CAPTCHA trên form login cho các khung `high_demand`
- [ ] Event Service: module cache read-through qua Redis — `event:{id}` (TTL 15–30 s), `search:{queryKey}` (TTL 10 s); hook cache-bust trong `events.update/approve/reject`
- [ ] Event Service: tách `getSeatMap` → `getSeatMapLayout` (cache trong `seatmap:layout:{eventId}`, bust khi `createOrReplace`) + `getSeatMapState` (chỉ đọc snapshot Redis)
- [ ] Bỏ lời gọi `healStaleHolds` khỏi đường đọc seat map
- [ ] `SeatSnapshotJob` — mỗi sự kiện đang hoạt động, tick 1 giây: dựng lại `seatmap:state:{eventId}` từ các hold trong Redis + tập hợp đã booked, tính diff, phát **một** frame WS `seat:batch` gộp cho mỗi room
- [ ] `HoldsService`: ngừng emit `broadcastSeatUpdate` cho từng ghế — ghi thay đổi vào Redis và để `SeatSnapshotJob` fan-out ra
- [ ] Cron `StaleHoldSweeper` (30–60 s) — reconcile `SEATS.status` trong Postgres với các hold Redis đã hết hạn
- [ ] Seat map phía client: poll `GET /event/:id/seat-map/state` mỗi 2–3 s theo mặc định; Socket.IO + `@socket.io/redis-adapter` chỉ khi giữ đường realtime cho phần demo
- [ ] Boolean `events.high_demand` + middleware waiting-room chặn các route trang sự kiện (không chỉ checkout) khi cờ được bật
- [ ] Cơ chế bảo vệ chống quá tải cho waiting room ([04-deployment-design.md](04-deployment-design.md) §2, "lượt đến vượt xa sức chứa"): giới hạn độ dài queue ở mức ~3× tồn kho còn lại (từ chối lượt vào mới sau ngưỡng đó), mỗi session giữ đúng 1 token, vị trí/ETA trong response của queue, load-shed `503` + `Retry-After` khi vượt sức chứa edge
- [ ] Load test (script k6 ở Phase 10) riêng cho đường đọc: tỉ lệ cache hit, req/s tới Postgres gốc, độ trễ trạng thái seat map dưới 20k virtual user

**Commit checkpoint:** với cache + snapshot job đang chạy, một lượt chạy k6 với 5.000 virtual user gọi vào chi tiết + seat map của một sự kiện giữ Postgres gốc dưới ~50 req/s và p95 độ trễ trạng thái seat map dưới ~50 ms.

---

## Phase 8c — Resilience & xử lý lỗi

Triển khai [12-resilience-and-failure-design.md](12-resilience-and-failure-design.md). Ưu tiên các mục ảnh hưởng đến tính đúng đắn (correctness) trước.

**Oversell / tính đúng đắn (làm trước — đây là các bug trong code hiện tại):**
- [ ] `confirmSeat(seatId, orderId)` và `releaseSeat(seatId, orderId)` có kiểm tra quyền sở hữu, qua Lua script trên Redis (`GET == orderId` trước khi `DEL`); khi mất hold lúc confirm, kích hoạt một lượt auto-refund bù trừ thay vì chuyển `BOOKED`
- [ ] Gia hạn hold khi bắt đầu thanh toán: `POST /internal/seats/:id/extend-hold` (giới hạn 1 lần) + cờ `PAYMENT_IN_PROGRESS` trên order để sweeper bỏ qua nó
- [ ] Hold nhiều ghế nguyên tử: giành tập seat-key trong một Lua script, rollback phần đã giành được nếu thất bại
- [ ] Idempotency theo từng consumer: bảng `processed_events` ghi trong cùng transaction với handler; sinh vé dùng `INSERT ... ON CONFLICT (orderItemId) DO NOTHING`
- [ ] Tồn kho GA: làm `releaseTicketType` idempotent (theo dõi `reservationReleased` trên order)
- [ ] Mã giảm giá: thêm bước `redeem` nguyên tử (`UPDATE ... WHERE quantityUsed < quantityTotal`) khi order confirm + release có bảo vệ khi hủy
- [ ] Giới hạn số vé mỗi user mỗi sự kiện được áp dụng nguyên tử tại thời điểm hold (bộ đếm Redis trong Lua script acquire)

**Cô lập lỗi (failure isolation):**
- [ ] Timeout trên mọi lệnh gọi liên service + gọi ngoài; circuit breaker (`opossum`) quanh Payment→gateway và gateway→từng service
- [ ] `api-gateway`: connection pool/ngân sách concurrency riêng cho từng downstream (bulkhead) + load-shed `503`+`Retry-After` khi vượt ngân sách
- [ ] RabbitMQ: DLX theo từng queue + giới hạn số lần gửi lại + giới hạn prefetch của consumer; cảnh báo khi bất kỳ `*.dlq` nào có depth > 0
- [ ] Poller đối soát thanh toán (poll cổng thanh toán cho các payment `PENDING` cũ hơn ~2 phút) + `GET /payment/payments/:id` cho client poll
- [ ] Redis: AOF `everysec` ở local; ghi tài liệu về Sentinel/ElastiCache cho AWS; fail-closed với các hold khi Redis không truy cập được
- [ ] Bảo vệ chống cache stampede: lock single-flight khi miss + tính lại sớm có jitter cho các key nóng
- [ ] Guard `X-Internal-Token` (hoặc mTLS) trên mọi route `/internal/*`
- [ ] Worker giải phóng waiting room chạy như một singleton (Redis leader lock hoặc service riêng 1-replica) + tốc độ giải phóng thích ứng theo p99 của Booking / DB pool / ack-lag
- [ ] Graceful shutdown (`SIGTERM` drain, `enableShutdownHooks`), gợi ý WS reconnect-with-jitter; pipeline CD từ chối deploy trong khung `high_demand` đang hoạt động
- [ ] `events.search`: bỏ `COUNT(*)`, dùng cursor pagination; statement timeout trên mọi kết nối DB

**Observability:**
- [ ] Prometheus `/metrics` cho từng service: rate/latency/lỗi, độ sâu queue waiting-room + tốc độ giải phóng, DB pool, Redis, độ sâu queue RabbitMQ + DLQ, **bộ đếm oversell (== 0)**, tỉ lệ chuyển đổi hold→paid
- [ ] Cảnh báo: DLQ > 0, oversell > 0 (page ngay), độ sâu queue không đổi > 60 s, p99 > SLO trong > 2 phút, node down, sai lệch đối soát
- [ ] Correlation ID từ `api-gateway` xuyên suốt mọi service và broker message; structured log theo khóa `orderId` / `eventId`
- [ ] Dashboard "phòng điều khiển flash-sale": phễu lượt đến → xếp hàng → được vào → đã hold → đã thanh toán → đã phát vé + tốc độ giải phóng

**Commit checkpoint:** replay một `PaymentSucceeded` từ RabbitMQ UI → đúng một bộ vé + một email; ép một hold Redis hết hạn giữa lúc thanh toán trong một test → đơn hàng tự động hoàn tiền thay vì oversell; kill worker giải phóng → một cảnh báo bắn ra và một standby giành leader lock.

---

## Phase 9 — Demo Docker Swarm (đã thiết kế xong, chưa áp dụng)

- [ ] Viết Dockerfile cho từng service (multi-stage: build → runtime image gọn nhẹ)
- [ ] `docker swarm init` cục bộ (1 node), build image autoscaler
- [ ] Copy `docs/spec/swarm/docker-stack.yml` vào `infra/swarm/`, chỉnh lại image + biến môi trường
- [ ] Nhân bản khối service cho 5 service còn lại theo checklist per-service trong README
- [ ] Chạy demo self-healing (`docker rm -f` một task, ghi lại việc manager tạo lại nó) và demo autoscaling (`3 → MAX 6`, tạo tải bằng `hey`/k6) theo [docs/spec/swarm/README.md](swarm/README.md)

---

## Phase 10 — Load testing & CI

- [ ] Script k6 mô phỏng kịch bản flash-sale từ [04-deployment-design.md](04-deployment-design.md), có/không có waiting room, để lấy số p95/p99 thật cho báo cáo
- [ ] Script k6 cho đường đọc (chi tiết sự kiện + trạng thái seat map dưới 5k VU) — kiểm chứng tỉ lệ cache hit và req/s tới Postgres gốc theo [04-deployment-design.md](04-deployment-design.md) §2a
- [ ] Kiểm tra chaos từ [12-resilience-and-failure-design.md](12-resilience-and-failure-design.md): broker message gửi lại → đúng một vé; hold Redis hết hạn giữa lúc thanh toán → auto-refund, bộ đếm oversell vẫn = 0; kill một task / worker giải phóng → hồi phục + cảnh báo
- [ ] Workflow GitHub Actions: lint + test + build cho từng service khi push

---

*Tài liệu liên quan: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 12-resilience-and-failure-design.md*
