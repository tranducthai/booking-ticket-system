# ĐẶC TẢ USE CASE
## Hệ thống bán vé sự kiện trực tuyến (tương tự Ticketbox)

---

## 1. Sơ đồ Use Case tổng quan

3 actor chính (Khách hàng, Ban tổ chức, Admin) kết nối với 3 nhóm chức năng chính bên trong ranh giới hệ thống:

- **Khách hàng** → Mua vé & tham dự (tìm kiếm sự kiện, chọn vé/ghế, thanh toán, nhận vé QR, xem đơn hàng)
- **Ban tổ chức** → Quản lý sự kiện (tạo/chỉnh sửa sự kiện, thiết lập vé & sơ đồ ghế, theo dõi doanh thu, check-in)
- **Admin** → Quản trị hệ thống (duyệt sự kiện, quản lý người dùng, cấu hình hoa hồng/danh mục, xử lý khiếu nại/báo cáo)

*(Sơ đồ đầy đủ đã được trình bày trong quá trình trao đổi. Có thể vẽ lại bằng công cụ UML như draw.io/PlantUML cho báo cáo cuối cùng.)*

---

## 2. Đặc tả chi tiết các Use Case quan trọng

### UC-01: Đặt vé & thanh toán (có chọn ghế)

| Mục | Nội dung |
|---|---|
| **Actor chính** | Khách hàng |
| **Actor phụ** | Cổng thanh toán, Hệ thống thông báo |
| **Mô tả** | Khách hàng chọn sự kiện, chọn ghế/vé, thanh toán và nhận vé điện tử |
| **Tiền điều kiện** | Khách hàng đã đăng nhập; sự kiện đang trong thời gian mở bán |
| **Luồng chính** | 1. Khách chọn sự kiện → xem sơ đồ ghế/loại vé<br>2. Chọn ghế/số lượng → hệ thống giữ chỗ tạm thời (Held, TTL ~10 phút)<br>3. Khách áp mã giảm giá (nếu có) → xem tổng tiền<br>4. Chọn phương thức thanh toán → chuyển đến cổng thanh toán<br>5. Thanh toán thành công → hệ thống cập nhật trạng thái ghế thành "Booked", sinh vé điện tử (QR)<br>6. Hệ thống gửi email xác nhận kèm vé điện tử |
| **Luồng ngoại lệ** | - Hết thời gian giữ chỗ trước khi thanh toán → ghế tự động nhả về "Available", khách được thông báo<br>- Thanh toán thất bại → gia hạn giữ chỗ thêm một khoảng ngắn để khách thử lại, hoặc nhả ghế<br>- Ghế bị người khác lấy trong lúc khách đang thao tác → báo lỗi, yêu cầu chọn lại |
| **Hậu điều kiện** | Đơn hàng ở trạng thái "Đã thanh toán", vé điện tử đã được sinh và gửi |

### UC-02: Check-in tại sự kiện

| Mục | Nội dung |
|---|---|
| **Actor chính** | Nhân viên soát vé |
| **Mô tả** | Quét mã QR trên vé điện tử để xác thực và cho phép khách vào sự kiện |
| **Tiền điều kiện** | Vé đang ở trạng thái "Đã thanh toán", chưa được sử dụng |
| **Luồng chính** | 1. Nhân viên mở màn hình quét mã<br>2. Quét mã QR trên vé của khách<br>3. Hệ thống kiểm tra: vé hợp lệ, đúng sự kiện, chưa từng check-in<br>4. Hiển thị kết quả hợp lệ → đánh dấu vé "Đã sử dụng" → cho khách vào |
| **Luồng ngoại lệ** | - Vé đã được sử dụng trước đó (có thể là gian lận chụp ảnh vé) → cảnh báo, từ chối<br>- Vé không thuộc sự kiện này → cảnh báo, từ chối<br>- Mất kết nối mạng → cần cơ chế check-in offline rồi đồng bộ sau (nâng cao) |
| **Hậu điều kiện** | Trạng thái vé chuyển thành "Đã sử dụng", thời gian check-in được ghi log |

### UC-03: Tạo sự kiện & thiết lập sơ đồ ghế

| Mục | Nội dung |
|---|---|
| **Actor chính** | Ban tổ chức |
| **Actor phụ** | Admin (duyệt sự kiện) |
| **Mô tả** | Ban tổ chức tạo sự kiện mới, thiết lập loại vé và (nếu cần) sơ đồ chỗ ngồi |
| **Tiền điều kiện** | Tài khoản Ban tổ chức đã được xác minh |
| **Luồng chính** | 1. Nhập thông tin sự kiện: tên, mô tả, thời gian, địa điểm, danh mục, hình ảnh<br>2. Chọn mô hình bán vé: General Admission hoặc Seat Map<br>3. Nếu Seat Map: dùng công cụ dựng sơ đồ (khu vực, hàng-ghế, giá theo khu vực)<br>4. Thiết lập thời gian mở/đóng bán<br>5. Gửi sự kiện để Admin duyệt<br>6. Admin duyệt → sự kiện được công khai |
| **Luồng ngoại lệ** | - Admin từ chối sự kiện (vi phạm chính sách, thiếu thông tin) → Ban tổ chức chỉnh sửa và gửi lại |
| **Hậu điều kiện** | Sự kiện ở trạng thái "Đã công khai" và khách hàng có thể tìm thấy, mua vé |

### UC-04: Yêu cầu hoàn/hủy vé

| Mục | Nội dung |
|---|---|
| **Actor chính** | Khách hàng |
| **Actor phụ** | Ban tổ chức hoặc Admin (duyệt yêu cầu) |
| **Mô tả** | Khách hàng gửi yêu cầu hoàn vé theo chính sách của sự kiện |
| **Tiền điều kiện** | Vé chưa được sử dụng; còn trong thời hạn cho phép hoàn theo chính sách |
| **Luồng chính** | 1. Khách chọn một đơn hàng → yêu cầu hoàn vé, nêu lý do<br>2. Hệ thống kiểm tra chính sách hoàn vé của sự kiện đó<br>3. Ban tổ chức/Admin duyệt yêu cầu<br>4. Hệ thống hoàn tiền qua cổng thanh toán (trừ phí nếu có), hủy vé, nhả ghế (nếu là Seat Map) |
| **Luồng ngoại lệ** | - Ngoài thời hạn hoàn vé theo chính sách → từ chối yêu cầu<br>- Vé đã được sử dụng (đã check-in) → không thể hoàn |
| **Hậu điều kiện** | Đơn hàng ở trạng thái "Đã hủy", tiền đã được hoàn (nếu được duyệt) |

---

## 3. Đặc tả các Use Case bổ sung

### UC-05: Đăng ký / Đăng nhập

| Mục | Nội dung |
|---|---|
| **Actor chính** | Khách hàng (áp dụng luôn cho luồng đăng nhập của Ban tổ chức/Admin) |
| **Actor phụ** | Nhà cung cấp OAuth (Google/Facebook), Hệ thống thông báo |
| **Mô tả** | Người dùng mới tạo tài khoản hoặc đăng nhập vào tài khoản đã có |
| **Tiền điều kiện** | Không có với đăng ký; với đăng nhập, tài khoản phải đã tồn tại |
| **Luồng chính** | 1. Người dùng chọn đăng ký hoặc đăng nhập<br>2. Đăng ký: nhập email/số điện thoại + mật khẩu, hoặc chọn OAuth → hệ thống tạo tài khoản, gửi email xác minh<br>3. Đăng nhập: nhập thông tin đăng nhập hoặc OAuth → hệ thống xác thực và cấp JWT access token + refresh token |
| **Luồng ngoại lệ** | - Email/số điện thoại đã được đăng ký → báo lỗi, gợi ý đăng nhập thay vì đăng ký<br>- Sai thông tin đăng nhập → báo lỗi, giới hạn tốc độ (rate-limit) sau nhiều lần thất bại liên tiếp<br>- Nhà cung cấp OAuth trả về lỗi/hủy → hủy quá trình đăng ký/đăng nhập |
| **Hậu điều kiện** | Người dùng có phiên đăng nhập hợp lệ (JWT); lần đăng ký đầu tiên vẫn ở trạng thái chưa xác minh cho tới khi email được xác nhận |

### UC-06: Tìm kiếm & lọc sự kiện

| Mục | Nội dung |
|---|---|
| **Actor chính** | Khách hàng |
| **Mô tả** | Khách hàng tìm kiếm/lọc trong danh mục sự kiện công khai |
| **Tiền điều kiện** | Không có (áp dụng cả với khách vãng lai chưa đăng nhập) |
| **Luồng chính** | 1. Khách nhập từ khóa và/hoặc chọn bộ lọc (danh mục, địa điểm, khoảng thời gian, khoảng giá)<br>2. Hệ thống truy vấn Event Service và trả về các sự kiện đã công khai khớp điều kiện, có phân trang<br>3. Khách có thể sắp xếp (theo thời gian, giá, độ phổ biến) và mở xem chi tiết sự kiện |
| **Luồng ngoại lệ** | - Không có kết quả khớp → hiển thị trạng thái rỗng kèm gợi ý nới rộng bộ lọc |
| **Hậu điều kiện** | Không có (chỉ đọc) |

### UC-07: Quản lý & áp dụng mã giảm giá

| Mục | Nội dung |
|---|---|
| **Actor chính** | Ban tổ chức (tạo/quản lý), Khách hàng (áp dụng) |
| **Mô tả** | Ban tổ chức tạo mã giảm giá cho sự kiện; khách hàng áp dụng mã lúc thanh toán |
| **Tiền điều kiện** | Ban tổ chức: sự kiện đã tồn tại và thuộc sở hữu của họ. Khách hàng: đang có đơn hàng/giữ chỗ còn hiệu lực |
| **Luồng chính** | 1. Ban tổ chức tạo mã (theo phần trăm hoặc số tiền cố định, giới hạn số lượng, thời hạn hiệu lực)<br>2. Khách hàng nhập mã lúc thanh toán → hệ thống xác thực mã (đúng sự kiện, còn hiệu lực, còn số lượng)<br>3. Hệ thống tính lại tổng tiền đơn hàng và hiển thị mức giảm đã áp dụng |
| **Luồng ngoại lệ** | - Mã hết hạn/hết số lượng/không hợp lệ cho sự kiện này → từ chối kèm lý do cụ thể<br>- Mã đã được dùng cho đơn hàng này → từ chối |
| **Hậu điều kiện** | Tổng tiền đơn hàng phản ánh mức giảm; bộ đếm số lượng đã dùng của mã tăng lên khi đơn hàng được thanh toán |

### UC-08: Duyệt & kiểm duyệt sự kiện (Admin)

| Mục | Nội dung |
|---|---|
| **Actor chính** | Admin |
| **Actor phụ** | Ban tổ chức (nhận kết quả) |
| **Mô tả** | Admin xem xét các sự kiện được gửi để duyệt rồi công khai hoặc từ chối |
| **Tiền điều kiện** | Có ít nhất 1 sự kiện ở trạng thái "Chờ duyệt" |
| **Luồng chính** | 1. Admin mở hàng đợi kiểm duyệt, sắp xếp theo thời gian gửi<br>2. Admin xem xét nội dung sự kiện (thông tin, hình ảnh, giá vé, sơ đồ ghế)<br>3. Admin duyệt → sự kiện chuyển thành "Đã công khai", hoặc từ chối kèm lý do → sự kiện trả về Ban tổ chức ở trạng thái "Bị từ chối" |
| **Luồng ngoại lệ** | - Ban tổ chức chỉnh sửa và gửi lại sự kiện bị từ chối → sự kiện quay lại hàng đợi ở trạng thái "Chờ duyệt" |
| **Hậu điều kiện** | Trạng thái sự kiện được cập nhật; Ban tổ chức được thông báo kết quả |

### UC-09: Quản lý người dùng (Admin)

| Mục | Nội dung |
|---|---|
| **Actor chính** | Admin |
| **Mô tả** | Admin quản lý tài khoản người dùng: khóa/mở tài khoản, phân quyền |
| **Tiền điều kiện** | Admin đã đăng nhập |
| **Luồng chính** | 1. Admin tìm kiếm/lọc danh sách người dùng<br>2. Admin khóa một tài khoản (ví dụ do gian lận/lạm dụng) hoặc mở lại một tài khoản đã bị khóa trước đó<br>3. Admin có thể duyệt đơn đăng ký làm Ban tổ chức hoặc đổi vai trò khi phù hợp |
| **Luồng ngoại lệ** | - Admin cố khóa chính tài khoản của mình → hệ thống chặn |
| **Hậu điều kiện** | Trạng thái khóa/vai trò của người dùng được cập nhật; người dùng bị khóa bị từ chối đăng nhập ngay lập tức |

### UC-10: Xem báo cáo doanh thu

| Mục | Nội dung |
|---|---|
| **Actor chính** | Ban tổ chức (sự kiện của mình), Admin (toàn hệ thống) |
| **Mô tả** | Xem thống kê doanh số/doanh thu trong khoảng thời gian đã chọn |
| **Tiền điều kiện** | Người dùng đã đăng nhập với vai trò tương ứng |
| **Luồng chính** | 1. Người dùng chọn khoảng thời gian và, với Admin, thêm bộ lọc tùy chọn (ban tổ chức, danh mục)<br>2. Hệ thống tổng hợp các đơn hàng/thanh toán/hoa hồng đã thanh toán trong khoảng đó<br>3. Dashboard hiển thị tổng số, xu hướng, và phân tích theo sự kiện/loại vé |
| **Luồng ngoại lệ** | - Không có dữ liệu trong khoảng đã chọn → hiển thị trạng thái rỗng |
| **Hậu điều kiện** | Không có (chỉ đọc) |

### UC-11: Đánh giá sự kiện sau khi tham dự

| Mục | Nội dung |
|---|---|
| **Actor chính** | Khách hàng |
| **Mô tả** | Khách hàng để lại đánh giá/nhận xét cho sự kiện đã tham dự |
| **Tiền điều kiện** | Khách hàng có vé ở trạng thái "Đã sử dụng" cho sự kiện đó |
| **Luồng chính** | 1. Khách mở một đơn hàng/sự kiện đã qua → chọn "Đánh giá sự kiện này"<br>2. Nhập số sao đánh giá và bình luận tùy chọn<br>3. Hệ thống lưu đánh giá, hiển thị trên trang công khai của sự kiện |
| **Luồng ngoại lệ** | - Vé chưa ở trạng thái "Đã sử dụng" (khách chưa check-in) → không có tùy chọn đánh giá<br>- Khách đã đánh giá sự kiện này rồi → chỉnh sửa thay vì tạo trùng |
| **Hậu điều kiện** | Đánh giá được lưu và hiển thị công khai, được tính vào điểm đánh giá trung bình của sự kiện |

---

*Tài liệu liên quan: 01-business-analysis.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md*
