# PHÂN TÍCH NGHIỆP VỤ
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

## 1. Tổng quan hệ thống

Hệ thống là một nền tảng trung gian (marketplace) kết nối **Ban tổ chức sự kiện** với **Khách hàng mua vé**, cho phép:
- Ban tổ chức tạo, quản lý và bán vé cho sự kiện của mình
- Khách hàng tìm kiếm sự kiện, mua vé và tham dự sự kiện bằng vé điện tử
- Nền tảng thu phí dịch vụ / hoa hồng từ giao dịch

**Phạm vi đồ án:** Hệ thống hỗ trợ đa dạng loại sự kiện như Ticketbox — **Âm nhạc (concert), Kịch/Sân khấu, Phim (rạp chiếu), Thể thao, Workshop/Hội thảo**. Mỗi loại có đặc thù riêng cần lưu ý:

| Loại sự kiện | Đặc thù |
|---|---|
| Âm nhạc / Kịch / Thể thao | Thường có **sơ đồ chỗ ngồi cố định**, nhiều hạng vé theo khu vực |
| Phim | Sơ đồ ghế theo từng suất chiếu (nhiều suất/ngày), thời gian nghỉ ngắn giữa các suất |
| Workshop/Hội thảo | Thường không có chỗ ngồi cố định (General Admission), giới hạn số lượng |

Vì vậy hệ thống cần hỗ trợ **2 mô hình bán vé song song**:
1. **Vé không ghế cố định (General Admission)** — chỉ giới hạn số lượng, ai mua trước được vé
2. **Vé có ghế cố định (Seat Selection)** — khách chọn một ghế cụ thể trên sơ đồ

---

## 2. Các bên liên quan (Actors / Stakeholders)

| Actor | Vai trò |
|---|---|
| **Khách hàng (Buyer)** | Tìm kiếm sự kiện, mua vé, thanh toán, nhận vé điện tử, tham dự sự kiện |
| **Ban tổ chức (Organizer)** | Tạo & quản lý sự kiện, thiết lập loại vé/giá vé, theo dõi doanh thu, check-in khách |
| **Quản trị viên hệ thống (Admin)** | Duyệt sự kiện, quản lý người dùng, xử lý khiếu nại, cấu hình hoa hồng, xem báo cáo toàn hệ thống |
| **Nhân viên soát vé (Check-in Staff)** | Quét mã vé tại cổng sự kiện để xác thực |
| **Cổng thanh toán (Payment Gateway)** | Bên thứ ba xử lý giao dịch (VNPay, Momo, ZaloPay, thẻ...) |
| **Hệ thống thông báo (Email/SMS Gateway)** | Gửi vé điện tử, xác nhận đơn hàng, nhắc lịch sự kiện |

---

## 3. Yêu cầu chức năng (Functional Requirements)

### 3.1. Nhóm chức năng dành cho Khách hàng
- **Đăng ký / Đăng nhập** (email, số điện thoại, hoặc OAuth Google/Facebook)
- **Tìm kiếm & lọc sự kiện** theo: danh mục, địa điểm, thời gian, khoảng giá, từ khóa
- **Xem chi tiết sự kiện**: mô tả, thời gian, địa điểm, sơ đồ chỗ ngồi (nếu có), loại vé & giá
- **Chọn vé & đặt chỗ**:
  - Với sự kiện General Admission: chọn số lượng, loại vé (VIP/Thường)
  - Với sự kiện có Seat Map: xem sơ đồ trực quan (ghế trống/đã bán/đang giữ), chọn ghế cụ thể, ghế được **giữ tạm thời** (ví dụ 10 phút) trong lúc thanh toán, tự động nhả khi hết hạn
- **Giỏ hàng & thanh toán**: áp mã giảm giá, chọn phương thức thanh toán, xác nhận đơn hàng
- **Nhận vé điện tử**: mã QR/barcode gửi qua email hoặc lưu trong app
- **Quản lý đơn hàng**: xem lịch sử mua vé, trạng thái đơn, yêu cầu hoàn tiền/hủy vé (nếu chính sách cho phép)
- **Đánh giá sự kiện** sau khi tham dự (mở rộng tùy chọn)
- **Nhận thông báo**: nhắc lịch sự kiện, khuyến mãi, thay đổi lịch

### 3.2. Nhóm chức năng dành cho Ban tổ chức
- **Đăng ký tài khoản tổ chức** (có thể cần xác minh/duyệt bởi Admin)
- **Tạo & chỉnh sửa sự kiện**: thông tin, hình ảnh, thời gian, địa điểm
- **Thiết lập loại vé & giá vé**: nhiều hạng vé, số lượng giới hạn, thời gian mở/đóng bán
- **Thiết lập sơ đồ chỗ ngồi (Seat Map Builder)**:
  - Tạo sơ đồ theo khu vực (zone): VIP, Thường, Ban công... mỗi khu vực có giá riêng
  - Với rạp chiếu phim/sân khấu: tạo lưới ghế theo hàng-cột
  - Với sân vận động/khu vực đứng: có thể là khu vực không chia ghế lẻ (General zone), chỉ giới hạn sức chứa
  - Đánh dấu ghế bị chặn (ghế hỏng, ghế dành riêng cho khách mời/báo chí)
  - Sao chép sơ đồ giữa các suất diễn/sự kiện tương tự để tái sử dụng
- **Quản lý mã giảm giá / voucher**
- **Theo dõi doanh số bán vé** theo thời gian thực (dashboard)
- **Xuất danh sách khách tham dự**
- **Check-in khách tại sự kiện** (quét QR)
- **Xem báo cáo doanh thu**, đối soát với nền tảng (sau khi trừ hoa hồng)

### 3.3. Nhóm chức năng dành cho Admin
- **Duyệt/từ chối sự kiện** trước khi công khai (kiểm duyệt nội dung)
- **Quản lý người dùng**: khóa/mở tài khoản, phân quyền
- **Cấu hình hoa hồng / phí dịch vụ**
- **Quản lý danh mục sự kiện**
- **Xử lý khiếu nại, yêu cầu hoàn tiền**
- **Xem báo cáo & thống kê toàn hệ thống**: doanh thu, số lượng giao dịch, sự kiện nổi bật

### 3.4. Nhóm chức năng hệ thống (tự động)
- **Xử lý thanh toán** qua cổng thanh toán, xác nhận giao dịch
- **Sinh vé điện tử** (QR code), duy nhất, chống làm giả/trùng vé
- **Gửi email/SMS tự động**: xác nhận đơn hàng, vé điện tử, nhắc lịch
- **Khóa giữ chỗ tạm thời (seat/ticket locking)** trong khi khách thanh toán, tránh bán trùng
- **Đối soát doanh thu tự động** giữa nền tảng và ban tổ chức

---

## 4. Yêu cầu phi chức năng (Non-functional Requirements)

| Nhóm | Yêu cầu cụ thể |
|---|---|
| **Hiệu năng** | Chịu tải cao khi mở bán vé (flash sale) — nhiều người mua cùng lúc, tránh oversell |
| **Bảo mật** | Mã hóa thông tin thanh toán, chống gian lận vé, phân quyền rõ ràng theo vai trò |
| **Tính sẵn sàng** | Uptime cao, đặc biệt trong khung giờ mở bán vé |
| **Khả năng mở rộng** | Kiến trúc cho phép mở rộng khi số lượng sự kiện/người dùng tăng |
| **Tính nhất quán dữ liệu** | Đảm bảo không bao giờ bán vượt số lượng vé (concurrency control) |
| **Trải nghiệm người dùng** | Giao diện responsive (mobile-first, vì phần lớn người dùng mua vé qua điện thoại) |
| **Khả năng kiểm toán (Audit)** | Ghi log giao dịch, lịch sử thay đổi để tra soát khi có tranh chấp |

---

## 5. Bài toán Seat Map — phân tích sâu

Vì đây là module phức tạp và cũng là điểm nhấn kỹ thuật, cần phân tích kỹ luồng nghiệp vụ:

**Trạng thái của một ghế (state machine):**
```
Available (Trống)
   ├─→ Held/Locked (Đang giữ, khách đang thanh toán)
   │      ├─→ Booked/Sold (thanh toán thành công)
   │      └─→ Available (hết hạn giữ / khách hủy)
   │
   └─→ Blocked (Bị khóa bởi Ban tổ chức — ghế hỏng/giữ chỗ cho khách VIP)

Booked/Sold → Available (yêu cầu hoàn/hủy vé được duyệt trước sự kiện — xem UC-04, 02-use-cases.md)
```

**Vấn đề đồng thời (Concurrency) — quan trọng nhất:**
- 2 khách cùng bấm chọn 1 ghế trong cùng khoảnh khắc → chỉ 1 người được giữ ghế, người còn lại nhận thông báo "ghế này vừa được người khác chọn"
- Các giải pháp kỹ thuật có thể đề xuất: **row-level lock** hoặc **optimistic locking** (trường version) ở tầng database, hoặc dùng **Redis** để giữ trạng thái ghế tạm thời với TTL (Time-To-Live) tự hết hạn — đây là hướng tiếp cận hiện đại và được đánh giá cao.
- Cập nhật trạng thái ghế theo thời gian thực cho các khách khác đang xem cùng sơ đồ → cân nhắc dùng **WebSocket** để đẩy trạng thái ghế trực tiếp (khi có người giữ/nhả ghế, những người khác thấy ngay ghế đó đổi màu).

**Luồng chọn ghế của khách hàng:**
1. Khách mở trang sự kiện → xem sơ đồ ghế (trạng thái real-time)
2. Chọn một hoặc nhiều ghế trống → hệ thống giữ tạm (Held) + bắt đầu đếm ngược (ví dụ 10 phút)
3. Khách tiến hành thanh toán trong thời gian giữ chỗ
4. Thanh toán thành công → ghế chuyển thành Booked, vé điện tử được sinh ra
5. Hết thời gian giữ mà chưa thanh toán → ghế tự động trở về Available

---

## 6. Vấn đề nghiệp vụ cốt lõi cần giải quyết (điểm khó của đồ án)

Đây là những bài toán "xương sống" thường được đánh giá cao trong một đồ án hệ thống bán vé:

1. **Chống bán trùng vé (Overselling)** khi nhiều người mua cùng lúc → cần cơ chế khóa tạm thời (reservation timeout ~5-15 phút) + xử lý transaction/lock ở tầng database (áp dụng cho cả vé General Admission lẫn ghế trong Seat Map).
2. **Sinh và xác thực vé điện tử chống giả mạo** — QR code có chữ ký số hoặc mã hash, được kiểm tra tại cổng check-in để tránh việc vé bị chụp màn hình và dùng lại nhiều lần.
3. **Đối soát tài chính** giữa Ticketbox (nền tảng) và Ban tổ chức (bao nhiêu % hoa hồng, khi nào ban tổ chức được thanh toán).
4. **Quy trình hoàn/hủy vé** — chính sách hoàn tiền, ai chịu phí giao dịch của lần hoàn tiền.
5. **Luồng trạng thái đơn hàng**: Chờ thanh toán → Đã thanh toán → Đã phát hành vé → Đã sử dụng / Đã hủy.
6. **Đồng bộ trạng thái ghế theo thời gian thực** (đã phân tích ở mục 5) cho các sự kiện có sơ đồ chỗ ngồi.

---

## 7. Phạm vi tổng thể của đồ án

Với phạm vi đầy đủ (đa dạng loại sự kiện + seat map), đây là toàn bộ các module cần xây dựng:

| Module | Nội dung |
|---|---|
| **Quản lý người dùng** | Đăng ký/đăng nhập, phân quyền 3 vai trò (Khách hàng, Ban tổ chức, Admin), xác minh tài khoản Ban tổ chức |
| **Quản lý sự kiện** | CRUD sự kiện, danh mục (Nhạc/Kịch/Phim/Thể thao/Workshop), duyệt sự kiện bởi Admin |
| **Quản lý vé & giá** | Thiết lập hạng vé, giá, số lượng, thời gian mở/đóng bán |
| **Seat Map Builder & Booking** | Xây sơ đồ ghế, giữ chỗ real-time, chọn ghế cho khách hàng |
| **Giỏ hàng & Thanh toán** | Áp mã giảm giá, tích hợp cổng thanh toán, xử lý giao dịch |
| **Vé điện tử** | Sinh mã QR, gửi email, chống giả mạo |
| **Check-in** | Quét mã tại sự kiện, xác thực vé (web hoặc một app riêng cho nhân viên soát vé) |
| **Dashboard & Báo cáo** | Thống kê doanh thu cho Ban tổ chức, báo cáo toàn hệ thống cho Admin |
| **Thông báo** | Email/SMS tự động cho các sự kiện quan trọng trong luồng mua vé |

Với khối lượng công việc lớn, đồ án nên có **lộ trình phát triển theo giai đoạn (sprint)** — ví dụ: giai đoạn 1 xây module người dùng + sự kiện + vé cơ bản, giai đoạn 2 xây seat map + thanh toán, giai đoạn 3 xây check-in + dashboard + hoàn thiện.

---

*Tài liệu liên quan: 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md*
