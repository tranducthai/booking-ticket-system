# API CONTRACTS
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

Danh sách endpoint theo từng service, khớp với các path prefix của API Gateway (`/user`, `/event`, `/booking`, `/payment`, `/ticket` — gateway là edge router, xem [05-project-structure-and-tech-stack.md](05-project-structure-and-tech-stack.md)) và các bảng sở hữu theo [07-database-schema.md](07-database-schema.md). Đây là bản nháp làm việc — DTO chính xác sẽ được tinh chỉnh khi bắt đầu triển khai, nhưng hình dạng/quyền sở hữu bên dưới không nên thay đổi.

## Quy ước

- **Auth**: `Authorization: Bearer <JWT>` do User Service cấp. Gateway xác thực chữ ký rồi chuyển tiếp `{ userId, role }` đã decode cho các service qua header nội bộ (`X-User-Id`, `X-User-Role`) — service tin tưởng Gateway và không tự xác thực lại JWT.
- **Pagination**: `?page=1&limit=20`, response bọc dưới dạng `{ data: [...], page, limit, total }`.
- **Lỗi**: `{ statusCode, message, error }` (dạng mặc định của `HttpException` trong Nest).
- **Endpoint chỉ dùng nội bộ (internal-only)** không lộ ra qua API Gateway — chỉ được gọi service-to-service trên overlay network nội bộ.

---

## 1. User Service (`/user`)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/auth/register` | none | Tạo tài khoản (email/phone + password) |
| POST | `/auth/oauth/:provider` | none | Đăng ký/đăng nhập qua Google hoặc Facebook |
| POST | `/auth/login` | none | Đăng nhập, trả về access + refresh token |
| POST | `/auth/refresh` | refresh token | Cấp access token mới |
| GET | `/users/me` | customer+ | Hồ sơ của user hiện tại |
| PATCH | `/users/me` | customer+ | Cập nhật hồ sơ của mình |
| POST | `/organizers/apply` | customer | Nộp đơn xin làm Organizer (set cờ chờ xác minh) |
| GET | `/users` | admin | Liệt kê/tìm kiếm/lọc user |
| PATCH | `/users/:id/lock` | admin | Khóa hoặc mở khóa tài khoản |
| PATCH | `/users/:id/verify-organizer` | admin | Duyệt đơn xin làm organizer |

---

## 2. Event Service (`/event`)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/events` | none | Tìm kiếm/lọc sự kiện đã publish (danh mục, địa điểm, khoảng thời gian, khoảng giá, từ khóa) |
| GET | `/events/:id` | none | Chi tiết sự kiện |
| POST | `/events` | organizer | Tạo sự kiện (`status = DRAFT`) |
| PATCH | `/events/:id` | organizer (owner) | Sửa thông tin sự kiện |
| POST | `/events/:id/submit` | organizer (owner) | Gửi cho Admin duyệt (`status = PENDING_APPROVAL`) |
| PATCH | `/events/:id/approve` | admin | Duyệt (`status = PUBLISHED`) |
| PATCH | `/events/:id/reject` | admin | Từ chối kèm lý do (`status = REJECTED`) |
| GET | `/categories` | none | Liệt kê danh mục |
| POST | `/categories` | admin | Tạo danh mục |
| POST | `/events/:id/ticket-types` | organizer (owner) | Thêm hạng vé (sự kiện General Admission) |
| PATCH | `/ticket-types/:id` | organizer (owner) | Sửa hạng vé |
| POST | `/events/:id/seat-map` | organizer (owner) | Tạo/thay thế seat map (zone + lưới ghế) |
| GET | `/events/:id/seat-map/layout` | none | Cấu trúc bất biến (zone, hàng, seat ID, tọa độ, giá zone). Cache ở CDN + Redis — xem [04-deployment-design.md](04-deployment-design.md) §2a |
| GET | `/events/:id/seat-map/state` | none | Snapshot trạng thái từng ghế, hay biến động (Available/Held/Booked/Blocked). Phục vụ từ snapshot Redis dựng lại ~1 lần/giây; poll mỗi 2–3 giây |
| PATCH | `/seats/:id/block` | organizer (owner) | Đánh dấu một ghế Blocked (ghế hỏng/giữ riêng) |
| POST | `/events/:id/discount-codes` | organizer (owner) | Tạo mã giảm giá |
| GET | `/discount-codes/validate` | customer | `?eventId=&code=` — validate mã trước khi checkout |
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
| POST | `/cart/hold` | customer | `{ eventId, items: [{ ticketTypeId? \| seatId?, quantity }] }` → gọi Event Service để giữ ghế/số lượng, tạo `Order` (`PENDING_PAYMENT`) |
| POST | `/orders/:id/apply-discount` | customer (owner) | `{ code }` → validate với Event Service, tính lại tổng tiền |
| GET | `/orders/:id` | customer (owner) | Chi tiết đơn hàng |
| GET | `/orders` | customer | Đơn hàng của tôi, có phân trang |
| POST | `/orders/:id/cancel` | customer (owner) | Khách hàng tự hủy trước khi thanh toán (giải phóng hold) |
| GET | `/orders` (admin/organizer view) | admin/organizer | Lọc theo sự kiện/trạng thái cho dashboard |

Booking Service không có endpoint hoàn tiền — refund do Payment Service sở hữu và phục vụ (xem bên dưới); Booking chỉ phản ứng lại các event `RefundApproved`/`OrderCanceled` (xem [09-event-contracts.md](09-event-contracts.md)).

---

## 4. Payment Service (`/payment`)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/payments` | customer | `{ orderId, method }` → tạo payment intent, trả về redirect URL của cổng thanh toán |
| POST | `/payments/webhook/:provider` | gateway signature | Callback bất đồng bộ từ VNPay/Momo/ZaloPay xác nhận thành công/thất bại |
| GET | `/payments/:id` | customer (owner) | Trạng thái thanh toán |
| POST | `/refunds` | customer | `{ orderId, reason }` — yêu cầu hoàn tiền theo UC-04 |
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

---

## 6. Notification Service

Không có REST API — thuần túy là consumer của broker (xem [09-event-contracts.md](09-event-contracts.md)). Chỉ expose endpoint `/health` cho Docker healthcheck.

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md, 12-resilience-and-failure-design.md*
