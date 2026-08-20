================================================================================
BÁO CÁO PHÂN TÍCH LỰA CHỌN PHƯƠNG ÁN PHÁT TRIỂN PHẦN MỀM QUẢN LÝ THIẾT BỊ IT
(Tự xây dựng / Custom Code vs. Mã nguồn mở / Open-source)
================================================================================
TỔNG QUAN ĐÁNH GIÁ
--------------------------------------------------------------------------------
- TỰ CODE: 
    * Khả năng tích hợp vào Workspace.
    * Hệ thống chỉ chứa các chức năng thực sự cần thiết, đảm bảo tính bảo mật và khả năng mở rộng linh hoạt.

- SỬ DỤNG MÃ NGUỒN MỞ:
    * Chứa nhiều tính năng dư thừa không sử dụng, khó bảo trì và tùy biến.

- KẾT LUẬN: chọn phương án tự code.


====================================================================
LIỆT KÊ TÍNH NĂNG CẦN CÓ CỦA PHẦN MỀM QUẢN LÝ THIẾT BỊ IT
====================================================================

PHẦN 1: TÍNH NĂNG DÙNG CHUNG & QUẢN LÝ TỔNG THỂ 
(Áp dụng cho quy trình chung và mọi loại tài sản)

1. Quản lý Định danh & Nhãn mác:
   - Tự động sinh Mã tài sản (Asset Tag) theo quy tắc nội bộ (VD: IT-PC-001).
   - Tạo và hỗ trợ in mã QR Code / Barcode định danh duy nhất để dán lên thiết bị.

2. Quản lý Vòng đời & Tích hợp Kho:
   - Theo dõi trạng thái tài sản: Mới mua -> Trong kho -> Đang sử dụng -> Chờ sửa chữa -> Mất/Hỏng -> Thanh lý.
   - Đồng bộ trạng thái kho: Trạng thái "Trong kho" và "Mới mua" sẽ được lấy dữ liệu (Sync) qua API từ Phần mềm Quản lý Kho hiện tại của công ty, ITAM không tự quản lý số lượng tồn vật lý.

3. Quản lý Cấp phát & Bàn giao:
   - Gán tài sản cho Cá nhân (User), Phòng ban (Department) hoặc Vị trí (Location).
   - Khi ITAM thực hiện lệnh "Cấp phát", hệ thống tự động gọi API đẩy lệnh "Xuất kho" sang Phần mềm Quản lý Kho.
   - Sinh biên bản bàn giao điện tử, lưu trữ lịch sử người dùng (ai đã giữ thiết bị, từ ngày nào đến ngày nào).

4. Luồng truy xuất theo Nhân viên:
   - Hồ sơ Tài sản Cá nhân: Khi tra cứu một nhân viên (theo Mã NV/Email), hiển thị một Dashboard toàn cảnh các tài sản đang liên kết với nhân sự đó.
     + Phần cứng: Danh sách PC, Laptop, Màn hình... đang giữ.
     + Phụ kiện: Vật tư ngoại vi đã cấp (Chuột, phím, balo...).
     + Phần mềm: Danh sách License và quyền truy cập hệ thống đã cấp.
   - Lịch sử cá nhân: Xem nhanh toàn bộ lịch sử nhận, trả, báo hỏng thiết bị của riêng nhân viên này.
   - Tác vụ nhanh (Onboarding/Offboarding): 
     + Nút "Thu hồi toàn bộ" khi nhân sự nghỉ việc (tự động chuyển phần cứng về trạng thái "Trả kho" và báo API sang phần mềm Kho, giải phóng License, tạo biên bản).
     + Nút "Cấp phát thêm" để gán thiết bị mới nhanh chóng.

5. Quản lý Tài chính & Bảo hành:
   - Lưu trữ thông tin: Nhà cung cấp (Vendor), Hóa đơn (đính kèm file).
   - Giá trị tài sản (Nguyên giá, Khấu hao) sẽ lấy từ phần mềm Kho/Kế toán, ITAM chỉ dùng để xem.
   - Quản lý số tháng bảo hành, ngày hết hạn và tính năng cảnh báo khi sắp hết bảo hành.

6. Ghi log (Audit Trail):
   - Lưu vết toàn bộ thay đổi dữ liệu: Ai tạo, ai sửa, thời gian chuyển đổi trạng thái.

--------------------------------------------------------------------

PHẦN 2: TÍNH NĂNG CHUYÊN BIỆT THEO TỪNG NHÓM TÀI SẢN

1. Nhóm Máy tính (PC, Laptop, Server, Workstation)
   - Cấu hình chi tiết: Hãng, Model, Serial Number (Service Tag), CPU, RAM, Ổ cứng, OS, MAC, IP.
   - Lịch sử phần cứng: Ghi nhận lịch sử nâng cấp/thay thế (VD: Nâng cấp RAM, thay SSD).
   - Kết nối: Link máy tính với màn hình tương ứng hoặc phần mềm đang cài đặt trên đó.

2. Nhóm Màn hình (Monitors / Projectors)
   - Thông số vật lý: Hãng, Model, Kích thước (inch), Độ phân giải, Mã Serial/EDID.
   - Vị trí kết nối: Đang cắm vào PC/Laptop nào hoặc gắn cố định tại phòng họp nào.

3. Nhóm Phần mềm & Bản quyền (Software / Licenses)
   - Thông tin License: Tên phần mềm, License Key, Tài khoản quản trị.
   - Phân loại: Vĩnh viễn (Perpetual), Trả phí định kỳ (Subscription), Miễn phí (Freeware).
   - Quản lý số lượng: Tổng số License đã mua so với Số lượng đang cấp phát.
   - Cảnh báo: Tự động nhắc nhở gia hạn trước 30/60 ngày.

4. Nhóm Máy in, Fax, Photocopy
   - Kết nối: IP tĩnh, MAC Address, Loại kết nối (Network/USB/Wi-Fi).
   - Vật tư tương thích: Danh sách loại mực (Toner), rulo tương thích (danh mục này đồng bộ từ phần mềm Kho).
   - Quyền sử dụng: Danh sách phòng ban/nhóm được quyền in.
   - Đồng hồ đếm (Tùy chọn): Quản lý số trang in hàng tháng.

5. Nhóm Thiết bị mạng (Routers, Switches, Firewalls, Access Points)
   - Vị trí vật lý: Tòa nhà -> Tầng -> Phòng Server -> Tủ Rack.
   - Thông số kỹ thuật: IP Management, MAC, Phiên bản Firmware.
   - Hợp đồng hỗ trợ: Thông tin gói bảo hành thiết bị mạng (VD: SmartNet).

6. Nhóm Phụ kiện & Vật tư tiêu hao (Chuột, Phím, Cáp, Mực in...)
   - Ghi nhận sử dụng: ITAM không quản lý số lượng tồn kho. ITAM chỉ lưu lịch sử vật tư đã được cấp phát cho ai (link vào hồ sơ nhân viên).
   - Request API: Khi IT cần cấp phát phụ kiện, thao tác trên ITAM sẽ tự động tạo một "Phiếu xuất kho tiêu hao" trên Phần mềm Quản lý Kho hiện tại.

7. Nhóm Thiết bị An ninh (Camera, Đầu ghi NVR/DVR)
   - Quản lý Đầu ghi (NVR/DVR): Hãng, Model, Serial, IP tĩnh, MAC Address, Số kênh (Channels), Tổng dung lượng ổ cứng (HDD) đang gắn.
   - Quản lý Camera: Loại (IP/Analog/PTZ), Hãng, Model, Serial, Độ phân giải, IP Address, MAC Address (nếu có).
   - Vị trí vật lý & Khu vực quan sát: Chi tiết vị trí lắp đặt (Tòa nhà -> Tầng -> Khu vực) và mô tả góc quay quan sát.
   - Sơ đồ kết nối: Liên kết Camera này đang được quản lý và lưu trữ dữ liệu bởi Đầu ghi NVR/DVR nào.
   - Thông tin mạng: Lưu trữ NAT Port hoặc đường dẫn truy cập web quản lý nội bộ.

--------------------------------------------------------------------

PHẦN 3: TÍNH NĂNG TỰ ĐỘNG HÓA & TÍCH HỢP HỆ THỐNG (Khuyên dùng)

1. Tích hợp liên thông (API Integration):
   - Kết nối hai chiều với Phần mềm Quản lý Kho: Đồng bộ danh mục thiết bị nhập kho, đẩy lệnh xuất kho, trả kho và nhận dữ liệu nguyên giá tài sản.
   - Self-Service Portal (Tích hợp Workspace): Cổng thông tin cho nhân viên tự xem danh sách thiết bị đang giữ và Báo hỏng (Submit Ticket) ngay trên Workspace chung.

2. Kiểm kê bằng Camera (Web-App):
   - Giao diện quét QR/Barcode trên điện thoại.
   - Hỗ trợ đối chiếu (Reconciliation) dữ liệu thực tế với dữ liệu trên Phần mềm Kho thông qua ITAM.

3. Data Collector Script (Tùy chọn nâng cao):
   - File script chạy ngầm trên máy Client để tự động quét cấu hình PC (CPU, RAM, MAC, Serial) và đẩy dữ liệu về API của ITAM.