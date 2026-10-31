# API CONTRACTS
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

Danh sách endpoint theo từng service, khớp với các path prefix của API Gateway (`/user`, `/event`, `/booking`, `/payment`, `/ticket` — gateway là edge router, xem [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md)) và các bảng sở hữu theo [07-database-schema.md](07-database-schema.md). Đây là bản nháp làm việc — DTO chính xác sẽ được tinh chỉnh khi bắt đầu triển khai, nhưng hình dạng/quyền sở hữu bên dưới không nên thay đổi.

## Quy ước

- **Auth**: `Authorization: Bearer <JWT>` do User Service cấp. Gateway xác thực chữ ký **và kiểm tra phiên của token (claim `sid`) còn hoạt động** trong Redis, rồi chuyển tiếp `{ userId, role }` đã decode cho các service qua header nội bộ (`X-User-Id`, `X-User-Role`) — service tin tưởng Gateway và không tự xác thực lại JWT. Mỗi tài khoản chỉ có một phiên hoạt động: đăng nhập mới sẽ đăng xuất thiết bị trước đó. Token bị từ chối nhận `401 { ..., code }` với `code` = `TOKEN_INVALID` \| `SESSION_REVOKED` \| `SESSION_REPLACED` (đã đăng nhập nơi khác); `503` nếu không kết nối được kho phiên (chặn thay vì cho qua).
- **Pagination**: `?page=1&limit=20`, response bọc dưới dạng `{ data: [...], page, limit, total }`.
- **Lỗi**: `{ statusCode, message, error }` (dạng mặc định của `HttpException` trong Nest).
- **Endpoint chỉ dùng nội bộ (internal-only)** không lộ ra qua API Gateway — chỉ được gọi service-to-service trên overlay network nội bộ.

---

## 1. User Service (`/user`)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/auth/register` | none | Tạo tài khoản (email/phone + password) |
| GET | `/auth/google` \| `/auth/facebook` | none | Redirect sang màn hình cấp quyền của provider (điều hướng trình duyệt, không phải XHR) |
| GET | `/auth/google/callback` \| `/auth/facebook/callback` | none | Provider redirect về — kiểm tra cookie `state`, find-or-create User (chỉ liên kết vào tài khoản có sẵn khi provider đã xác minh email), rồi redirect vào `/oauth/callback?code=<mã dùng một lần>` của apps/web; lỗi thì về `/login?loi=<mã lỗi>` |
| POST | `/auth/oauth/exchange` | none | `{ code }` (dùng một lần, 60 giây) → access + refresh token, như đăng nhập |
| POST | `/auth/login` | none | Đăng nhập, trả về access + refresh token; thu hồi phiên khác của user |
| POST | `/auth/refresh` | refresh token | Xoay vòng: trả cặp access + refresh token mới; refresh token cũ hết dùng được. Dùng lại token đã bị thay sẽ thu hồi cả phiên |
| POST | `/auth/logout` | refresh token | `{ refreshToken }` → `200 { ok: true }`; thu hồi phiên, access token của phiên đó bị từ chối ngay |
| POST | `/auth/forgot-password` | none | `{ email }` → luôn `200 { ok: true }` (không lộ email nào có tài khoản). Gửi email liên kết dùng một lần, hiệu lực 30 phút; tối đa 1 email/tài khoản/phút |
| POST | `/auth/reset-password` | none | `{ token, newPassword }` (token = 64 ký tự hex trong link, mật khẩu ≥ 8) → `200 { ok: true }`; huỷ mọi token đặt lại còn lại và đăng xuất mọi phiên. `400` nếu token sai/đã dùng/hết hạn |
| GET | `/users/me` | customer+ | Hồ sơ của user hiện tại |
| PATCH | `/users/me` | customer+ | Cập nhật hồ sơ của mình |
| POST | `/organizers/apply` | customer | Nộp đơn xin làm Organizer (set cờ chờ xác minh) |
| GET | `/users` | admin | Liệt kê/tìm kiếm/lọc user |
| PATCH | `/users/:id/lock` | admin | Khóa hoặc mở khóa tài khoản |
| PATCH | `/users/:id/verify-organizer` | admin | Duyệt đơn xin làm organizer |
| POST | `/partner-invites` | admin | Mời đối tác qua email (`{ email, fullName, phone? }`). Lưu token dùng một lần (chỉ lưu SHA-256, 7 ngày) và gửi email chứa liên kết; **tài khoản chưa tồn tại**. Mời lại cùng email thì liên kết cũ vô hiệu; `409` nếu email đã đăng ký |
| GET | `/partner-invites/preview` | none | `?token=` → `{ email, fullName }` cho trang đặt mật khẩu; `400` nếu token sai/đã dùng/hết hạn |
| POST | `/partner-invites/accept` | none | `{ token, password }` → tạo tài khoản ORGANIZER (đã xác minh, email đã xác nhận) trong một transaction và huỷ token; sau đó đối tác đăng nhập như bình thường |
| PATCH | `/users/:id/partner` | admin | Sửa `fullName`, `phone` (`null` để xoá), `avatarUrl`, `organizerDescription` của đối tác. Không sửa được email (tên đăng nhập); `404` nếu đối tượng không phải ORGANIZER |

---

## 2. Event Service (`/event`)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/events` | none | Tìm kiếm/lọc sự kiện đã publish (danh mục, địa điểm, khoảng thời gian, khoảng giá, từ khóa) |
| GET | `/events/:id` | none | Chi tiết sự kiện (kèm `showtimes` và `ticketTypes` của từng suất) |
| GET | `/events/:id/recommendations` | none | "Có thể bạn cũng thích" — hệ gợi ý lai: tương đồng nội dung TF-IDF + đồng yêu thích item-item + tín hiệu thành phố/giá/ngày, cache Redis 10 phút |
| GET | `/media/config` | none | `{ uploadEnabled, maxBytes }` — Supabase Storage đã được cấu hình chưa (nếu chưa, web ẩn nút tải ảnh) |
| POST | `/media/images` | user | `multipart/form-data` `file` + `kind` (`banner`/`logo`/`zone-map`/`avatar`/`artist`/`content`) → `{ url }`. Kiểm tra nội dung JPG/PNG/WEBP/GIF, ≤5MB, lưu vào bucket công khai `media` của Supabase tại `<kind>/<userId>/<uuid>.<ext>`. URL CDN trả về được lưu vào `bannerUrl`/`avatarUrl`/... như một link dán tay |
| GET | `/events/admin` | admin | Mọi sự kiện, mọi trạng thái, lọc được (`status`, `q`, `organizerId`), kèm số vé đã bán/tổng |
| POST | `/events/:id/showtimes` | organizer (owner) / admin | Thêm một hoặc nhiều suất diễn (`items[]`, tuỳ chọn `copyTicketTypesFrom`); chỉ cho sự kiện GENERAL |
| DELETE | `/showtimes/:id` | organizer (owner) / admin | Xoá suất diễn chưa bán vé |
| POST | `/events` | organizer | Tạo sự kiện (`status = DRAFT`) |
| PATCH | `/events/:id` | organizer (owner) / admin | Sửa thông tin sự kiện (admin cũng có thể `POST /events` kèm `organizerId` để tạo thay đối tác). Khi đã `PUBLISHED`, `startTime`/`endTime` bị khoá với mọi người (dùng dời lịch) và các trường địa điểm (`venueName`, `venueAddress`, `isOnline`, `province`, `ward`, `streetAddress`) **chỉ admin** được sửa |
| POST | `/events/:id/submit` | organizer (owner) | Gửi cho Admin duyệt (`status = PENDING_APPROVAL`) |
| PATCH | `/events/:id/approve` | admin | Duyệt (`status = PUBLISHED`) |
| PATCH | `/events/:id/reject` | admin | Từ chối kèm lý do (`status = REJECTED`) |
| GET | `/categories` | none | Liệt kê danh mục |
| POST | `/categories` | admin | Tạo danh mục |
| POST | `/events/:id/ticket-types` | organizer (owner) | Thêm hạng vé (sự kiện General Admission) |
| PATCH | `/ticket-types/:id` | organizer (owner) | Sửa hạng vé |
| POST | `/events/:id/seat-map` | organizer (owner) / admin | Tạo/thay sơ đồ ghế (zone + lưới ghế). Chế độ canvas có thể kèm `canvas.rowLabels` (theo hàng lưới) cho khán phòng không đánh chữ A, B, C… (ví dụ bỏ F và J); bị khoá khi đã có ghế được giữ/bán |
| GET | `/events/:id/seat-map/layout` | none | Cấu trúc bất biến (zone, hàng, seat ID, tọa độ, giá zone). Cache ở CDN + Redis — xem [04-deployment-design.md](04-deployment-design.md) §2a |
| GET | `/events/:id/seat-map/state` | none | Snapshot trạng thái từng ghế, hay biến động (Available/Held/Booked/Blocked). Phục vụ từ snapshot Redis dựng lại ~1 lần/giây; poll mỗi 2–3 giây |
| PATCH | `/seats/:id/block` | organizer (owner) | Đánh dấu một ghế Blocked (ghế hỏng/giữ riêng) |
| POST | `/events/:id/discount-codes` | organizer (owner) | Tạo mã giảm giá |
| GET | `/discount-codes/validate` | customer | `?eventId=&code=` — validate mã trước khi checkout |
| POST | `/events/:id/favorite` \| DELETE `/events/:id/favorite` | customer | Lưu/bỏ lưu sự kiện (yêu thích) |
| GET | `/events/favorites/mine` | customer | Sự kiện đã lưu của tôi, có phân trang |
| GET | `/events/favorites/ids` | customer | `?eventIds=a,b,c` — kiểm tra hàng loạt cho lưới kết quả tìm kiếm |
| POST | `/artists` | organizer / admin | Tạo nghệ sĩ. Của organizer ở trạng thái `PENDING` tới khi admin duyệt; **admin phải gửi `organizerId`** (đối tác sở hữu) và nghệ sĩ được duyệt + xác minh ngay |
| POST | `/artists/:id/follow` \| DELETE `/artists/:id/follow` | customer | Theo dõi / bỏ theo dõi nghệ sĩ. **Chỉ khách hàng** (organizer/admin nhận `403`); `GET /artists/:id/viewer` trả `canFollow` |
| GET | `/internal/events/needing-reminder` | internal (Notification Service) | Sự kiện đã publish sắp diễn ra trong `?hoursBefore=±bandHours/2`, chưa gửi nhắc lịch |
| POST | `/internal/events/:id/mark-reminder-sent` | internal | Đánh dấu đã gửi để cron không gửi lại |
| WS | `/events/:id/seat-map/subscribe` | none | Namespace Socket.IO (tùy chọn — mặc định vẫn là poll `/seat-map/state`). Emit **một frame `seat:batch` gộp mỗi room mỗi giây**, không phải mỗi-ghế-một-lần — xem [04-deployment-design.md](04-deployment-design.md) §2a |
| POST | `/internal/seats/:id/hold` | internal (Booking Service) | Khóa Redis `SETNX`, TTL ~10 phút, set `status=HELD` |
| POST | `/internal/seats/:id/release` | internal | Giải phóng một hold, `status=AVAILABLE` |
| POST | `/internal/seats/:id/confirm` | internal | Thanh toán thành công, `status=BOOKED` |
| POST | `/internal/ticket-types/:id/reserve` | internal | Giảm `quantityTotal` còn lại / tăng `quantitySold` cho General Admission |
| POST | `/internal/ticket-types/:id/release` | internal | Đảo ngược một lần đặt trước (hold hết hạn/bị hủy) |

---

## 3. Booking Service (`/booking`)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/cart/hold` | customer | `{ eventId, items: [{ ticketTypeId? \| seatId?, quantity }] }` → gọi Event Service giữ ghế/số lượng 10 phút (`expiresAt`, đồng hồ đếm ngược ở trang thanh toán), tạo `Order` (`PENDING_PAYMENT`). `400 { code: "NATIONAL_ID_REQUIRED" }` nếu người mua chưa có CCCD |
| GET | `/resale/listings` | none | Chợ vé bán lại: các tin ACTIVE (`?eventId=`, phân trang), không bao giờ lộ danh tính người bán |
| GET | `/resale/listings/:id` | none | Một tin cho trang chi tiết (mọi trạng thái trừ `CANCELED`; còn lại `404`) |
| POST | `/resale/listings` | customer | `{ ticketId, price }` — rao bán vé của mình; giá là số nguyên **> 0 và ≤ giá gốc** (không có mức tối thiểu nào khác) |
| POST | `/resale/listings/:id/buy` | customer | Giữ vé và tạo order `RESALE` để thanh toán tại `/checkout/:orderId` |
| POST | `/orders/:id/apply-discount` | customer (owner) | `{ code }` → validate với Event Service, tính lại tổng tiền |
| GET | `/orders/:id` | customer (owner) | Chi tiết đơn hàng |
| GET | `/orders` | customer | Đơn hàng của tôi, có phân trang |
| POST | `/orders/:id/cancel` | customer (owner) | Khách hàng tự hủy trước khi thanh toán (giải phóng hold) |
| GET | `/orders` (admin/organizer view) | admin/organizer | Lọc theo sự kiện/trạng thái cho dashboard |
| GET | `/orders/stats` | organizer/admin | `?eventId=` cho một sự kiện của chính mình (hoặc bất kỳ sự kiện nào nếu là admin), bỏ trống để xem thống kê toàn hệ thống (admin-only). `?days=` khoảng thời gian (mặc định 30) — doanh thu, số đơn/vé, xu hướng theo ngày, top sự kiện (chỉ khi xem toàn hệ thống) |

Booking Service không có endpoint hoàn tiền — refund do Payment Service sở hữu và phục vụ (xem bên dưới); Booking chỉ phản ứng lại các event `RefundApproved`/`OrderCanceled` (xem [09-event-contracts.md](09-event-contracts.md)).

---

## 4. Payment Service (`/payment`)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/payments` | customer | `{ orderId, method }` (`method` ∈ vnpay/momo/paypal/sepay) → tạo payment intent, trả về redirect URL của cổng thanh toán (với `sepay` — chuyển khoản tiền thật qua VietQR — là URL quay về trang thanh toán của apps/web, nơi hiển thị mã QR) |
| POST | `/payments/webhook/:provider` | gateway signature (SePay: `Authorization: Apikey …`) | Callback server-to-server (IPN) từ cổng thanh toán xác nhận thành công/thất bại; SePay gọi cho mọi biến động trên tài khoản ngân hàng đã liên kết, giao dịch không khớp được xác nhận và bỏ qua |
| GET | `/payments/return/:provider` | gateway redirect | Trình duyệt được cổng thanh toán redirect về sau khi checkout; redirect tiếp vào apps/web kèm kết quả |
| GET | `/payments/:id` | customer (owner) | Trạng thái thanh toán; thanh toán `sepay` đang PENDING kèm thêm `bankTransfer` (URL ảnh QR, tài khoản, số tiền, nội dung chuyển khoản) |
| GET | `/refunds/quote` | customer | `?orderId&orderItemIds=a,b&reasonCategory` → số tiền được hoàn cho đúng các vé đó (chia theo tỷ lệ số tiền đã trả, có tính mã giảm giá), kèm `autoApprove` |
| POST | `/refunds` | customer | `{ orderId, orderItemIds?, reasonCategory?, reason }` + tệp minh chứng — hủy từng vé theo UC-04 (bỏ trống `orderItemIds` = mọi vé còn lại). Nếu sự kiện bật `refundPolicy.autoApprove` và lý do không cần minh chứng: duyệt và hoàn tiền ngay, ngược lại chờ ban tổ chức duyệt |
| GET | `/refunds` | organizer/admin | Liệt kê yêu cầu hoàn tiền (lọc theo sự kiện/trạng thái) |
| PATCH | `/refunds/:id/approve` | organizer/admin | Duyệt → thực hiện hoàn tiền qua cổng thanh toán |
| PATCH | `/refunds/:id/reject` | organizer/admin | Từ chối kèm lý do |

---

## 5. Ticket Service (`/ticket`)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/tickets/mine` | customer | Vé của tôi |
| GET | `/tickets/:id` | customer (owner) | Chi tiết vé kèm QR |
| POST | `/tickets/:id/check-in` | check-in staff | `{ qrPayload }` — validate & đánh dấu `USED` |
| GET | `/events/:id/attendees` | organizer (owner) | Xuất danh sách khách tham dự |
| GET | `/internal/tickets/by-event/:eventId` | internal (Notification Service) | Danh sách userId (duy nhất) đang giữ vé còn hiệu lực — phục vụ cron nhắc lịch sự kiện |

---

## 6. Notification Service

Không có REST API cho khách hàng — chủ yếu là consumer của broker (xem
[09-event-contracts.md](09-event-contracts.md)) cộng với một tác vụ polling
nền: `EventReminderService` định kỳ hỏi Event Service sự kiện nào sắp diễn
ra (`/internal/events/needing-reminder`), lấy danh sách khách từ Ticket
Service, và gửi email nhắc lịch một lần cho mỗi người. Chỉ expose `/health`
và `/metrics` — không có route HTTP đầu vào nào khác.

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md, 12-resilience-and-failure-design.md*
