# THIẾT KẾ HỆ THỐNG
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

## 1. Thiết kế cơ sở dữ liệu (ERD)

13 bảng: `USERS`, `CATEGORIES`, `EVENTS`, `TICKET_TYPES`, `SEAT_MAPS`, `SEAT_ZONES`, `SEATS`, `ORDERS`, `ORDER_ITEMS`, `TICKETS`, `PAYMENTS`, `DISCOUNT_CODES`, `REFUNDS`.

*(Sơ đồ ERD đầy đủ đã được trình bày trong quá trình trao đổi — có thể dựng lại bằng dbdiagram.io hoặc MySQL Workbench cho báo cáo. Schema chi tiết từng trường theo từng bảng nằm ở [07-database-schema.md](07-database-schema.md).)*

### Quyết định thiết kế cốt lõi: xử lý 2 mô hình bán vé trong 1 schema

Bảng `ORDER_ITEMS` có **2 khóa ngoại tùy chọn** (nullable):
- `ticket_type_id` → được điền cho vé không ghế cố định (General Admission)
- `seat_id` → được điền khi khách chọn một ghế cụ thể (Seat Map)

Một dòng `order_items` chỉ điền đúng 1 trong 2 cột này (ràng buộc CHECK ở tầng database: chỉ 1 trong 2 khác NULL). Nhờ vậy toàn bộ luồng đặt vé — giỏ hàng, thanh toán, sinh vé điện tử — dùng chung một pipeline xử lý bất kể sự kiện thuộc mô hình nào.

Cột `EVENTS.ticket_mode` (giá trị `general` hoặc `seatmap`) cho ứng dụng biết nên hiển thị giao diện chọn số lượng vé hay giao diện sơ đồ ghế.

### Giải thích các bảng chính

| Bảng | Vai trò |
|---|---|
| `USERS` | Bảng tài khoản dùng chung cho cả 3 vai trò (phân biệt qua cột `role`) |
| `CATEGORIES` | Danh mục sự kiện (Nhạc/Kịch/Phim/Thể thao/Workshop...), được gán cho `EVENTS` |
| `EVENTS` | Thông tin sự kiện, liên kết tới ban tổ chức và danh mục |
| `TICKET_TYPES` | Hạng vé (VIP/Thường) cho sự kiện General Admission — có `quantity_total`/`quantity_sold` để kiểm soát tồn kho |
| `SEAT_MAPS` → `SEAT_ZONES` → `SEATS` | Phân cấp 3 tầng cho sự kiện có ghế: 1 sự kiện có 1 sơ đồ, 1 sơ đồ có nhiều khu vực, 1 khu vực có nhiều ghế. `SEATS.status` lưu trạng thái Available/Held/Booked/Blocked — đây là trường cần xử lý concurrency (lock hoặc Redis TTL) khi khách giữ chỗ |
| `ORDERS` | Đơn hàng, gộp nhiều `ORDER_ITEMS` |
| `ORDER_ITEMS` | Từng vé/ghế trong một đơn hàng — cầu nối giữa 2 mô hình bán vé |
| `TICKETS` | Vé điện tử QR — quan hệ 1-1 với `ORDER_ITEMS` |
| `PAYMENTS` | Tách riêng khỏi `ORDERS` để hỗ trợ nhiều lần thử thanh toán cho cùng một đơn |
| `REFUNDS` | Yêu cầu hoàn tiền, liên kết tới `ORDERS` |
| `DISCOUNT_CODES` | Mã giảm giá theo từng sự kiện |

### Lưu ý khi triển khai
- Cân nhắc thêm bảng `SEAT_HOLDS` (hoặc dùng Redis) để lưu trạng thái giữ chỗ tạm thời có TTL, tránh việc `SEATS.status = 'held'` bị "treo" mãi mãi nếu tiến trình cập nhật gặp lỗi.
- Cân nhắc đánh index trên `EVENTS.start_time`, `ORDERS.user_id`, `SEATS.zone_id` để tối ưu các truy vấn tìm kiếm và tra cứu.
- `ORDER_ITEMS.price` nên lưu **giá tại thời điểm mua** (snapshot), không tham chiếu trực tiếp giá hiện tại của `TICKET_TYPES`/`SEAT_ZONES`, để tránh sai lệch khi giá vé thay đổi về sau.

---

## 2. Kiến trúc microservices

Client → API Gateway → 6 microservice nghiệp vụ → Message broker.

*(Sơ đồ kiến trúc đầy đủ đã được trình bày trong quá trình trao đổi.)*

### Phân chia service & dữ liệu (Database per Service)

| Service | Sở hữu bảng (từ ERD) | Trách nhiệm chính |
|---|---|---|
| **User Service** | `USERS` | Đăng ký/đăng nhập, JWT, phân quyền 3 vai trò |
| **Event Service** | `EVENTS`, `CATEGORIES`, `TICKET_TYPES`, `SEAT_MAPS`, `SEAT_ZONES`, `SEATS`, `DISCOUNT_CODES` | Nguồn sự thật cho cấu trúc sự kiện & sơ đồ ghế, tìm kiếm/lọc sự kiện |
| **Booking Service** | `ORDERS`, `ORDER_ITEMS` | Giỏ hàng, giữ chỗ tạm thời qua Redis (TTL), khởi động luồng đặt vé và cập nhật trạng thái đơn khi nhận sự kiện từ broker |
| **Payment Service** | `PAYMENTS`, `REFUNDS` | Tích hợp cổng thanh toán ngoài, xử lý webhook, hoàn tiền |
| **Ticket Service** | `TICKETS` | Sinh mã QR có chữ ký số, xử lý check-in tại sự kiện |
| **Notification Service** | (không sở hữu bảng nghiệp vụ) | Lắng nghe sự kiện hệ thống, gửi email/SMS |

### Giao tiếp giữa các service

- **Đồng bộ (REST qua API Gateway)**: cho các thao tác cần phản hồi ngay lập tức — đăng nhập, tìm sự kiện, giữ chỗ ghế, thanh toán.
- **Bất đồng bộ (qua Message Broker — Kafka/RabbitMQ)**: cho các bước diễn ra sau khi một hành động chính đã hoàn tất — ví dụ sau khi thanh toán thành công thì sinh vé và gửi email, khách hàng không cần chờ các bước này.

### Luồng đặt vé theo mô hình Saga (event-driven)

1. Client → Gateway → **Booking Service**: giữ chỗ ghế (gọi Event Service để khóa ghế qua Redis, TTL ~10 phút)
2. Client → Gateway → **Payment Service**: xử lý thanh toán qua cổng thanh toán ngoài
3. Payment Service thành công → phát sự kiện `PaymentSucceeded` lên broker
4. **Booking Service** lắng nghe → chuyển đơn hàng sang trạng thái "Đã thanh toán" → phát sự kiện `OrderPaid` của riêng nó (mang theo chi tiết order-item mà Payment Service không có)
5. **Ticket Service** lắng nghe `OrderPaid` → sinh vé điện tử (QR) → phát sự kiện `TicketIssued`
6. **Notification Service** lắng nghe `TicketIssued` → gửi email xác nhận kèm vé điện tử (QR) cho khách hàng

Đầy đủ cấu trúc payload và lý do cho chuỗi 3 chặng này (thay vì để mọi service cùng lắng nghe trực tiếp `PaymentSucceeded`) nằm trong [09-event-contracts.md](09-event-contracts.md); các REST endpoint cụ thể phía sau bước 1-2 nằm trong [08-api-contracts.md](08-api-contracts.md).

Nếu một bước thất bại (ví dụ sinh vé lỗi), hệ thống có thể retry hoặc phát một sự kiện bù trừ (compensating event, ví dụ hoàn tiền tự động) mà không cần các service gọi trực tiếp lẫn nhau theo chuỗi — đây là điểm kỹ thuật đáng nhấn mạnh trong báo cáo vì thể hiện hiểu biết về **Saga pattern**, một chủ đề quan trọng khi thiết kế microservices có giao dịch xuyên nhiều service.

**Lưu ý thuật ngữ:** đây là **Saga kiểu choreography** (biên đạo) — mỗi service tự lắng nghe sự kiện trên broker và tự quyết định hành động tiếp theo của mình, **không có một service trung tâm điều phối** toàn bộ luồng. Điều này khác với **Saga kiểu orchestration**, nơi một orchestrator (ví dụ chính Booking Service) gọi tuần tự từng service và ra lệnh, đồng thời tự quyết định các bước bù trừ khi có lỗi. Đây là câu hỏi hội đồng thường hỏi khi thấy từ "Saga" xuất hiện trong báo cáo — câu trả lời đúng ở đây là hệ thống đang dùng choreography.

### Đề xuất công nghệ (tham khảo)

| Thành phần | Công nghệ đề xuất |
|---|---|
| Backend framework | Spring Boot (Java) hoặc NestJS (Node.js) — tùy stack bạn quen thuộc |
| Database mỗi service | PostgreSQL (quan hệ, phù hợp với ERD đã thiết kế) |
| Cache & giữ chỗ tạm thời | Redis (TTL cho seat/ticket holding) |
| Message broker | RabbitMQ (dễ triển khai hơn cho một đồ án trường học) hoặc Kafka (nếu muốn thể hiện kỹ năng nâng cao hơn) |
| API Gateway | Spring Cloud Gateway, Kong, hoặc Nginx tùy stack |
| Containerization | Docker + Docker Compose (dev local); Docker Swarm cho demo self-healing/autoscaling — không cần Kubernetes cho triển khai 1 node local |

### Lưu ý triển khai cho đồ án
Với khối lượng thời gian có hạn, không nhất thiết phải tách cả 6 service thành 6 tiến trình hoàn toàn độc lập ngay từ đầu. Có thể bắt đầu với kiến trúc **modular monolith** (code được tách module rõ ràng theo đúng ranh giới ở trên) rồi dần tách 1-2 service quan trọng nhất thành microservices thật sự (ví dụ Booking Service, vì đây là nơi thể hiện rõ nhất bài toán concurrency) — đủ chiều sâu kỹ thuật để bảo vệ đồ án, đồng thời vẫn khả thi về thời gian.

---

*Tài liệu liên quan: 01-business-analysis.md, 02-use-cases.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md, 12-resilience-and-failure-design.md*
