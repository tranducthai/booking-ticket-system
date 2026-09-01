# THIẾT KẾ KHẢ NĂNG CHỊU LỖI & XỬ LÝ SỰ CỐ
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

[04-deployment-design.md](04-deployment-design.md) tính toán sức chứa (hệ thống chịu được bao nhiêu tải). Tài liệu này là nửa còn lại: **điều gì xảy ra khi tải vượt ngưỡng hoặc một thành phần gặp lỗi** — các cam kết về hành vi, các failure mode phá vỡ tính đúng đắn (đặc biệt là oversell), và các cơ chế cụ thể để giữ vững hệ thống. Tài liệu cũng mang theo một lượt tự phản biện từ góc nhìn của người review/hội đồng chấm (§4).

Lưu ý phạm vi: một số mục dưới đây mô tả phần hardening **chưa có trong code** — được nêu ra ở đây để roadmap ([11-implementation-roadmap.md](11-implementation-roadmap.md) Phase 8c) có thể tiếp nhận, và để báo cáo có thể trình bày chúng như thiết kế có chủ đích, không phải thiếu sót.

---

## 1. Hành vi khi quá tải — ba cam kết

Khi lượt đến vượt xa sức chứa (trường hợp "50.000 người đến cho một thiết kế 20.000", và "50.000 lượt đăng nhập cùng lúc"), hệ thống phải giữ ba lời hứa. Mỗi lời hứa được thực hiện bởi một cơ chế cụ thể, không phải bằng hy vọng.

| Cam kết | Vì sao giữ được | Cơ chế |
|---|---|---|
| **Trang web không sập** | Tải dư được *từ chối một cách sạch sẽ*, không bao giờ bị xếp hàng cho tới khi cạn bộ nhớ/thread | (a) giới hạn kết nối + giới hạn accept-queue ở biên / `api-gateway`; (b) **load-shedding**: khi vượt ngân sách concurrency, trả `503` + `Retry-After` ngay (rẻ) thay vì xử lý; (c) mọi lệnh gọi upstream đều có **timeout** và **circuit breaker** để một dependency chậm không kéo cạn hết worker; (d) hàng đợi công việc có giới hạn trong mỗi service (ví dụ hàng đợi bcrypt ở User Service) shed thay vì phình vô hạn; (e) DB được bảo vệ bởi van xả của waiting room — nó không bao giờ thấy tốc độ ghi vượt quá tốc độ đã kiểm chứng an toàn |
| **User vẫn đăng nhập được** | Đám đông được đưa ra khỏi đường đắt, và đường đắt xuống cấp thành "thử lại", không bao giờ thành "lỗi" | (a) ~95% đến với refresh token còn hạn → âm thầm `POST /auth/refresh` (verify JWT + 1 `SELECT` có index, hàng nghìn/s cho mỗi task); (b) đăng nhập thật bị rate-limit và, khi User Service quá tải, nhận `503` + `Retry-After` — client hiện "hệ thống đang bận, đang thử lại…", không phải một lỗi; (c) đăng nhập nằm sau waiting room cho các sự kiện `high_demand`, nên tốc độ của nó cũng được điều tiết; (d) không ai bị khóa vĩnh viễn — trường hợp xấu nhất là vài lượt thử lại (vài giây tới ~2 phút) |
| **UI vẫn tải được** | Phần khung UI và mọi nội dung nặng-về-đọc được phục vụ từ biên/cache, không phụ thuộc vào tải backend | (a) HTML/JS/CSS/hình ảnh và **trang màn hình xếp hàng** là tĩnh → CDN; (b) chi tiết sự kiện + **layout** seat map được cache ở CDN + Redis (>95% hit); (c) **trạng thái** seat map và "còn X vé" lấy từ snapshot Redis được dựng lại ~1 lần/giây, không bao giờ query Postgres mỗi request; (d) phần "chậm" duy nhất là round-trip đăng nhập và việc được vào waiting room — cả hai đều hiện UI tiến trình (spinner, vị trí xếp hàng, ETA), đây là hành vi được điều tiết, không phải một UI hỏng |

### Thang xuống cấp tuần tự (graceful-degradation ladder)

Khi tải vượt qua các ngưỡng, hệ thống tự động shed các công việc không thiết yếu theo thứ tự:

1. **Bình thường (Normal)** — mọi thứ hoạt động đầy đủ.
2. **Bận (Busy)** (throttle tốc độ giải phóng đang hoạt động) — tăng cache TTL (trang sự kiện 10 s → 60 s); cập nhật real-time WebSocket chuyển về polling 3–5 s; tắt "sự kiện liên quan"/gợi ý/facet tìm kiếm.
3. **Nặng (Heavy)** (waiting room chặn trang sự kiện) — chỉ N user vào được trang; số còn lại ở màn hình xếp hàng tĩnh; tìm kiếm chỉ giới hạn ở các truy vấn đã cache.
4. **Quá tải (Overload)** (chạm ngân sách concurrency ở biên) — `503` + `Retry-After` cho các session mới; các user đã xếp hàng giữ nguyên vị trí và không bị ảnh hưởng.

Mỗi bước đều có thể đảo ngược và được điều khiển bởi một tín hiệu đo được (backlog tốc độ giải phóng, CPU, số kết nối ở biên), không phải một công tắc thủ công.

---

## 2. Các failure mode phá vỡ tính đúng đắn

Đây là những điều một hệ thống bán vé bắt buộc phải làm đúng. "Trang web vẫn chạy" là chưa đủ nếu nó oversell hoặc tính tiền hai lần.

### 2.1 TTL hold ghế và thanh toán chậm — cuộc đua oversell kinh điển

**Lỗi.** `holdSeat` đặt `seat:hold:<seatId>` trong Redis với `SET NX EX 600`. Khách hàng sau đó ở lại >10 phút trên trang cổng thanh toán. Key Redis hết hạn. Lệnh `tryAcquire` của khách hàng thứ hai giờ thành công trên cùng ghế đó. Webhook thanh toán của khách hàng 1 cuối cùng cũng đến → `confirmSeat` đặt `Seat.status = BOOKED`. Khách hàng 2 cũng thanh toán → cũng `BOOKED`. **Ghế bị bán hai lần.** `confirmSeat`/`releaseSeat` hiện tại thậm chí không kiểm tra *ai* đang giữ lock, nên chuyện này trôi qua trong im lặng.

**Cách khắc phục — ba lớp:**

1. **Confirm có kiểm tra quyền sở hữu (đảm bảo cứng).** `confirmSeat(seatId, orderId)` chạy một Lua script nguyên tử: `if redis.call('GET', KEYS[1]) == ARGV[1] then <delete, proceed> else return 0`. Nếu trả về 0, tức hold đã bị mất → Booking Service **không** đánh dấu order là đã thanh toán xong; nó kích hoạt một lượt **auto-refund bù trừ** (luồng kiểu `RefundApproved`) và báo cho khách hàng. Oversell trở nên *bất khả thi*; trường hợp xấu nhất chỉ là một lượt auto-refund hiếm gặp, có thể kiểm toán.
2. **Gia hạn hold khi bắt đầu thanh toán (làm cho việc mất hold trở nên hiếm).** `POST /payments` trước tiên gọi Event Service `POST /internal/seats/:id/extend-hold`, tăng TTL Redis đủ để phủ khung thời gian ở cổng thanh toán (ví dụ +15 phút) và gắn cờ order là `PAYMENT_IN_PROGRESS` để stale-hold sweeper bỏ qua nó. Việc gia hạn bị giới hạn (chỉ 1 lần) để không thể bị lợi dụng thành một hold vô thời hạn.
3. **TTL cơ sở ngắn hơn + đồng hồ đếm ngược trực tiếp trên client (UX).** Hold cơ sở 5–7 phút; trang checkout hiện đồng hồ đếm ngược và chặn submit khi đã hết hạn, để khách hàng hiếm khi rơi vào cuộc đua này.

`releaseSeat` cũng có cùng kiểm tra quyền sở hữu (`GET == orderId` trước khi `DEL`) để một `PaymentFailed` lạc của một order cũ không thể nhả một ghế mà một order *khác* đang hợp lệ giữ.

### 2.2 Hold nhiều ghế không nguyên tử

Hold 5 ghế = 5 lệnh `tryAcquire` riêng biệt. Nếu lệnh thứ 3 thất bại, ghế 1–2 bị bỏ lại ở trạng thái held mà không rollback. **Cách khắc phục:** Booking Service bọc cả nhóm lại — khi có bất kỳ lỗi nào, nhả các ghế đã giành được và trả về toàn bộ request là thất bại ("ghế X, Y không còn khả dụng"). Với các khu vực yêu cầu tất-cả-hoặc-không-gì, thực hiện acquire trong một Lua script duy nhất trên danh sách seat-key.

### 2.3 Redis ↔ Postgres là hai lượt ghi, không phải một

`tryAcquire` (Redis) rồi `seat.update` (Postgres) — một crash giữa hai bước để lại Redis và projection `Seat.status` không khớp nhau. Redis là **nguồn sự thật cho trạng thái hold**; `Seat.status` chỉ là một projection.

- Ở đường đọc, **trạng thái** seat map được lấy từ Redis (theo §2a), nên một `Seat.status` cũ không bao giờ đánh lừa người mua.
- Một **`StaleHoldSweeper`** (mỗi 30–60 s) reconcile Postgres: bất kỳ `Seat.status = HELD` nào không còn key Redis sống và không có order `PAYMENT_IN_PROGRESS` → chuyển về `AVAILABLE`; ghế nào đã `BOOKED` thì để yên.
- Sweeper là **idempotent** và an toàn khi chạy trên mọi instance Event Service (nó là một `UPDATE` có điều kiện), hoặc có thể gán cố định cho một instance qua Redis leader lock.

### 2.4 At-least-once delivery không có idempotency = vé bị trùng

`EventEnvelope.eventId` tồn tại "để khử trùng lặp" nhưng **không có consumer nào lưu lại ID đã xử lý**. Một `PaymentSucceeded` bị gửi lại → order được đánh dấu `PAID` hai lần → `OrderPaid` được publish hai lần → Ticket Service sinh bộ QR hai lần (hoặc va phải ràng buộc `Ticket.orderItemId @unique` và message chết mà không có nơi để đi).

**Cách khắc phục — mọi consumer đều idempotent:**
- Một bảng `processed_events` cho mỗi service (`eventId` là PK, `processedAt`) được ghi trong **cùng transaction DB** với hiệu ứng của handler. Handler bắt đầu bằng `INSERT ... ON CONFLICT DO NOTHING`; nếu 0 dòng, đó là một lượt gửi lại → ack và return.
- Hoặc, với các handler mà hiệu ứng đã tự nhiên idempotent (chuyển trạng thái được bảo vệ bằng `WHERE status = <expected>`), dựa vào điều đó và ghi lại rõ ràng.
- Việc sinh vé dùng khóa trên `orderItemId` (`INSERT ... ON CONFLICT DO NOTHING`) nên một `OrderPaid` bị nhân đôi chỉ tạo ra một bộ vé.

### 2.5 Dead-letter queue & poison message

RabbitMQ trong thiết kế này là at-least-once và single-node. Cần có:
- **DLX theo từng queue**: sau N lần gửi thất bại (`x-delivery-limit` / đếm nack thủ công), message chuyển sang `<queue>.dlq` thay vì gửi lại mãi mãi (nếu không, một poison message sẽ chặn đứng consumer).
- Một **DLQ drain**: công cụ vận hành + cảnh báo khi bất kỳ `*.dlq` nào có depth > 0. Với một Saga, một message bị kẹt nghĩa là một khách hàng có đơn hàng xử lý dở dang; cần con người hoặc một script retry.
- **Prefetch của consumer** (`prefetch: 20–50`) để một consumer không kéo cả nghìn message rồi OOM.
- HA cho RabbitMQ: single node cho local/demo; **cluster quorum-queue 3 node trên AWS** (đã nêu ở [04-deployment-design.md](04-deployment-design.md) §2).

### 2.6 Bù trừ trong Saga — nếu bước bù trừ cũng thất bại thì sao

Saga kiểu choreography: nếu việc sinh vé thất bại sau khi thanh toán đã thành công, một auto-refund bù trừ được publish. Nếu *bước đó* cũng thất bại:
- Các event bù trừ đều **idempotent** và **được retry với backoff** (qua pattern DLX → retry-with-delay), nên các lỗi tạm thời tự phục hồi.
- Sau khi hết ngân sách retry, message rơi vào DLQ và bắn cảnh báo → xử lý thủ công. Điều này chấp nhận được *vì nó hiếm và có thể nhìn thấy*, và vì **nhà cung cấp thanh toán là nguồn sự thật về tiền**: một **job đối soát hằng ngày** so sánh bản ghi Payment Service với báo cáo settlement của nhà cung cấp và gắn cờ mọi khoản thu không có order hoàn tất tương ứng (→ hoàn tiền) hoặc mọi order hoàn tất không có khoản thu tương ứng (→ điều tra).
- Báo cáo nên nói rõ: hệ thống hướng tới tính nhất quán **eventual**, với một phần đuôi cần can thiệp thủ công có giới hạn, không phải ACID phân tán.

### 2.7 Các failure mode của cổng thanh toán

`POST /payments → PG: tạo transaction` và webhook là những điểm mong manh nhất.

| Lỗi | Cách xử lý |
|---|---|
| PG chậm/timeout | Timeout 5–8 s trên lệnh tạo transaction + circuit breaker; khi trip, trả về "thanh toán tạm thời không khả dụng, ghế của bạn vẫn được giữ đến HH:MM" — không để người dùng treo lơ lửng. Ghế vẫn được giữ (TTL), nên retry an toàn |
| Webhook trùng lặp | Webhook handler idempotent theo `paymentId` (`processed_events`/status guard) — webhook `SUCCEEDED` lần thứ hai là no-op |
| Webhook không bao giờ đến (bị mất) | **Poller đối soát**: mỗi 1–2 phút, Payment Service truy vấn PG để lấy trạng thái của mọi payment `PENDING` cũ hơn ~2 phút. Ngoài ra còn có `GET /payment/payments/:id` cho trang checkout poll. Webhook chỉ là một tối ưu, không bao giờ là con đường duy nhất tới `PAID` |
| Webhook sai thứ tự (`FAILED` rồi mới đến `SUCCEEDED` muộn) | State machine chỉ tiến tới (`PENDING → SUCCEEDED`/`FAILED`, là trạng thái cuối); một webhook mâu thuẫn đến muộn được log và bỏ qua, việc đối soát là trọng tài |
| Chữ ký không hợp lệ | Từ chối `4xx`, log lại, cảnh báo nếu tỉ lệ tăng đột biến (có ai đó đang dò) |
| Hoàn tiền tới PG thất bại | Retry với backoff; hết ngân sách → DLQ + cảnh báo; `Refund.status` hiển thị cho khách hàng luôn giữ `PROCESSING`, không bao giờ âm thầm chuyển `COMPLETED` |

### 2.8 Redis là một điểm lỗi đơn (single point of failure)

Redis giữ các lock, snapshot trạng thái seat map, hàng đợi waiting room, bộ đếm rate-limit và các key idempotency. Một container = một bán kính ảnh hưởng (blast radius).

- **Local/demo:** single node với **AOF persistence (`appendfsync everysec`)** để một lượt restart chỉ mất ≤ 1 s dữ liệu ghi, cộng với `restart: unless-stopped`.
- **AWS:** Redis **Sentinel (3 node)** hoặc ElastiCache có quản lý với failover tự động; client (`ioredis`) nhận biết Sentinel và tự kết nối lại.
- **Xuống cấp hợp lý khi Redis tạm thời không khả dụng — fail *closed* với mọi thứ có nguy cơ oversell:** các hold mới bị **từ chối** ("thử lại sau một chút"), không được cho qua mà không kiểm soát. Đọc dữ liệu fallback về một cache in-process TTL ngắn hoặc trạng thái "seat map tạm thời không khả dụng". Waiting room, nếu Redis của nó down, giữ mọi người ở cửa thay vì cho tràn vào.
- Giữ các tập dữ liệu tách biệt (các DB logic hoặc instance khác nhau) để, ví dụ, mất instance cache không kéo theo mất cả lock.

### 2.9 Cache stampede (thundering herd)

Key `event:{id}` của sự kiện hot hết hạn giữa lúc mở bán → ~6.000 req/s đều miss cùng lúc → 6.000 truy vấn Postgres giống hệt nhau đồng thời.

- **Single-flight / lock-on-miss:** lượt miss đầu tiên giành một lock Redis ngắn (`SET NX EX 5`), tính lại, ghi lại cache; các lượt miss đồng thời khác phục vụ tạm bằng dữ liệu cũ hoặc chờ.
- **Hết hạn sớm theo xác suất:** tính lại một key nóng ngay trước khi TTL hết hạn, có jitter, để thời điểm hết hạn không bao giờ trùng nhau giữa các request.
- **`stale-while-revalidate`** ở CDN để một entry ở edge đã hết hạn vẫn được phục vụ (một lần) trong lúc refresh.

### 2.10 Worker giải phóng waiting room

Waiting room chỉ hoạt động nếu có thứ gì đó rút dần sorted set trong Redis theo đúng tốc độ an toàn. Chưa được thiết kế đến giờ:

- **Worker giải phóng phải là một singleton** — nếu mỗi instance `api-gateway` tự chạy một bản, tốc độ giải phóng thực tế sẽ là N × mục tiêu. Dùng một **Redis leader lock** (`SET NX EX`, được renew) hoặc một service `release-worker` riêng chạy 1 replica.
- Nếu worker **chết, queue ngừng rút dần** và mọi người bị kẹt lại. Cần có liveness check và restart nhanh (reconciliation của Swarm), cộng với cảnh báo khi "độ sâu queue không giảm".
- **Tốc độ thích ứng, không phải một số cố định 400:** worker theo dõi độ trễ p99 của Booking Service, mức sử dụng DB pool và độ trễ ack của consumer, và tự động hạ tốc độ giải phóng khi các chỉ số này xấu đi (vòng lặp closed-loop). Con số đo được từ load test là điểm *khởi đầu* và mức trần.
- **Admission token** (cookie / JWT ngắn hạn) có TTL; khi refresh user giữ nguyên vị trí; **thu hồi khi bỏ cuộc** — một user đã được vào nhưng không bắt đầu checkout trong M phút sẽ giải phóng lại slot của họ.

---

## 3. Thiết kế xuyên suốt (cross-cutting)

### 3.1 Timeout, circuit breaker, bulkhead

- **Mọi** lệnh gọi HTTP liên service và mọi lệnh gọi ngoài (PG, SMTP) đều có timeout tường minh (thường 3–8 s) — không có lượt chờ vô hạn.
- **Circuit breaker** (ví dụ `opossum`) quanh Payment Service → PG, và quanh `api-gateway` → từng service: sau khi vượt ngưỡng tỉ lệ lỗi, trip trong một khoảng cooldown và fail nhanh với một thông báo thân thiện thay vì để kết nối dồn lại.
- **Bulkhead**: `api-gateway` dùng **connection pool/ngân sách concurrency riêng cho từng downstream service**, để việc Booking Service chậm không làm đói phần login và duyệt. `http-proxy-middleware` hiện tại không có cả timeout lẫn giới hạn pool — đây là một khoảng trống cụ thể.

### 3.2 Rate limiting (cụ thể)

- Được áp dụng ở `api-gateway`, dựa trên **Redis** (để giới hạn là toàn cục qua các instance gateway), theo mô hình token-bucket.
- `POST /user/auth/login`: 5/phút/IP, 20/phút/account. `POST /user/auth/register`: 3/phút/IP. `POST /booking/cart/hold`: 10/phút/user. `POST /payment/payments`: 5/phút/user. Duyệt/tìm kiếm: 60/phút/IP (rộng rãi — vì đã được cache).
- Response `429` + `Retry-After` + header `X-RateLimit-*`.
- Waiting room là công cụ *công bằng/điều tiết*; rate limit là công cụ *chống lạm dụng* — cần cả hai.

### 3.3 Giới hạn mua hàng & chống phe vé (anti-scalping)

Hiện tại không có gì ngăn một account (hoặc một farm bot) giữ hàng trăm ghế.

- **Giới hạn theo user, theo sự kiện** (ví dụ 4–8 vé) áp dụng **tại thời điểm hold**: một bộ đếm Redis `hold:count:<eventId>:<userId>` được tăng trong cùng Lua script với việc giành ghế, kiểm tra so với giới hạn, giảm khi release/hết hạn.
- Mỗi account chỉ **một token waiting room**; CAPTCHA khi vào queue cho các sự kiện `high_demand`.
- Tùy chọn: gắn cờ các order dùng cùng phương thức thanh toán/device fingerprint trên nhiều account.

### 3.4 Concurrency của mã giảm giá

`discount-codes.validate` chỉ **đọc** `quantityUsed < quantityTotal` — hai order đồng thời với lượt dùng cuối cùng còn lại của một mã đều pass. Không hề có bước redeem nào cả.

- Thêm bước **redeem** khi order confirm: `UPDATE "DiscountCode" SET "quantityUsed" = "quantityUsed" + 1 WHERE id = $1 AND "quantityUsed" < "quantityTotal"` — 0 dòng bị ảnh hưởng → mã đã hết, tính lại tổng tiền không có mã và báo cho user.
- **Release** khi order bị hủy/hết hạn (`quantityUsed = GREATEST(quantityUsed - 1, 0)`), có bảo vệ để không bị release hai lần (theo dõi việc redeem trên order).

### 3.5 Việc release tồn kho GA phải idempotent

`UPDATE` có điều kiện của `reserveTicketType` là đúng (nguyên tử, không thể oversell). Nhưng `releaseTicketType` được gọi từ cả `PaymentFailed` **lẫn** đợt quét `Order.expiresAt` — release hai lần làm đếm thiếu `quantitySold` và âm thầm thổi phồng tồn kho khả dụng. **Cách khắc phục:** ghi lại `reservationReleased` trên Order, chỉ release nếu chưa từng release, trong cùng transaction với việc đổi trạng thái.

### 3.6 Endpoint nội bộ cần xác thực

`/internal/seats/:id/hold|release|confirm` và `/internal/ticket-types/:id/reserve` của Event Service không đi qua `api-gateway`, nhưng **vẫn** truy cập được từ bất kỳ thứ gì trên overlay network. Một service bị xâm nhập hoặc có bug (hoặc một request bị định tuyến sai) có thể confirm/release ghế trực tiếp.

- **Header shared-secret** (`X-Internal-Token`) được một guard kiểm tra trên mọi route `/internal/*`, hoặc mTLS giữa các service, hoặc một overlay network Docker được giới hạn phạm vi sao cho chỉ Booking Service mới chạm được cổng nội bộ của Event Service.

### 3.7 Graceful shutdown & đóng băng deploy

- **`stop_grace_period: 30s`** + app bắt tín hiệu `SIGTERM`: ngừng nhận request mới, hoàn tất các request đang xử lý, đóng channel RabbitMQ sau khi message hiện tại đã được ack, đóng DB pool. `enableShutdownHooks()` + `app.close()` của Nest.
- **Drain WebSocket:** khi shutdown, gửi cho client gợi ý `reconnect` với backoff có jitter để 20k socket không reconnect trong cùng 100 ms; Redis adapter cho phép chúng gắn lại vào một instance khác.
- **Đóng băng deploy:** không deploy trong khung mở bán (và ~15 phút sau đó). Đây là một quy tắc vận hành đã ghi lại; lý tưởng là pipeline CD kiểm tra cờ "sự kiện high-demand đang hoạt động" và từ chối.

### 3.8 Resilience của database

- **Connection pooling:** pool của Prisma được sizing theo từng service; **PgBouncer** (transaction mode) đặt phía trước cho đường ghi lúc flash-sale để một đợt tăng vọt kết nối không làm cạn Postgres.
- **Backup:** tự động hằng ngày + point-in-time recovery (WAL archiving) trên AWS; có tài liệu quy trình restore.
- **Read replica** cho luồng duyệt của Event Service (theo [04-deployment-design.md](04-deployment-design.md) §2) — nhưng **trạng thái** seat map luôn lấy từ Redis, và việc *confirm* ghế luôn chạm primary, nên độ trễ replica không thể gây oversell, chỉ khiến danh sách duyệt hơi cũ.
- **Bảo vệ query chậm:** statement timeout (ví dụ 5 s) để một query bất thường không thể chiếm giữ một kết nối; `COUNT(*)` trong `events.search` được thay bằng cursor pagination (không có tổng) hoặc một con số đếm đã cache/xấp xỉ.

### 3.9 Observability (bạn "mù" trong một đợt flash-sale nếu thiếu cái này)

Tối thiểu cần có, vì các failure mode ở trên chỉ có thể quản lý được nếu nhìn thấy được:

- **Metrics** (`/metrics`, Prometheus): tỉ lệ request + độ trễ p50/p95/p99 + tỉ lệ lỗi theo từng service; **độ sâu queue waiting-room và tốc độ giải phóng**; mức sử dụng DB pool; bộ nhớ Redis + hit rate; độ sâu queue RabbitMQ theo từng queue + **độ sâu DLQ**; **bộ đếm oversell (luôn phải bằng 0)**; số lượng hold, tỉ lệ chuyển đổi hold→paid.
- **Cảnh báo:** bất kỳ `*.dlq` nào > 0; bộ đếm oversell > 0 (page ngay lập tức); độ sâu queue không giảm trong > 60 s; p99 vượt SLO trong > 2 phút; node Redis/RabbitMQ down; sai lệch đối soát thanh toán.
- **Structured log** với một correlation ID được truyền từ `api-gateway` xuyên suốt mọi service và broker message (`eventId`/`orderId` làm khóa join).
- **Dashboard:** một bảng "phòng điều khiển flash-sale" duy nhất với phễu (lượt đến → xếp hàng → được vào → đã hold → đã thanh toán → đã phát vé) và tốc độ giải phóng, để người vận hành có thể điều chỉnh hoặc hủy.

---

### 3.10 Các delta schema mà thiết kế này yêu cầu

Các bảng/cột mới ngoài [07-database-schema.md](07-database-schema.md):

- **`processed_events`** — một bảng cho mỗi service tiêu thụ event (`booking-service`, `ticket-service`, `event-service`, `notification-service`). `eventId` là PK (UUID), `processedAt` kiểu timestamptz. Được ghi trong cùng transaction với hiệu ứng của handler.
- **`Order`** (booking-service): `+ paymentInProgress boolean default false` (được đặt khi `POST /payments`, báo cho stale-hold sweeper bỏ qua), `+ reservationReleased boolean default false` (bảo vệ idempotent cho việc release GA), `+ discountRedeemed boolean default false` (bảo vệ idempotent cho việc release mã giảm giá).
- **`Event`** (event-service): `+ highDemand boolean default false` (dùng để chặn bằng waiting room).
- **`DiscountCode`** (event-service): không có cột mới — `quantityUsed` đã tồn tại sẵn; cần bước `UPDATE` redeem nguyên tử và một đường release.
- **Redis key** (không phải SQL): `seat:hold:<seatId>` (đã có), `hold:count:<eventId>:<userId>` (giới hạn theo user), `seatmap:layout:<eventId>` / `seatmap:state:<eventId>` (§2a), sorted set `waitroom:<eventId>`, `waitroom:leader` (lock của release-worker), token bucket `ratelimit:<rule>:<subject>`, `idem:<key>` cho các idempotency key của POST.

---

## 4. Phản biện từ góc nhìn người review/hội đồng chấm — điểm yếu, biện hộ và cách khắc phục

Một lượt rà soát trung thực toàn bộ thiết kế ở trạng thái hiện tại, từ góc nhìn của người cố tìm cách "đánh sập" nó trong buổi bảo vệ.

| # | Vấn đề mà người review sẽ nêu ra | Có phải vấn đề thật không? | Biện hộ / cách khắc phục |
|---|---|---|---|
| 1 | "Bạn nói vé *không bao giờ* bị oversell, nhưng TTL hold Redis hết hạn trong khi user đang ở trang thanh toán." | **Có, là vấn đề thật** — code hiện tại oversell ở đây. | Được khắc phục ở §2.1: `confirmSeat` có kiểm tra quyền sở hữu (Lua `GET == orderId`) làm oversell trở nên bất khả thi; gia hạn hold khi bắt đầu thanh toán làm việc mất hold trở nên hiếm; auto-refund + đối soát bao phủ phần còn sót lại. Trình bày theo hướng "oversell là bất khả thi về mặt cấu trúc; một lượt mất hold hiếm gặp trở thành một lượt auto-refund". |
| 2 | "Broker giao at-least-once — idempotency của bạn ở đâu? Cho tôi xem điều gì xảy ra khi gửi lại." | **Có, là vấn đề thật** — `eventId` được định nghĩa nhưng không được dùng. | Được khắc phục ở §2.4: bảng `processed_events` ghi trong transaction của handler; việc sinh vé dùng khóa trên `orderItemId`. Demo bằng cách replay một message từ RabbitMQ UI và cho thấy đúng một vé/email. |
| 3 | "Saga choreography không có bộ điều phối — làm sao bạn biết luồng đã hoàn tất? Nếu một bước bù trừ thất bại thì sao?" | Một phần — đây là một đánh đổi đã biết, nhưng cần có câu trả lời. | §2.6: các bước bù trừ đều idempotent + được retry + đưa vào DLQ + cảnh báo; một lượt đối soát hằng ngày với nhà cung cấp thanh toán là lớp chống lưng. Thiết kế hướng tới tính nhất quán **eventual** với một phần đuôi can thiệp thủ công có giới hạn — nói rõ điều này thay vì khẳng định ACID. |
| 4 | "Redis nằm trên đường tới hạn cho lock, queue, cache, rate limit — và nó chỉ là một container." | **Có, là vấn đề thật.** | §2.8: AOF persistence ở local; Sentinel/ElastiCache trên AWS; **fail-closed** với các hold khi Redis không khả dụng (từ chối, không mạo hiểm oversell). Tách instance theo từng mối quan tâm để giới hạn bán kính ảnh hưởng. |
| 5 | "Tốc độ giải phóng (400 req/s) là một con số ma thuật." | Hợp lý. | Nó được nói rõ là "đo bằng load test" ([04-deployment-design.md](04-deployment-design.md) §2), và §2.10 làm cho nó **thích ứng** — worker tự hạ tốc độ khi p99 của Booking / DB pool / ack-lag xấu đi. Con số load-tested là mức trần, không phải một giá trị cố định. |
| 6 | "Điều gì ngăn một người (hoặc một farm bot) mua 500 vé?" | **Có, là vấn đề thật** — hiện tại không có gì ngăn cả. | §3.3: giới hạn theo user theo sự kiện áp dụng nguyên tử tại thời điểm hold; một token queue mỗi account; CAPTCHA cho `high_demand`. |
| 7 | "Các endpoint nội bộ `/internal/*` không có xác thực — bất kỳ thứ gì trên mạng cũng có thể confirm một ghế." | **Có, là vấn đề thật.** | §3.6: guard shared-secret / mTLS / overlay network giới hạn phạm vi. Rẻ để thêm vào, quan trọng để nêu ra. |
| 8 | "20.000 kết nối WebSocket trên Socket.IO — trên chiếc laptop bạn đang demo?" | Con số demo nhỏ hơn, nhưng *thiết kế* phải scale được. | §2a: Redis adapter + **một frame gộp mỗi room mỗi giây** + **polling fallback là mặc định**. Bảo vệ bằng một con số load-test cho thiết kế đã gộp batch, và ghi chú rằng demo chạy với số kết nối đã thu nhỏ. |
| 9 | "Mã giảm giá có giới hạn số lần dùng — có cùng cuộc đua như tồn kho không?" | **Có, là vấn đề thật** — và hiện tại không hề có bước redeem nào. | §3.4: `UPDATE` có điều kiện nguyên tử khi redeem, release khi hủy, có bảo vệ chống release hai lần. |
| 10 | "`events.search` chạy `COUNT(*)` với `ILIKE` trên mọi request duyệt." | **Đúng** — tốn kém khi tải duyệt cao. | §3.8: cursor pagination không có tổng, hoặc một con số đếm đã cache/xấp xỉ; cộng với toàn bộ response tìm kiếm đã được cache ở Redis (§2a). |
| 11 | "Nếu webhook thanh toán bị mất, khách hàng bị trừ tiền mà không nhận được vé." | **Có, là vấn đề thật** — webhook hiện là con đường duy nhất tới `PAID`. | §2.7: poller đối soát + `GET trạng thái thanh toán` cho client poll; webhook trở thành một tối ưu, không phải con đường duy nhất. |
| 12 | "Worker giải phóng waiting room — một tiến trình duy nhất? Nếu nó crash thì sao?" | **Có, là vấn đề thật** — chưa được thiết kế. | §2.10: singleton qua Redis leader lock hoặc một service riêng 1-replica; liveness + restart nhanh; cảnh báo khi "độ sâu queue không đổi". |
| 13 | "Bạn đã đưa `healStaleHolds` ra khỏi đường đọc — vậy Postgres được reconcile *khi nào*?" | Nhất quán, nhưng cần nói rõ. | §2.3: cron `StaleHoldSweeper` (30–60 s), `UPDATE` có điều kiện idempotent; đường đọc không bao giờ cần projection phải mới nhất vì trạng thái seat map lấy từ Redis. |
| 14 | "Không có metrics, không có cảnh báo — làm sao bạn biết được nó đang lỗi trong lúc mở bán?" | **Có, là vấn đề thật.** | §3.9: metrics Prometheus gồm độ sâu queue/độ sâu DLQ/**bộ đếm oversell**, cảnh báo, correlation ID, dashboard phễu flash-sale. Đây là Phase 8c/Phase 10. |
| 15 | "RabbitMQ single-node, không có DLQ — một poison message làm nghẽn Saga cho tất cả mọi người." | **Có, là vấn đề thật.** | §2.5: DLX theo từng queue + giới hạn số lần gửi lại + giới hạn prefetch; cảnh báo độ sâu DLQ; cluster quorum-queue trên AWS. |
| 16 | "Rolling deploy trong lúc mở bán làm rớt hold và 20k socket." | **Đúng** — về mặt vận hành. | §3.7: graceful shutdown (drain SIGTERM), WS reconnect-with-jitter, và một **quy tắc đóng băng deploy** trong khung mở bán được pipeline CD thực thi. |

### Các giới hạn cần nói thẳng trong báo cáo (không né tránh)

- **Đơn vùng (single region).** Không có DR đa vùng. Một sự cố vùng là downtime toàn phần. Chấp nhận được với phạm vi đồ án; nêu ra như hướng phát triển tương lai.
- **Tính nhất quán eventual.** Giữa "đã thanh toán" và "cầm vé trong tay" có một khoảng trễ (thường dưới 1 giây, hiếm khi tới vài phút nếu Saga phải retry). UI phải hiển thị "đang xử lý" một cách trung thực.
- **Bản demo chạy ở quy mô thu nhỏ.** Các con số ở [04-deployment-design.md](04-deployment-design.md) §2 là *mục tiêu thiết kế* đã được chứng minh bằng load test, không phải những gì Swarm trên laptop thực sự chạy. Cần nói rõ cái nào là cái nào.
- **Chi phí bcrypt là một giới hạn throughput có chủ đích.** Không hạ nó xuống để lấy tốc độ; thay vào đó đưa đám đông ra khỏi đường login (§1).

---

*Tài liệu liên quan: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md*
