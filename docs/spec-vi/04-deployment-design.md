# THIẾT KẾ DEPLOY & CHỊU TẢI
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

## 1. Thiết kế chịu tải cao (Flash sale / mở bán vé)

*(Sơ đồ luồng chịu tải đầy đủ đã được trình bày trong quá trình trao đổi — 5 lớp: Client → CDN & Load Balancer → Waiting Room → Booking Service (Redis lock) → Queue & Database.)*

### Vì sao đây là điểm nghẽn nguy hiểm nhất
Vào thời điểm mở bán vé (đặc biệt với sự kiện hot), một tỉ lệ lớn người dùng có thể gửi request trong vài giây — rất khác với tải trung bình hằng ngày. Ở quy mô mục tiêu của nền tảng này (**~100.000 người dùng đăng ký**), một đợt mở bán hot thực tế kéo **~20.000 người dùng đồng thời cùng cố mua** trong phút đầu tiên. Con số đó gấp 50–100 lần đỉnh tải ngày thường, nên nếu không thiết kế riêng cho kịch bản này, hệ thống rất dễ sập hoặc bán trùng vé. 5 lớp bên dưới chính là phần hấp thụ cú sốc đó; các con số ở mục 2 được tính theo mốc 20k này.

### 5 lớp phòng thủ

| Lớp | Vai trò | Kỹ thuật cụ thể |
|---|---|---|
| **CDN & Load Balancer** | Chặn tải tĩnh ngay từ nguồn, phân đều tải động | CDN cache ảnh/trang landing sự kiện; Load balancer (round-robin hoặc least-connection) phân phối request tới nhiều instance API Gateway |
| **Waiting room (hàng đợi ảo)** | Kiểm soát số lượng request được vào hệ thống đặt vé cùng lúc | Lưu hàng đợi trong Redis sorted set (xếp theo thời gian đến), thả từng đợt vào Booking Service đúng bằng tốc độ xử lý an toàn đã đo được qua load test. **Bật/tắt theo từng sự kiện** qua cờ `high_demand` — sự kiện thông thường bỏ qua waiting room hoàn toàn, đi thẳng vào Booking Service sau lớp rate-limit ở API Gateway; hàng đợi chỉ kích hoạt cho các đợt mở bán được gắn cờ |
| **Booking Service + Redis lock** | Đảm bảo không 2 người cùng giữ được 1 ghế/vé | Thao tác nguyên tử `SETNX` hoặc Lua script trên Redis; TTL ~10 phút để tự động nhả ghế nếu khách bỏ ngang |
| **Queue & Database** | Tách tốc độ nhận request khỏi tốc độ ghi dữ liệu | Các yêu cầu đặt vé đã xác nhận được đẩy vào message queue, worker ghi vào DB theo tốc độ DB chịu được, tránh nghẽn/sập ở tầng lưu trữ |
| **Auto-scaling & Circuit breaker** *(bổ sung)* | Tự động mở rộng khi tải tăng, tránh lỗi lan truyền | Auto-scale theo chiều ngang cho Booking Service dựa trên độ dài hàng đợi/CPU; circuit breaker giữa các service (ví dụ lỗi ở Payment Service không kéo sập toàn hệ thống) |

### Việc cần làm để có số liệu cụ thể cho báo cáo
- **Load test** bằng k6 hoặc JMeter để xác định ngưỡng request/giây mà Booking Service + Database chịu được — con số này dùng để cấu hình tốc độ "thả" người từ waiting room.
- Đo thời gian phản hồi (p95/p99 latency) trước và sau khi áp dụng từng lớp phòng thủ, để chứng minh hiệu quả bằng số liệu trong báo cáo.
- Mô phỏng kịch bản mở bán vé bằng script load test cho N người dùng đồng thời, so sánh tỉ lệ lỗi/oversell giữa "có" và "không có" waiting room.

---

## 2. Thiết kế sức chứa cho ~20.000 người mua đồng thời (đỉnh flash-sale trên nền tảng 100k user)

*(Sơ đồ phễu sức chứa đầy đủ đã được trình bày trong quá trình trao đổi — thu hẹp dần từ ~20.000 kết nối đồng thời xuống còn 200-400 lượt ghi/giây vào database.)*

### Giả định về quy mô

| Đầu vào | Giá trị | Cơ sở |
|---|---|---|
| Người dùng đăng ký (mục tiêu nền tảng) | ~100.000 | Đề bài |
| Người dùng đồng thời lúc mở bán hot | ~20.000 | Tất cả đều vào checkout trong ~phút đầu tiên |
| Cú sốc lượt đến | ~1.000–2.000 lượt xếp hàng/giây | 20.000 người dùng đến trong ~10–20 giây |
| Đỉnh tải ngày thường (không flash sale) | ~1.000–2.000 đồng thời, ~200–400 req/s | Chủ yếu là đọc (browse/search); waiting room không kích hoạt |

### Nguyên lý thiết kế
Điểm nghẽn không nằm ở việc **nhận** ~20.000 request — nó nằm ở việc **xử lý** chúng mà không làm sập database hay bán trùng vé. Vì vậy thiết kế đúng là: **nhận hết ngay lập tức** ở tầng rẻ (load balancer, Redis), rồi **thả dần** vào tầng đắt (booking, database) đúng bằng tốc độ đã được kiểm chứng là bền vững.

### Bảng sức chứa từng tầng

| Tầng | Sức chứa mục tiêu | Cách đạt được |
|---|---|---|
| Entrypoint & Load Balancer | ~20.000–40.000 kết nối đồng thời | 2–3 task `api-gateway` sau routing mesh của Swarm ở local, hoặc 1 AWS ALB về sau — kèm tuning OS (ulimit, file descriptors, connection backlog). Đây là tầng rẻ, không phải điểm nghẽn. CDN đặt phía trước cho ảnh/trang landing sự kiện |
| Waiting room (Redis) | ~5.000 lượt xếp hàng/giây (dư so với ~1.000–2.000 dự kiến) | `ZADD` vào Redis sorted set — 1 node Redis xử lý được >100.000 ops/giây, nên đây không bao giờ là giới hạn |
| Tốc độ thả vào xử lý | **300–500 req/giây** *(cần được đo bằng load test thật)* | "Van điều tiết" — đặt đúng bằng khả năng chịu tải đã được kiểm chứng của Booking Service + booking_db |
| Booking Service | 300–500 req/giây | Pool tự scale ~6–10 task (nếu mỗi task đo được ~60–100 req/giây cho luồng seat-lock chủ yếu chạm Redis) — xem mục 3 bên dưới |
| Database (qua Queue) | **200–400 lượt ghi/giây** | Worker đọc từ queue, batch-insert `order_items`, connection pooling (Prisma pool / PgBouncer). Mỗi service có 1 PostgreSQL primary cho ghi; thêm **read replica cho Event Service** để gánh luồng browse/search ở quy mô này |
| RabbitMQ | < 1.000 message/giây | 1 node (cluster 3 node về sau trên AWS để có HA) |

### Công thức tính số instance

```
Số instance = ceil( RPS_mục_tiêu / RPS_mỗi_instance_đo_được ) × 1.3 (hệ số dự phòng)
```

Ví dụ: mục tiêu 400 req/giây, mỗi task đo được 80 req/giây → `400/80 = 5 → 5 × 1.3 ≈ 7 task`.

**Lưu ý:** các con số RPS/instance ở trên vẫn chỉ là ví dụ minh họa — con số thật phụ thuộc vào stack công nghệ và cấu hình cụ thể. Cần chạy **load test thật** (k6/JMeter) trên bản triển khai thực tế để lấy số liệu chính xác; đây là phần đáng đưa vào báo cáo để chứng minh thiết kế bằng số liệu thực nghiệm, không chỉ bằng lý thuyết.

### Trải nghiệm người dùng khi bị "thả chậm"
Với tốc độ thả 400 req/giây, xử lý hết ~20.000 người đang xếp hàng mất khoảng **~50 giây**. Đây là hành vi bình thường ở một hệ thống bán vé thật (kể cả Ticketmaster) — miễn là waiting room hiển thị vị trí xếp hàng/thời gian chờ ước tính, trải nghiệm vẫn ở mức chấp nhận được, và quan trọng nhất là hệ thống không sập, không bán trùng vé.

### Khi lượng người đến vượt xa sức chứa (ví dụ 50.000 người xuất hiện cho thiết kế 20.000)

**Waiting room đã xử lý sẵn tình huống này — đó chính là toàn bộ lý do nó tồn tại.** "Chịu được 20.000" nghĩa là 20.000 ở tầng *xử lý* (tốc độ thả ~400 req/s). Lượng người *đến* được tách rời khỏi tầng đó: 50.000 (hay cả 500.000) đều được `ZADD` vào hàng đợi Redis ngay lập tức, rồi được thả ra theo tốc độ an toàn. 30.000 người dư ra chỉ đơn giản là **chờ lâu hơn**.

- 20.000 người xếp hàng ÷ 400 req/s ≈ 50 giây để xả hết
- 50.000 người xếp hàng ÷ 400 req/s ≈ **~125 giây** để xả hết

Không ai bị rớt, không gì sập, không có oversell — thay đổi duy nhất là thời gian chờ lâu hơn, được hiển thị bằng vị trí xếp hàng + ETA. Vẫn còn 5 điều cần làm đúng:

1. **Định cỡ tầng "nhận" theo lượng người đến, không phải theo sức xử lý.** Kết nối ở edge + Redis `ZADD` + trang màn hình xếp hàng (tĩnh) phải chịu được ~50k kết nối đồng thời. Redis `ZADD` ở mức >100k ops/s và trang hàng đợi được phục vụ từ CDN khiến việc này rất rẻ. Nếu bản thân edge bị quá tải → **load-shed**: trả về `503` + `Retry-After` cho phần vượt sức chứa của edge (một cú bật ra gọn gàng, không phải sập hệ thống).
2. **Giới hạn độ dài hàng đợi.** Nếu chỉ có 5.000 vé mà người thứ 45.000 vẫn xếp hàng thì cơ hội của họ gần như bằng 0, và chờ 2 phút vô ích là trải nghiệm tệ. Khi độ dài hàng đợi vượt quá một hệ số của tồn kho còn lại (ví dụ ×3), ngừng nhận thêm người mới ("hàng đợi đã đầy — vé có thể còn trống nếu có người rời đi"). Điều này cũng giới hạn bộ nhớ Redis và giữ ETA trung thực. Hiển thị tỉ lệ thực tế ngay lúc vào hàng ("#38.000 trong hàng, còn ~5.000 vé").
3. **Công bằng khi quá tải:** sorted set được xếp theo mốc thời gian đến → FIFO nghiêm ngặt. Mỗi tài khoản/phiên chỉ có 1 token hàng đợi (sticky — refresh không được vào lại từ đầu hay nhảy hàng). CAPTCHA lúc vào hàng đợi cho các sự kiện `high_demand` để bot không làm phồng con số.
4. **Autoscaling không phải lối thoát.** Scale `booking-service` từ 6 lên 10 task chỉ nhích nhẹ tốc độ thả; trần ghi của DB (200–400/s) và tranh chấp seat-lock trên Redis mới là giới hạn thật — bạn dàn 50k người ra trong ~2 phút chứ không nuốt hết trong 10 giây. Thứ mà autoscaling *thực sự bảo vệ* là **đường đọc** (mục 2a): 50k người đang chờ và duyệt trang không được làm sập Event Service, và đường đó scale tốt vì nó stateless và có cache.
5. **Các mức hạ cấp nếu vượt xa sức chứa:** tắt WebSocket real-time → chuyển sang poll mỗi 5 giây; tăng cache TTL (trang sự kiện từ 10 giây lên 60 giây); tắt gợi ý / sự kiện liên quan / bộ lọc tìm kiếm; nếu hàng đợi booking bị dồn quá ngưỡng N, báo cho người vừa được thả vào "đang giữ chỗ cho bạn, hệ thống đang bận" thay vì báo lỗi.

---

## 2a. Thiết kế sức chứa đường đọc (login → trang sự kiện → seat map)

Mục 2 tính **đường ghi** (checkout / hold / pay). Nhưng khi một đợt mở bán bắt đầu, **cú sốc đọc lớn hơn cú sốc ghi**: cả ~20.000 người dùng cùng tải trang sự kiện, sơ đồ ghế và một kênh cập nhật trực tiếp, trong khi chỉ vài nghìn người trong số đó thực sự đi tới checkout. Đường đọc là thứ sập trước tiên nếu không được thiết kế cẩn thận, nên nó có phễu sức chứa riêng.

### Mỗi người dùng làm gì lúc T0 (mở bán bắt đầu)

Trong khoảng 10–20 giây đầu, mỗi người trong số ~20.000 người dùng đại khái làm: (1) đăng nhập *hoặc* âm thầm refresh token, (2) `GET` chi tiết sự kiện, (3) `GET` **layout** seat map, (4) `GET` **trạng thái** seat map, (5) mở một kênh trực tiếp (WebSocket hoặc poll), rồi ở lại 1–5 phút nhận cập nhật trong lúc chọn ghế.

≈ 4–5 lượt đọc khởi tạo/người dùng → **~90.000 request trong ~15 giây ≈ ~6.000 req/s đọc ở đỉnh**, so với ~400 req/s ở đường ghi. Toàn bộ chiến lược là phục vụ những request đó từ **cache và Redis, không bao giờ truy vấn Postgres cho từng request**.

### Nguyên lý thiết kế
Tách mỗi lượt đọc thành **phần bất biến** (cache mạnh, tỉ lệ hit gần như tuyệt đối) và **phần biến động** (dựng lại 1 lần/giây trong Redis, phát bản đó ra cho tất cả mọi người). Không có gì trên đường đọc ghi xuống database.

### Bảng sức chứa từng tầng

| Tầng | Tải đỉnh (mở bán 20k) | Cách hấp thụ |
|---|---|---|
| **Login** | ~100 lượt login/s + ~200 lượt refresh token/s (xem ghi chú bên dưới về trường hợp cú sốc login lớn hơn) | Thông báo mở bán trước để phần lớn người dùng đến với refresh token còn hạn (access 15 phút / refresh 7 ngày, đã có sẵn trong code) → cú sốc chủ yếu là *refresh* rẻ (verify JWT + 1 `SELECT` có index), không phải *login*. Rate-limit ở Gateway cho `/user/auth/login` (ví dụ 5/phút/IP, 20/phút/account) để chặn các đợt credential-stuffing. User Service tự scale 4–6 task — `bcrypt` cost 10 ≈ 60–100 ms CPU/login là phần đắt duy nhất và không thể cache |
| **Chi tiết sự kiện / search** | ~6.000 req/s, trong đó >95% là cache hit | CDN cache `GET /event/:id` (`Cache-Control: public, max-age=10, stale-while-revalidate=30`) + Redis read-through cache trong Event Service (`event:{id}` TTL 15–30 giây, `search:{queryKey}` TTL 10 giây), bị bust khi organizer update/approve/reject. Postgres gốc chỉ thấy **< 50 req/s** dù đám đông có lớn cỡ nào. Bộ đếm biến động "còn X vé" được lấy từ Redis inventory counter, không nằm trong blob cache |
| **Layout seat map** (khu vực, hàng, seat ID, tọa độ, giá theo khu vực) | ~20.000 lượt đọc khởi tạo | Bất biến sau khi sự kiện được publish → CDN + Redis `seatmap:layout:{eventId}` (TTL hàng giờ), chỉ bị bust khi `createOrReplace`. **~1 lượt đọc Postgres cho mỗi sự kiện, mãi mãi** |
| **State seat map** (trạng thái từng ghế Available / Held / Booked / Blocked) | ~10.000–20.000 Redis `GET`/s | Một job chạy nền cho mỗi sự kiện đang hoạt động dựng lại một snapshot gọn nhẹ `seatmap:state:{eventId}` (mảng theo vị trí ghế; ~5–20 KB cho một hội trường 5.000 ghế) từ các hold trong Redis + tập ghế đã bán được cache, **mỗi 1 giây một lần**. Reader chỉ cần `GET` key đó (~0.2 ms). 1 node Redis dư sức xử lý việc này thoải mái. **Không Postgres, không ghi trên đường đọc** |
| **Cập nhật ghế trực tiếp** | ~20.000 kênh đồng thời cho mỗi sự kiện hot | **Mặc định (khuyến nghị cho đồ án): client poll `GET /event/:id/seat-map/state` mỗi 2–3 giây** — chỉ là một lượt Redis `GET`, và độ trễ 2 giây là chấp nhận được về UX cho một seat map. **Phương án realtime:** Socket.IO cùng `@socket.io/redis-adapter` để nhiều instance Event Service chia sẻ chung room `event:{id}`; job snapshot chạy mỗi 1 giây tính diff và emit **một frame `seat:batch` gộp cho mỗi room mỗi giây** (không bao giờ emit theo từng-ghế-từng-thay-đổi). Giới hạn ~15k socket/instance, autoscale theo số connection → 2–3 instance Event Service cho 1 sự kiện 20k |
| **Dọn dẹp hold hết hạn** | liên tục | Redis TTL tự động hết hạn các hold. Một `StaleHoldSweeper` chạy nền (mỗi 30–60 giây) reconcile `SEATS.status` trong Postgres cho phần bị rò rỉ. Việc này **được đưa ra khỏi đường đọc** — `getSeatMap` không được phép heal hold một cách inline |

### Waiting room đặt ở đâu (quyết định theo từng sự kiện)

- **Sự kiện `normal`:** không có waiting room. Cú sốc đọc được hấp thụ bằng CDN + Redis cache + autoscaling; đường ghi dùng rate-limit ở Gateway + Redis lock như bình thường.
- **Sự kiện `high_demand`:** waiting room chặn ngay **lối vào chính trang sự kiện**, không chỉ checkout. Chỉ N người đầu tiên (≈ 3.000–5.000) được cho vào trang, nên tải của seat-map + kênh trực tiếp bị giới hạn ở mức N thay vì 20.000; những người còn lại thấy màn hình xếp hàng (tĩnh, phục vụ từ CDN, chi phí gần như bằng 0). Đợt tiếp theo được cho vào khi có người mua xong hoặc rời đi.
- Token waiting room chỉ được cấp cho người dùng **đã đăng nhập**, buộc việc đăng nhập phải diễn ra *trước* khi xếp hàng — trải tải xác thực ra suốt thời gian chờ thay vì dồn hết vào thời điểm T0.

### Khi cú sốc login tự nó đã lớn (ví dụ 50.000 lượt login tại T0)

Login **CPU-bound do `bcrypt`** (~60–100 ms/login, cost 10). 50.000 lượt login trong 60 giây ≈ 830/s sẽ cần ~40–80 task User Service — scale kiểu brute-force là hướng sai (đống task đó sẽ ngồi không cả ngày còn lại). Theo thứ tự ưu tiên:

1. **Đẩy cú sốc ra khỏi đường login.** Thông báo mở bán sớm; nhắc người dùng đăng nhập trong những giờ trước đó. Tại T0, client nên **âm thầm gọi `POST /auth/refresh`** (verify JWT + 1 `SELECT` có index — một task xử lý được hàng nghìn lượt/giây) thay vì hiện form đăng nhập. Mục tiêu: 95%+ đám đông tại T0 đã sẵn sàng đăng nhập và chỉ cần refresh; số lượt login thật giảm còn ~2.000–5.000, trải đều trong thời gian chờ hàng đợi.
2. **Login nằm sau waiting room** đối với sự kiện `high_demand` — phải đăng nhập xong mới lấy được token hàng đợi, và tốc độ thả của hàng đợi sẽ dàn nhịp mọi thứ phía sau. Nếu User Service quá tải, `/user/auth/login` trả về `503` + `Retry-After`; đằng nào người dùng cũng sắp chờ vài phút trong hàng đợi, nên vài giây retry login là vô hình với họ.
3. **Làm mỗi lượt login rẻ hơn khi phục vụ, không rẻ hơn về mặt mật mã học.** Giữ nguyên `bcrypt` cost 10 (sàn bảo mật). Tăng `UV_THREADPOOL_SIZE` (8–16) và cấp cho các task login **1–2 vCPU mỗi task, ít replica hơn** — `bcrypt` song song hóa theo core, không theo các task 0.5-CPU nhỏ lẻ. Giới hạn khối lượng công việc trong process: nếu tất cả thread bcrypt đều đang bận, xếp chờ trong thời gian ngắn (≤ 500 ms) rồi trả `503` thay vì chất thêm việc vô hạn.
4. **Cô lập + pre-scale.** Một nhóm autoscaling riêng cho đường auth (việc *verify* token đã được làm cục bộ tại gateway nên `/users/me`... không bị ảnh hưởng). Với một đợt mở bán đã lên lịch, một cron job **pre-scale User Service và các pool Redis/DB trước T0 15–30 phút**, rồi scale lại sau — reactive autoscaling (mất ~30–60 giây để phản ứng) là lưới an toàn, không phải kế hoạch chính, vì cú sốc này chỉ kéo dài khoảng ~2 phút.
5. **Rate-limit + chống bot.** Phần lớn con số "50k login" trong một đợt mở bán thực chất là credential-stuffing: giới hạn theo IP (5/phút), theo account (20/phút), CAPTCHA trên form login trong khung giờ `high_demand`.

**Quy mô sau khi áp dụng các biện pháp giảm tải:** ≤ 5.000 lượt login thật trải trong 3–5 phút ≈ 20–30 login/s → User Service 2–4 task (1–2 vCPU, `UV_THREADPOOL_SIZE=8`, ~15–25 login/s mỗi task), pre-scale lên 4–6 task cho khung giờ đó; đường refresh cần 1–2 task; lượt `SELECT` có index cho mỗi login là không đáng kể. **Không cần phục vụ 50k login trong 10 giây** — đám đông đang chờ trong hàng đợi vài phút; độ trễ login vài giây là không đáng để ý.

### Thay đổi code kéo theo (theo dõi trong roadmap)
- Event Service: một module Redis read-through cache + các hook cache-bust trong `events.update/approve/reject` và `seatMap.createOrReplace`.
- Tách `getSeatMap` → `getSeatMapLayout` (có cache) + `getSeatMapState` (snapshot Redis); **bỏ lời gọi `healStaleHolds` khỏi đường đọc**.
- `SeatSnapshotJob` mới (cho mỗi sự kiện đang hoạt động, tick mỗi 1 giây): dựng lại state key, tính diff, emit một frame WS gộp.
- `StaleHoldSweeper` cron mới (30–60 giây).
- `HoldsService`: ngừng emit `broadcastSeatUpdate` cho từng ghế — chỉ ghi thay đổi vào Redis, để job lo việc phát tán.
- API Gateway: cấu hình rate-limit theo từng route, đặc biệt là `/user/auth/login`.
- Boolean `events.high_demand` + middleware waiting-room chặn các route của trang sự kiện (không chỉ checkout) khi cờ này được bật.

> **Tính đúng đắn & hành vi khi có lỗi** — những gì giữ cho hệ thống không sập khi quá tải, và các kịch bản lỗi có thể phá vỡ tính đúng đắn (race oversell, idempotency, cổng thanh toán ngừng hoạt động, Redis/RabbitMQ là điểm lỗi đơn (SPOF), bù trừ saga, observability) — được thiết kế trong [12-resilience-and-failure-design.md](12-resilience-and-failure-design.md), tài liệu này cũng mang theo góc nhìn phản biện của người đánh giá/hội đồng cho toàn bộ thiết kế.

---

## 3. Thiết kế chịu tải ở tầng container (Docker Swarm)

*(Sơ đồ kiến trúc đầy đủ đã được trình bày trong quá trình trao đổi — Client → entrypoint (api-gateway) → service VIP (round-robin qua các task) → Swarm manager giám sát & tự phục hồi.)*

**Vì sao chọn Swarm, không phải Kubernetes:** đồ án chạy ở local trước (1 node), rồi mới lên AWS sau. Trên 1 node, control plane của K8s + `kubectl` + ingress controller thêm nhiều thành phần di động mà không mang lại lợi ích gì so với `docker stack deploy` — vốn dùng cùng CLI `docker` đã dùng cho Compose. Swarm cho sẵn 2 cơ chế mà báo cáo cần — self-healing kiểu reconciliation và rolling update; chỉ có autoscale theo CPU là một add-on nhỏ (bên dưới). K8s được để dành làm hướng phát triển trong tương lai nếu hệ thống chuyển sang nhiều node trên cloud.

### Ánh xạ khái niệm sang Docker Swarm

| Khái niệm | Kubernetes | Docker Swarm |
|---|---|---|
| Edge / định tuyến L7 | Ingress (+ NGINX controller) | Service `api-gateway` trên published port + routing mesh của Swarm (Traefik chỉ khi cần path-rule/rate-limit ở biên) |
| Target Group (chọn instance) | Service + label selector | Service VIP + round-robin sẵn có qua các task khỏe mạnh |
| 1 instance đang chạy | Pod | Task (1 container) |
| Orchestrator (giám sát & tự phục hồi) | Deployment controller (`replicas` + probes) | Vòng lặp reconciliation của Swarm manager (`deploy.replicas` + `healthcheck`) |
| Auto Scaling | HorizontalPodAutoscaler | Sidecar `autoscaler` (`docker stats` → `docker service scale`) |
| Đảm bảo tối thiểu N container khi bảo trì | PodDisruptionBudget | `update_config.parallelism: 1` + `order: start-first` |
| Config / secret | ConfigMap / Secret | `docker config` / `docker secret` (dùng env thẳng cho demo) |

### Cơ chế tự phục hồi (self-healing)

Swarm manager liên tục so sánh `desired` (số `deploy.replicas` được khai báo, ví dụ 3) với số task đang chạy và khỏe mạnh trên thực tế. Nếu có sai lệch — một container bị crash, bị OOM-kill, hoặc fail `healthcheck` liên tiếp đủ số lần `retries` — manager sẽ **dừng task hỏng và khởi động một task thay thế** trong vài giây, không cần con người can thiệp. Đây là cùng ý tưởng reconciliation như một K8s Deployment, nhưng không cần một control plane riêng.

Swarm chỉ có **1** `healthcheck`, không tách riêng liveness/readiness/startup probe như K8s. Các hành vi được tái hiện như sau:

| Hành vi ở K8s | Swarm đáp ứng ra sao |
|---|---|
| **Liveness** (chết → giết & thay) | `healthcheck` fail đủ số lần `retries` → manager giết và tạo lại task — cơ chế "tự thay thế khi crash" |
| **Readiness** (chưa sẵn sàng → không route / không cắt sang) | Routing mesh chỉ gửi traffic tới các task đang pass `healthcheck`; khi deploy, `update_config: order: start-first` bắt buộc task mới phải pass healthcheck **trước khi** task cũ bị gỡ bỏ |
| **Startup** (grace period lúc khởi động) | `healthcheck.start_period` (ví dụ 30s) tạm ngưng đánh giá health trong lúc app còn đang kết nối tới DB/Redis/broker |

### Auto Scaling

Swarm không có autoscaler CPU tích hợp sẵn (K8s cũng vậy, nếu thiếu metrics-server). Một sidecar `autoscaler` nhỏ lấp vào chỗ trống: nó poll `docker stats` cho các task của service, tính CPU% trung bình, và gọi `docker service scale` trong một khoảng `MIN`–`MAX` — scale up khi mức trung bình vượt `CPU_UP` (60%), scale down sau vài lần đọc thấp liên tiếp, kèm một `COOLDOWN` sau mỗi hành động để tránh dao động liên tục. `MIN` (3) là một mốc dự phòng độc lập, không suy ra từ tải — nó chỉ đảm bảo luôn có headroom chịu lỗi bất kể lưu lượng. Việc có thể giải thích được từng dòng của vòng điều khiển này (đo → so với mục tiêu → tác động → cooldown) là một điểm bảo vệ mạnh hơn so với một HPA hộp đen.

**Hai loại "trần" khác nhau — đừng nhầm lẫn khi bảo vệ đồ án:**
- **Trần production mục tiêu** (con số thiết kế, dùng cho phần capacity-planning trong báo cáo): ~6-10 task `booking-service`, ước tính từ 300–500 req/s ÷ ~60-100 req/s mỗi task ở mục 2 phía trên, nhân với hệ số dự phòng ×1.3. 5 service còn lại chạy cố định 2-3 replica mỗi service (Event Service nghiêng cao hơn vì luồng browse/search mang lượng traffic lớn nhất). Đây là mức mà hệ thống sẽ scale tới trên AWS trong một đợt mở bán flash-sale.
- **Trần demo local** (`MAX: 6` trong `docker-stack.yml`, mức thực tế chạy trên Swarm 1 node): một con số nhỏ hơn nhiều, chọn sao cho khả thi trên laptop và demo được gọn gàng — `3 → 6` là một bước nhân đôi, nên chỉ cần tạo đủ tải để kích hoạt một lần scale-up là đủ để minh họa cơ chế từ đầu đến cuối. Chỉ `booking-service` cần autoscaler cho demo; 5 service còn lại giữ cố định 1-2 replica.

### Bộ file stack mẫu

Đã chuẩn bị một template đầy đủ cho Booking Service (áp dụng theo cách tương tự cho 5 service còn lại): [swarm/docker-stack.yml](swarm/docker-stack.yml) (healthcheck + `deploy.replicas` + `restart_policy` + `update_config` + `resources`), [swarm/autoscaler/](swarm/autoscaler/) (autoscaler CPU — `autoscale.sh` + `Dockerfile`), và [swarm/README.md](swarm/README.md) kèm hướng dẫn deploy cùng 2 demo có thể quay lại: **self-healing** (`docker rm -f` một task, xem manager tạo lại) và **autoscaling** (đánh tải, xem `3 → 6`). Cả hai đều đáng quay lại làm bằng chứng trực quan khi bảo vệ đồ án.

### Trạng thái hiện tại
Phần này hiện đang ở giai đoạn **thiết kế** — chưa được triển khai. Khi mỗi service đã có Dockerfile (Phase 9), có thể chạy trên một Swarm 1 node (`docker swarm init`) ở local, rồi chuyển lên AWS (ECS, hoặc EKS nếu muốn dùng K8s) sau đó.

---

## 4. Bước tiếp theo cho phần deploy

- Viết một **script load test cụ thể** (script k6) để lấy số liệu thật thay cho các con số ví dụ ở trên
- Viết **Dockerfile** cho từng service (để build image dùng trong các file stack ở mục 3)
- Dựng một **Docker Swarm 1 node** (`docker swarm init`) để kiểm thử cơ chế self-healing & autoscaling trước khi lên cloud
- Thiết kế một **pipeline CI/CD** cơ bản (build → test → deploy)
- Cấu hình **monitoring & alerting** (Prometheus + Grafana, hoặc thứ gì đó đơn giản hơn tùy thời gian)

---

*Tài liệu liên quan: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md, 12-resilience-and-failure-design.md*
