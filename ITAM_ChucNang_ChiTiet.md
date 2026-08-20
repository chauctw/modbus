# MÔ TẢ CHI TIẾT CHỨC NĂNG PHẦN MỀM QUẢN LÝ THIẾT BỊ IT (ITAM)

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Mục tiêu
- Quản lý toàn bộ vòng đời tài sản CNTT từ mua, phân bổ, sử dụng, bảo trì đến thanh lý.
- Tích hợp liên thông với Workspace.
- Tự động hóa các quy trình hành chính, giảm thiểu thao tác thủ công.

### 1.2 Phạm vi
- Quản lý 7 nhóm tài sản: Máy tính, Màn hình, Phần mềm/License, Máy in/Photocopy, Thiết bị mạng, Phụ kiện/Vật tư tiêu hao, Thiết bị An ninh.
- Tích hợp API hai chiều với hệ thống Kho hiện tại.
- Cổng thông tin Self-Service trên Workspace.

### 1.3 Các vai trò người dùng
- **Admin**: Quản trị hệ thống, quản lý phân quyền, cấu hình tích hợp API.
- **IT Staff**: Quản lý tài sản, cấp phát, thu hồi, kiểm kê, xử lý yêu cầu.
- **Manager**: Phê duyệt cấp phát, xem báo cáo tài sản của phòng ban.
- **Employee**: Xem tài sản cá nhân, yêu cầu báo hỏng, theo dõi lịch sử.
- **Auditor**: Xem Audit Trail, xuất báo cáo tuân thủ.

---

## 2. MODULE QUẢN LÝ TÀI SẢN CƠ BẢN

### 2.1 Module Quản lý Định danh & Nhãn mác

#### Chức năng:
- **Sinh mã tài sản tự động**: 
  - Quy tắc mã hóa có thể cấu hình (VD: IT-PC-2024-001).
  - Tự động tăng dần theo năm/tháng.
  - Hỗ trợ nhiều tiền tố theo loại tài sản (PC, LT, MN, SV, PR, IP, NK, CC, NV, SW).
- **Tạo mã QR/Barcode**:
  - Tích hợp thư viện tạo mã QR/Barcode.
  - In nhãn định dạng A6, A7 hoặc custom size.
  - Hỗ trợ in hàng loạt theo danh sách tài sản.
  - Mã QR chứa thông tin: Asset Tag, Serial Number, URL truy cập chi tiết trên ITAM.
- **Quản lý tình trạng nhãn**:
  - Theo dõi lần in cuối, số lần in lại.
  - Trạng thái nhãn: Mới, Đã in, Hư hỏng, Cần in lại.

### 2.2 Module Quản lý Vòng đời & Tích hợp Kho

#### Trạng thái tài sản:
- Mới mua (New)
- Trong kho (In Stock)
- Đang sử dụng (In Use)
- Chờ sửa chữa (Under Repair)
- Mất/Hỏng (Lost/Damaged)
- Thanh lý (Disposed)
- Đang kiểm kê (Auditing)

#### Tích hợp Kho:
- **Đồng bộ danh mục**: Lấy danh sách thiết bị nhập kho qua API (Theo dõi: Mã phiếu nhập, Ngày nhập, Số lượng).
- **Đồng bộ nguyên giá**: Lấy thông tin Nguyên giá, Khấu hao từ Kho/Kế toán (Chỉ đọc, ITAM không cho phép sửa).
- **Lệnh Xuất kho tự động**: Khi ITAM thực hiện cấp phát → gọi API tạo phiếu xuất kho.
- **Lệnh Trả kho tự động**: Khi thu hồi → gọi API tạo phiếu trả kho.
- **Đồng bộ tồn kho**: ITAM chỉ theo dõi trạng thái "Trong kho" (In Stock), không quản lý số lượng vật lý.

### 2.3 Module Quản lý Cấp phát & Bàn giao

#### Quy trình cấp phát:
1. **Chọn tài sản** từ danh sách "Trong kho".
2. **Chọn đối tượng**:
   - Cá nhân (User): Theo Mã NV/Email.
   - Phòng ban (Department): Cấp cho phòng ban, ai dùng chung.
   - Vị trí (Location): Cấp cho phòng họp, vị trí cố định.
3. **Xác nhận** → Tự động gọi API Xuất kho.
4. **Sinh biên bản bàn giao điện tử**:
   - Mẫu biên bản có thể tùy biến theo công ty.
   - Chữ ký điện tử (nếu có).
   - Lưu PDF, gửi email tự động cho người nhận và IT.
5. **Cập nhật trạng thái** tài sản thành "Đang sử dụng".

#### Lịch sử sở hữu:
- Theo dõi toàn bộ chuỗi bàn giao: Ai đã giữ, từ ngày nào đến ngày nào, biên bản nào.
- Lọc theo tài sản hoặc theo người dùng.

### 2.4 Module Luồng truy xuất theo Nhân viên

#### Dashboard nhân viên:
- **Phần cứng**: Danh sách PC, Laptop, Màn hình, Phụ kiện đang giữ.
- **Phần mềm**: License và quyền truy cập đã cấp.
- **Tổng giá trị**: Tổng nguyên giá tài sản đang sử dụng (đồng bộ từ Kho).

#### Lịch sử cá nhân:
- Dòng thời gian: Nhận → Trả → Báo hỏng → Cấp phát thêm.
- Hiển thị chi tiết từng lần giao dịch.

#### Tác vụ nhanh:
- **Thu hồi toàn bộ (Offboarding)**:
  - Tìm nhân viên theo Mã NV/Email.
  - Chọn "Thu hồi toàn bộ" → Hệ thống tự động:
    - Chuyển tất cả tài sản về trạng thái "Trả kho".
    - Tạo biên bản thu hồi điện tử.
    - Gọi API trả kho cho từng thiết bị.
    - Giải phóng các License phần mềm (chuyển về trạng thái Available).
    - Gửi thông báo cho IT và người quản lý.
- **Cấp phát thêm**: Mở form cấp phát nhanh, điền Mã NV, chọn thiết bị, xác nhận.

### 2.5 Module Quản lý Tài chính & Bảo hành

#### Thông tin tài chính (Chỉ đọc từ Kho):
- Nhà cung cấp (Vendor).
- Hóa đơn (Đính kèm file PDF/Image).
- Nguyên giá, Khấu hao, Số tháng đã khấu hao.
- Ngày mua.

#### Quản lý bảo hành:
- Nhập thông tin: Số tháng bảo hành, Ngày bắt đầu, Ngày hết hạn.
- Cảnh báo tự động:
  - Trước 30 ngày hết hạn: Thông báo nhắc nhở IT.
  - Trước 60 ngày: Thông báo cho quản lý có kế hoạch thay thế.
- Lịch sử sửa chữa/bảo dưỡng (nếu có).

### 2.6 Module Ghi log (Audit Trail)

#### Thông tin ghi log:
- Ai tạo/sửa/xóa.
- Thời gian thực hiện.
- Trường dữ liệu thay đổi (Old Value → New Value).
- IP Address thực hiện thao tác.
- User Agent.

#### Các sự kiện được ghi log:
- Tạo mới tài sản.
- Cập nhật thông tin tài sản.
- Chuyển trạng thái.
- Cấp phát/Thu hồi.
- Đính kèm/xóa file.
- Thay đổi phân quyền.

---

## 3. MODULE QUẢN LÝ THEO NHÓM TÀI SẢN CHUYÊN BIỆT

### 3.1 Nhóm Máy tính (PC, Laptop, Server, Workstation)

#### Thông tin cấu hình:
- Hãng, Model, Serial Number (Service Tag).
- CPU (Model, Số nhân, Tần số).
- RAM (Dung lượng, Loại DDR).
- Ổ cứng (Loại SSD/HDD, Dung lượng).
- OS (Hệ điều hành, Phiên bản, License Key).
- MAC Address (Card mạng chính, card phụ).
- IP Address (Cố định/DHCP).
- Tên máy (Hostname) trong Domain.

#### Lịch sử phần cứng:
- Ghi nhận các lần nâng cấp/thay thế:
  - Ngày thực hiện.
  - Linh kiện cũ → Linh kiện mới.
  - Lý do thay thế.
  - Người thực hiện.

#### Liên kết:
- Liên kết với màn hình đang sử dụng.
- Liên kết với danh sách phần mềm đã cài đặt (Software List).

#### Đặc biệt Server:
- Thông tin Vị trí vật lý: Tòa nhà → Tầng → Phòng Server → Tủ Rack → Số U.
- Thông số mạng: IP Management, VLAN, Subnet Mask, Gateway.
- Hợp đồng hỗ trợ: SmartNet, Warranty.

### 3.2 Nhóm Màn hình (Monitors / Projectors)

#### Thông số vật lý:
- Hãng, Model, Kích thước (inch).
- Độ phân giải (1920x1080, 4K...).
- Mã Serial, EDID (nếu có).
- Loại kết nối: HDMI, DisplayPort, VGA, USB-C.

#### Vị trí kết nối:
- Đang cắm vào PC/Laptop nào (Link).
- Gắn cố định tại phòng họp nào (Location).
- Trạng thái: Đang sử dụng, Trong kho, Hỏng.

### 3.3 Nhóm Phần mềm & Bản quyền (Software / Licenses)

#### Thông tin License:
- Tên phần mềm, Phiên bản.
- License Key / Activation Code.
- Tài khoản quản trị (nếu có).
- Loại License:
  - Perpetual (Vĩnh viễn).
  - Subscription (Trả phí định kỳ): Ngày bắt đầu, Ngày hết hạn.
  - Freeware (Miễn phí).
- Nhà cung cấp, Website.

#### Quản lý số lượng:
- Tổng số License đã mua (Total Purchased).
- Số lượng đang cấp phát (Allocated).
- Số lượng còn trống (Available) = Total - Allocated.
- Cảnh báo khi Available < 0 (mượn License).

#### Cảnh báo gia hạn:
- Tự động nhắc nhở:
  - Trước 60 ngày hết hạn: Thông báo cho IT Manager.
  - Trước 30 ngày hết hạn: Thông báo cho IT Staff.
- Lịch sử gia hạn: Ghi nhận lần gia hạn trước, số tháng, giá trị.

#### Liên kết:
- Liên kết với người dùng/thiết bị đang sử dụng License.
- Hỗ trợ cấp phát theo nhóm (Group License).

### 3.4 Nhóm Máy in, Fax, Photocopy

#### Thông tin kết nối:
- IP tĩnh, MAC Address.
- Loại kết nối: Network, USB, Wi-Fi.
- Driver in đang sử dụng.

#### Vật tư tương thích:
- Danh sách loại mực (Toner), rulo tương thích.
- Đồng bộ từ phần mềm Kho (Read-only).
- Cảnh báo khi tồn kho mực thấp (nếu Kho hỗ trợ).

#### Quyền sử dụng:
- Danh sách phòng ban/nhóm được quyền in.
- Quota in (Tùy chọn): Số trang/tháng.

#### Đồng hồ đếm (Tùy chọn):
- Tích hợp giả lập hoặc thực tế số trang in hàng tháng.
- Cảnh báo khi vượt quota.

### 3.5 Nhóm Thiết bị mạng (Routers, Switches, Firewalls, Access Points)

#### Vị trí vật lý:
- Cấu trúc phân cấp: Tòa nhà → Tầng → Phòng Server → Tủ Rack → Số U.

#### Thông số kỹ thuật:
- IP Management, MAC Address.
- Phiên bản Firmware, Ngày cập nhật.
- Ports: Số cổng, Loại cổng (1G, 10G, SFP+).

#### Hợp đồng hỗ trợ:
- Thông tin gói bảo hành: SmartNet, nhà cung cấp.
- Ngày bắt đầu, Ngày hết hạn.
- Cảnh báo hết hạn bảo hành.

#### Cấu hình (Tùy chọn):
- Backup cấu hình file (running-config, startup-config).
- Lịch sử thay đổi cấu hình (nếu có tích hợp).

### 3.6 Nhóm Phụ kiện & Vật tư tiêu hao

#### Quản lý lịch sử cấp phát:
- ITAM không quản lý tồn kho vật lý.
- Chỉ lưu lịch sử: Đã cấp phụ kiện gì, cho ai, khi nào.
- Liên kết vào hồ sơ nhân viên.

#### Tích hợp Kho:
- Khi IT cần cấp phát phụ kiện trên ITAM → Tự động tạo "Phiếu xuất kho tiêu hao" trên Kho.
- Đồng bộ danh mục phụ kiện từ Kho (Dropdown chọn sản phẩm).

#### Loại phụ kiện:
- Chuột, Bàn phím, Tai nghe, Bàn di chuột.
- Cáp kết nối (HDMI, USB-C, DisplayPort).
- Balo, Túi đựng laptop.
- Dock, Hub USB.

### 3.7 Nhóm Thiết bị An ninh (Camera, NVR/DVR)

#### Quản lý Đầu ghi (NVR/DVR):
- Hãng, Model, Serial.
- IP tĩnh, MAC Address.
- Số kênh (Channels) hỗ trợ.
- Tổng dung lượng ổ cứng (HDD) đang gắn: Tổng GB, Số lượng ổ.
- Hệ điều hành, Firmware Version.

#### Quản lý Camera:
- Loại: IP, Analog, PTZ (Pan-Tilt-Zoom).
- Hãng, Model, Serial.
- Độ phân giải (1080p, 4K...).
- IP Address, MAC Address (nếu có).
- Loại kết nối: PoE, WiFi.

#### Vị trí vật lý & Khu vực quan sát:
- Vị trí lắp đặt chi tiết: Tòa nhà → Tầng → Khu vực → Góc quan sát.
- Mô tả góc quay: Phía trước cửa, Hành lang, Bãi gửi xe...
- Trạng thái hoạt động: Đang hoạt động, Bảo trì, Hỏng.

#### Sơ đồ kết nối:
- Liên kết Camera ↔ NVR/DVR quản lý.
- Hiển thị cấu trúc: NVR có bao nhiêu camera, camera nào kênh nào.

#### Thông tin mạng:
- NAT Port (nếu truy cập từ ngoài).
- Đường dẫn truy cập web quản lý nội bộ.
- Tài khoản quản trị mặc định (Lưu trữ an toàn, có mã hóa).

---

## 4. MODULE TỰ ĐỘNG HÓA & TÍCH HỢP HỆ THỐNG

### 4.1 Tích hợp liên thông (API Integration)

#### Kết nối với Phần mềm Quản lý Kho:
- **API Đồng bộ danh mục**:
  - GET /api/assets: Lấy danh sách tài sản nhập kho.
  - GET /api/asset/{id}: Chi tiết tài sản trong kho.
- **API Lệnh Xuất kho**:
  - POST /api/export: Tạo phiếu xuất kho khi ITAM cấp phát.
  - Payload: Asset ID, Mã NV/Nhận, Ngày xuất, Người thực hiện.
- **API Lệnh Trả kho**:
  - POST /api/return: Tạo phiếu trả kho khi ITAM thu hồi.
- **API Đồng bộ tài chính**:
  - GET /api/finance/{asset-id}: Lấy nguyên giá, khấu hao (Read-only).
- **Xử lý lỗi**: 
  - Retry mechanism (tối đa 3 lần).
  - Log lỗi chi tiết để người dùng xử lý thủ công.
  - Cảnh báo IT Staff khi tích hợp thất bại.

#### Tích hợp Workspace (Self-Service Portal):
- **Single Sign-On (SSO)**:
  - Tích hợp SSO của công ty (LDAP, SAML, OAuth2).
  - Đồng bộ thông tin nhân viên từ Workspace.
- **Widget/Tab trên Workspace**:
  - Xem danh sách tài sản đang giữ.
  - Báo hỏng thiết bị (Submit Ticket).
  - Xem lịch sử sử dụng.
- **Thông báo**:
  - Push notification trên Workspace khi có tài sản mới cấp.
  - Nhắc nhở trả thiết bị khi sắp hết hạn sử dụng (nếu có).
  - Thông báo License sắp hết hạn.

### 4.2 Module Kiểm kê bằng Camera (Web-App)

#### Giao diện quét trên điện thoại:
- **Responsive Web App**:
  - Mở trên trình duyệt điện thoại (không cần cài app).
  - Quét mã QR/Barcode bằng camera.
- **Chức năng quét**:
  - Tìm tài sản theo mã QR.
  - Hiển thị thông tin chi tiết.
- **Đối chiếu (Reconciliation)**:
  - Xác nhận tình trạng thực tế: Còn nguyên, Hỏng, Mất.
  - Ghi nhận vị trí thực tế.
  - So sánh với dữ liệu trên ITAM/Kho.
- **Kiểm kê hàng loạt**:
  - Import danh sách tài sản cần kiểm kê (Excel/CSV).
  - Quét từng thiết bị, đánh dấu đã kiểm kê.
  - Xuất báo cáo kiểm kê: Chênh lệch, Thiếu, Thừa.

### 4.3 Module Data Collector Script (Tùy chọn nâng cao)

#### Chức năng:
- Script chạy ngầm trên máy Client (Windows/Linux).
- Tự động quét cấu hình phần cứng:
  - CPU, RAM, Ổ cứng, Card mạng (MAC).
  - Serial Number (BIOS, CPU, Ổ cứng).
  - OS, Phiên bản, Activation Status.
  - Phần mềm đã cài đặt (Tên, Phiên bản).
- Đẩy dữ liệu về API của ITAM.

#### Cách hoạt động:
- Chạy như Service/Background process.
- Định kỳ chạy (Hàng ngày, hàng tuần).
- Gửi dữ liệu qua HTTPS với xác thực (API Key hoặc JWT).
- ITAM nhận dữ liệu → Tự động cập nhật thông tin thiết bị.

---

## 5. MODULE BÁO CÁO & PHÂN TÍCH

### 5.1 Báo cáo Tài sản:
- Tổng quan tài sản theo loại, trạng thái, phòng ban.
- Tỷ lệ sử dụng tài sản (Đang sử dụng / Trong kho / Đang sửa chữa).
- Lịch sử nhập/xuất theo thời gian.

### 5.2 Báo cáo Tài chính:
- Tổng giá trị tài sản hiện tại (đồng bộ từ Kho).
- Khấu hao theo năm.
- Chi phí mua sắm theo quý/năm.

### 5.3 Báo cáo Bảo hành:
- Danh sách tài sản sắp hết bảo hành (30/60 ngày).
- Lịch sử sửa chữa, bảo dưỡng.

### 5.4 Báo cáo Phần mềm/License:
- Tỷ lệ sử dụng License (Allocated / Total).
- License sắp hết hạn.
- License chưa được gán (Available).

### 5.5 Báo cáo Kiểm kê:
- Kết quả kiểm kê: Đúng, Thiếu, Thừa, Hỏng.
- Chênh lệch so với dữ liệu Kho.

### 5.6 Báo cáo Audit Trail:
- Toàn bộ lịch sử thay đổi dữ liệu.
- Lọc theo người dùng, thời gian, loại tài sản, sự kiện.

---

## 6. MODULE HỆ THỐNG & BẢO MẬT

### 6.1 Quản lý Người dùng & Phân quyền (RBAC):
- **Quyền mặc định theo Role**:
  - Admin: Toàn quyền.
  - IT Staff: Thêm/Sửa/Xóa tài sản, Cấp phát/Thu hồi, Kiểm kê.
  - Manager: Xem báo cáo phòng ban, Phê duyệt.
  - Employee: Xem tài sản cá nhân, Submit Ticket.
  - Auditor: Xem Audit Trail, Xuất báo cáo.
- **Phân quyền chi tiết**:
  - Phân quyền theo Module (Asset, License, Report...).
  - Phân quyền theo Phòng ban (Chỉ xem tài sản của phòng mình).
  - Phân quyền theo Nhóm tài sản (Chỉ quản lý máy tính, không quản lý mạng...).

### 6.2 Bảo mật:
- **Xác thực**:
  - SSO tích hợp với Active Directory/LDAP.
  - MFA (Multi-Factor Authentication) cho vai trò Admin/IT Staff.
- **Mã hóa**:
  - Mã hóa dữ liệu nhạy cảm (License Key, Serial Number) trong database.
  - HTTPS cho tất cả API communication.
- **Audit Trail**:
  - Ghi log toàn bộ hoạt động, không thể xóa/sửa log.
- **Sao lưu (Backup)**:
  - Backup database hàng ngày.
  - Lưu trữ biên bản, file đính kèm trên Storage riêng.

### 6.3 Cấu hình hệ thống:
- **Cài đặt API Integration**:
  - URL endpoint của hệ thống Kho.
  - API Key/Token xác thực.
  - Thời gian đồng bộ (Cron job).
- **Cài đặt quy tắc mã tài sản**:
  - Định dạng mã (Prefix, separator, số thứ tự).
  - Độ dài mã.
- **Cài đặt Email**:
  - SMTP server để gửi thông báo, biên bản.
- **Cài đặt mẫu biên bản**:
  - Template cho Biên bản bàn giao, Biên bản thu hồi.
  - Hỗ trợ chữ ký điện tử.

---

## 7. WORKFLOW CHÍNH

### 7.1 Workflow Cấp phát tài sản:
```
1. IT Staff chọn tài sản từ danh sách "Trong kho".
2. Chọn đối tượng: User/Department/Location.
3. Hệ thống kiểm tra:
   - Tài sản có đang "Trong kho" không?
   - Người dùng/Phòng ban có tồn tại không?
4. Xác nhận cấp phát:
   - Cập nhật trạng thái tài sản → "Đang sử dụng".
   - Tạo lịch sử bàn giao.
   - Gọi API Xuất kho (Kho).
5. Sinh biên bản bàn giao điện tử (PDF).
6. Gửi email thông báo cho IT và Người nhận.
7. Cập nhật Dashboard nhân viên.
```

### 7.2 Workflow Thu hồi (Offboarding):
```
1. Tìm nhân viên theo Mã NV/Email.
2. Chọn "Thu hồi toàn bộ" hoặc chọn từng tài sản.
3. Hệ thống liệt kê tất cả tài sản đang giữ:
   - Phần cứng (PC, Laptop, Màn hình, Phụ kiện...).
   - License phần mềm đã cấp.
4. Xác nhận thu hồi:
   - Tất cả tài sản → "Trả kho".
   - Tất cả License → "Available".
   - Tạo biên bản thu hồi.
   - Gọi API Trả kho cho từng tài sản (Kho).
5. Gửi thông báo cho IT, Manager, và nhân viên (nếu cần).
6. Cập nhật Dashboard nhân viên (trống).
```

### 7.3 Workflow Báo hỏng:
```
1. Nhân viên gửi yêu cầu báo hỏng qua Workspace (Self-Service).
2. IT Staff nhận thông báo.
3. Kiểm tra tình trạng thực tế.
4. Cập nhật trạng thái tài sản → "Chờ sửa chữa" hoặc "Mất/Hỏng".
5. Nếu sửa chữa: Tạo yêu cầu sửa chữa, theo dõi tiến độ.
   Nếu hỏng/mất: Báo cáo quản lý, xử lý theo quy định (bồi thường, thanh lý).
6. Ghi log đầy đủ.
```

### 7.4 Workflow Kiểm kê:
```
1. Tạo đợt kiểm kê: Phạm vi (Phòng ban, Khu vực, Tòa nhà), Thời gian.
2. Import danh sách tài sản cần kiểm kê (từ Kho hoặc ITAM).
3. IT Staff dùng Mobile Web App quét QR từng tài sản.
4. Xác nhận tình trạng thực tế: Đúng, Thiếu, Thừa, Hỏng.
5. Hệ thống đối chiếu với dữ liệu Kho.
6. Xuất báo cáo kiểm kê.
7. Xử lý chênh lệch: Điều chỉnh trạng thái, tạo biên bản.
```

---

## 8. KẾ HOẠCH TRIỂN KHAI (PHA)

### Phase 1: Core Asset Management (3-4 tháng)
- Quản lý tài sản cơ bản (CRUD).
- Quản lý vòng đời tài sản.
- Cấu hình mã QR/Barcode.
- Cấp phát & Thu hồi cơ bản.
- Tích hợp API Kho (Đồng bộ danh mục, Xuất kho, Trả kho).
- Quản lý Nhân viên, Phòng ban, Vị trí.
- Audit Trail cơ bản.
- Phân quyền RBAC.

### Phase 2: Specialized Assets (2-3 tháng)
- Quản lý nhóm Máy tính (cấu hình chi tiết, lịch sử nâng cấp).
- Quản lý nhóm Màn hình & Projector.
- Quản lý nhóm Phần mềm & License (cảnh báo gia hạn).
- Quản lý nhóm Máy in/Photocopy.
- Quản lý nhóm Thiết bị mạng (Rack, IP, Firmware).
- Quản lý nhóm Phụ kiện & Vật tư tiêu hao.
- Quản lý nhóm Thiết bị An ninh (Camera, NVR/DVR).

### Phase 3: Automation & Advanced Features (2-3 tháng)
- Tích hợp Workspace (Self-Service Portal, SSO).
- Module Kiểm kê bằng Camera (Web-App).
- Data Collector Script (nếu cần).
- Báo cáo nâng cao (Dashboard, Charts, phân tích xu hướng).
- Cảnh báo tự động (Email, Notification).
- Quản lý Bảo hành & Bảo trì.
- Tùy biến mẫu biên bản, Email template.

### Phase 4: Tối ưu & Mở rộng (1-2 tháng)
- Tối ưu hiệu năng (caching, indexing).
- Tối ưu trải nghiệm người dùng (UX).
- Báo cáo tùy chỉnh (Custom Report Builder).
- Tích hợp thêm (Ticketing, HR System, Accounting).
- Mobile App native (nếu cần).

---

## 9. KỸ THUẬT & CÔNG NGHỆ ĐỀ XUẤT

### 9.1 Kiến trúc:
- **Backend**: RESTful API + WebSocket (cho thông báo real-time).
- **Frontend**: Web App (Admin Portal) + Mobile Web App (Kiểm kê).
- **Database**: PostgreSQL (chính) + Redis (cache).
- **Storage**: Local/Cloud Storage cho file đính kèm (biên bản, hóa đơn, hình ảnh).

### 9.2 Công nghệ đề xuất:
- **Backend**: Node.js (NestJS) hoặc Python (Django/FastAPI) hoặc .NET Core.
- **Frontend**: React/Vue.js + TypeScript.
- **Mobile Web**: React Native Web hoặc PWA.
- **QR/Barcode**: ZXing, QRCode.js.
- **PDF Generation**: Puppeteer, PDFKit, hoặc iText.
- **Task Queue**: BullMQ/Celery cho xử lý bất đồng bộ (Gửi email, gọi API).
- **Authentication**: JWT + SSO (SAML2/LDAP).

### 9.3 Tiêu chí thành công:
- Thời gian phản hồi API < 500ms.
- Uptime 99.5%.
- Hỗ trợ 500+ người dùng đồng thời.
- Backup tự động hàng ngày, RPO < 24h, RTO < 4h.
