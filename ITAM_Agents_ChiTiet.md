# MÔ TẢ CHI TIẾT AGENT HỆ THỐNG QUẢN LÝ THIẾT BỊ IT (ITAM)

## 1. TỔNG QUAN KIẾN TRÚC AGENT

### 1.1 Nguyên lý hoạt động
- Hệ thống được chia thành các Agent đảm nhận chức năng chuyên biệt.
- Mỗi Agent hoạt động độc lập, giao tiếp qua Message Queue hoặc API Gateway.
- Agent có khả năng tự phục hồi, scale ngang, và ghi log chi tiết.

### 1.2 Các Agent chính
| Agent | Mô tả | Chức năng chính |
|-------|-------|----------------|
| API Gateway | Điểm vào hệ thống | Định tuyến, xác thực, rate limiting |
| Auth Agent | Xác thực & Phân quyền | SSO, JWT, RBAC, MFA |
| Asset Agent | Quản lý tài sản | CRUD tài sản, trạng thái, định danh |
| Lifecycle Agent | Quản lý vòng đời | Cấp phát, thu hồi, chuyển trạng thái |
| Integration Agent | Tích hợp hệ thống | Đồng bộ Kho, ERP, HR, Workspace |
| Notification Agent | Thông báo | Email, SMS, Push notification |
| Audit Agent | Ghi log & Tuân thủ | Audit Trail, lưu log, báo cáo tuân thủ |
| Reporting Agent | Báo cáo & Phân tích | Tổng hợp dữ liệu, xuất báo cáo |
| Scheduler Agent | Tác vụ định kỳ | Cảnh báo, đồng bộ, chạy cron job |
| File Agent | Quản lý file | Lưu trữ biên bản, hóa đơn, hình ảnh |
| QR Agent | Quản lý mã định danh | Sinh mã QR/Barcode, in nhãn |
| Check Agent | Kiểm kê | Đối chiếu, kiểm kê hàng loạt |
| Collector Agent | Thu thập dữ liệu | Data Collector từ máy Client |
| Config Agent | Cấu hình hệ thống | Quản lý cài đặt, feature flag |

---

## 2. CHI TIẾT TỪNG AGENT

### 2.1 API Gateway Agent

#### Mô tả:
- Cổng vào duy nhất của hệ thống ITAM.
- Xử lý tất cả request từ Client (Web, Mobile, API Integration).

#### Chức năng:
- **Định tuyến (Routing)**: Phân phối request đến Agent phù hợp.
- **Xác thực (Authentication)**: Kiểm tra JWT Token, Session.
- **Phân quyền (Authorization)**: Kiểm tra quyền truy cập theo RBAC.
- **Rate Limiting**: Giới hạn request theo người dùng/IP.
- **Logging**: Ghi log request/response cho Audit.
- **Load Balancing**: Phân phối request đến các instance của Agent khác.

#### API Endpoints:
- `POST /api/v1/auth/login` - Đăng nhập
- `POST /api/v1/auth/logout` - Đăng xuất
- `POST /api/v1/auth/refresh` - Làm mới token
- `GET /api/v1/assets` - Lấy danh sách tài sản (qua Asset Agent)
- `POST /api/v1/assets/assign` - Cấp phát tài sản (qua Lifecycle Agent)

#### Cấu hình:
- Port: 8080 (HTTP), 8443 (HTTPS)
- Timeout: 30s
- Max Request Size: 10MB

---

### 2.2 Auth Agent

#### Mô tả:
- Quản lý xác thực và phân quyền người dùng.
- Hỗ trợ đăng nhập nội bộ và tích hợp SSO.

#### Chức năng:
- **Xác thực người dùng**:
  - Username/Password (nội bộ).
  - SSO (LDAP, Active Directory, SAML2, OAuth2).
  - MFA (TOTP, SMS, Email OTP).
- **Quản lý Token**:
  - Phát hành JWT Access Token (hết hạn 15 phút).
  - Phát hành Refresh Token (hết hạn 7 ngày).
  - Blacklist Token khi logout.
- **Phân quyền RBAC**:
  - Quyền mặc định: Admin, IT Staff, Manager, Employee, Auditor.
  - Phân quyền chi tiết theo Module, Phòng ban, Nhóm tài sản.
- **Quản lý phiên làm việc**:
  - Lưu lịch sử đăng nhập (IP, User Agent, Thời gian).
  - Đăng xuất tự động sau thời gian không hoạt động.

#### API Endpoints:
- `POST /auth/login` - Đăng nhập
- `POST /auth/logout` - Đăng xuất
- `POST /auth/refresh` - Làm mới token
- `POST /auth/mfa/verify` - Xác thực MFA
- `GET /auth/me` - Thông tin người dùng hiện tại
- `GET /auth/permissions` - Danh sách quyền của user

#### Lưu trữ:
- Session: Redis (TTL theo thời gian token).
- User Profile: PostgreSQL.

---

### 2.3 Asset Agent

#### Mô tả:
- Quản lý thông tin cơ bản của tất cả tài sản.
- Xử lý CRUD, tìm kiếm, lọc, và định danh tài sản.

#### Chức năng:
- **Quản lý tài sản**:
  - Tạo mới, cập nhật, xóa (soft delete) tài sản.
  - Tìm kiếm theo Asset Tag, Serial Number, Tên tài sản.
  - Lọc theo loại, trạng thái, phòng ban, vị trí.
- **Quản lý mã định danh**:
  - Sinh mã tài sản tự động theo quy tắc cấu hình.
  - Kiểm tra trùng mã.
  - Invalidate mã cũ khi tái cấp phát.
- **Quản lý nhóm tài sản**:
  - Phân loại: Máy tính, Màn hình, License, Máy in, Thiết bị mạng, Phụ kiện, Camera.
  - Mỗi nhóm có schema riêng (dynamic fields).
- **Quản lý vị trí**:
  - Phân cấp: Tòa nhà → Tầng → Phòng → Vị trí cụ thể.
- **Quản lý nhà cung cấp**:
  - Thông tin Vendor, liên hệ, hợp đồng.

#### API Endpoints:
- `GET /assets` - Danh sách tài sản (phân trang, lọc).
- `GET /assets/{id}` - Chi tiết tài sản.
- `POST /assets` - Tạo tài sản mới.
- `PUT /assets/{id}` - Cập nhật tài sản.
- `DELETE /assets/{id}` - Xóa tài sản (soft delete).
- `GET /assets/search?q={keyword}` - Tìm kiếm tài sản.
- `POST /assets/generate-tag` - Sinh mã tài sản mới.

#### Database:
- Table: `assets` (thông tin chung).
- Table: `asset_types` (phân loại nhóm).
- Table: `asset_fields` (định nghĩa trường động theo nhóm).
- Table: `asset_values` (giá trị trường động).
- Table: `locations` (vị trí vật lý).

---

### 2.4 Lifecycle Agent

#### Mô tả:
- Quản lý toàn bộ vòng đời tài sản: Từ mua, nhập kho, cấp phát, sử dụng, sửa chữa, thu hồi đến thanh lý.
- Điều phối các hoạt động giữa Asset Agent, Integration Agent, và Notification Agent.

#### Chức năng:
- **Quản lý trạng thái**:
  - Chuyển trạng thái: New → In Stock → In Use → Under Repair → Lost/Damaged → Disposed.
  - Kiểm tra điều kiện chuyển trạng thái (VD: Chỉ chuyển In Stock → In Use khi có lệnh cấp phát).
- **Cấp phát (Assign)**:
  - Xác thực tài sản đang "Trong kho".
  - Tạo lịch sử bàn giao.
  - Tạo biên bản bàn giao (PDF) qua File Agent.
  - Gọi Integration Agent để xuất kho.
  - Cập nhật Dashboard nhân viên.
  - Gửi thông báo qua Notification Agent.
- **Thu hồi (Return/Recall)**:
  - Tìm tất cả tài sản đang giữ của nhân viên.
  - Chuyển trạng thái về "Trả kho".
  - Tạo biên bản thu hồi.
  - Giải phóng License (gọi Integration Agent).
  - Gọi API trả kho (Integration Agent).
  - Gửi thông báo.
- **Báo hỏng (Report Issue)**:
  - Tạo yêu cầu báo hỏng.
  - Chuyển trạng thái → "Under Repair" hoặc "Lost/Damaged".
  - Tạo ticket cho IT Staff.
- **Thanh lý (Dispose)**:
  - Kiểm tra điều kiện thanh lý (hết bảo hành, hết khấu hao).
  - Tạo biên bản thanh lý.
  - Cập nhật trạng thái → "Disposed".

#### API Endpoints:
- `POST /lifecycle/assign` - Cấp phát tài sản.
- `POST /lifecycle/return` - Thu hồi tài sản.
- `POST /lifecycle/recall-all` - Thu hồi toàn bộ của nhân viên.
- `POST /lifecycle/report-issue` - Báo hỏng thiết bị.
- `POST /lifecycle/dispose` - Thanh lý tài sản.
- `POST /lifecycle/transfer` - Chuyển giao giữa người dùng.
- `GET /lifecycle/history/{assetId}` - Lịch sử vòng đời tài sản.
- `GET /lifecycle/history/user/{userId}` - Lịch sử tài sản của nhân viên.

#### Saga Pattern:
- Sử dụng Saga Pattern để quản lý transaction phân tán.
- Compensation Action: Nếu một bước thất bại, rollback các bước trước.

---

### 2.5 Integration Agent

#### Mô tả:
- Đảm nhận toàn bộ tích hợp liên thông với hệ thống bên ngoài.
- Đồng bộ dữ liệu hai chiều với Phần mềm Quản lý Kho, HR System, Workspace.

#### Chức năng:
- **Tích hợp với Phần mềm Quản lý Kho**:
  - **Đồng bộ danh mục**: 
    - Pull: Lấy danh sách tài sản nhập kho (Theo dõi: Mã phiếu, Ngày nhập, Số lượng).
    - Push: Cập nhật trạng thái tài sản (nếu cần).
  - **Đồng bộ tài chính**:
    - Lấy nguyên giá, khấu hao từ Kho/Kế toán (Read-only).
    - Định kỳ đồng bộ (Cron job hàng ngày).
  - **Lệnh Xuất kho**:
    - Khi ITAM cấp phát → Tạo phiếu xuất kho trên Kho.
    - Payload: Asset ID, Mã NV/Nhận, Ngày xuất, Người thực hiện.
  - **Lệnh Trả kho**:
    - Khi ITAM thu hồi → Tạo phiếu trả kho trên Kho.
  - **Đồng bộ tồn kho**:
    - ITAM chỉ theo dõi trạng thái "Trong kho" (In Stock).
    - Không quản lý số lượng vật lý.
  - **Đồng bộ danh mục phụ kiện**:
    - Lấy danh sách phụ kiện từ Kho để hiển thị dropdown.
- **Tích hợp với HR System**:
  - Đồng bộ danh sách nhân viên (Mã NV, Email, Phòng ban, Vị trí).
  - Cập nhật trạng thái nhân viên (Đang làm việc, Đã nghỉ).
- **Tích hợp với Workspace (Self-Service Portal)**:
  - SSO: Xác thực qua SAML2/LDAP/OAuth2.
  - Đồng bộ thông tin nhân viên từ Workspace.
  - Push thông báo lên Workspace.
  - Hiển thị widget/tab trên Workspace.
- **Xử lý lỗi**:
  - Retry mechanism (tối đa 3 lần, exponential backoff).
  - Dead Letter Queue cho lệnh thất bại.
  - Log lỗi chi tiết.
  - Cảnh báo IT Staff khi tích hợp thất bại.

#### API Endpoints (Internal):
- `POST /integration/sync/inventory` - Đồng bộ danh mục kho.
- `POST /integration/sync/finance` - Đồng bộ tài chính.
- `POST /integration/warehouse/export` - Tạo phiếu xuất kho.
- `POST /integration/warehouse/return` - Tạo phiếu trả kho.
- `POST /integration/hr/sync` - Đồng bộ nhân viên.
- `POST /integration/workspace/sso` - Xác thực SSO.

#### Cấu hình:
- Endpoint Kho: https://kho.company.com/api
- API Key: [Cấu hình an toàn]
- Timeout: 10s
- Retry: 3 lần, interval 5s, 10s, 20s.

---

### 2.6 Notification Agent

#### Mô tả:
- Quản lý tất cả thông báo của hệ thống.
- Gửi thông báo qua Email, SMS, Push Notification.

#### Chức năng:
- **Thông báo Email**:
  - Template email: Biên bản bàn giao, Biên bản thu hồi, Cảnh báo bảo hành, Cảnh báo License.
  - Gửi tự động khi có sự kiện.
  - Lịch sử email đã gửi.
- **Thông báo Push (Workspace)**:
  - Thông báo khi có tài sản mới cấp.
  - Nhắc nhở trả thiết bị.
  - Thông báo License sắp hết hạn.
- **Thông báo SMS (Tùy chọn)**:
  - Nhắc nhở khẩn cấp (VD: Hết hạn bảo hành quan trọng).
- **Quản lý Template**:
  - Template có thể tùy biến theo công ty.
  - Hỗ trợ biến động ({{user_name}}, {{asset_tag}}, {{due_date}}...).
  - Hỗ trợ đa ngôn ngữ (Tiếng Việt, Tiếng Anh).

#### API Endpoints:
- `POST /notifications/email` - Gửi email.
- `POST /notifications/push` - Gửi push notification.
- `POST /notifications/sms` - Gửi SMS.
- `GET /notifications/history` - Lịch sử thông báo.
- `POST /notifications/templates` - Tạo/cập nhật template.

#### Cấu hình:
- SMTP: smtp.company.com, port 587, TLS.
- Push Provider: Firebase Cloud Messaging / Workspace API.
- Queue: BullMQ (Redis) cho xử lý bất đồng bộ.

---

### 2.7 Audit Agent

#### Mô tả:
- Ghi log toàn bộ hoạt động của hệ thống.
- Đảm bảo tuân thủ, không thể xóa/sửa log.

#### Chức năng:
- **Ghi log (Audit Trail)**:
  - Sự kiện: Tạo, Sửa, Xóa, Chuyển trạng thái, Cấp phát, Thu hồi, Đính kèm file.
  - Thông tin: User ID, Action, Resource Type, Resource ID, Old Value, New Value, IP Address, User Agent, Timestamp.
- **Lưu trữ log**:
  - Database: PostgreSQL (bảng `audit_logs`).
  - Không cho phép xóa/sửa log (chỉ đọc).
  - Lưu log lâu dài (tuân thủ pháp lý).
- **Báo cáo Audit**:
  - Lọc theo người dùng, thời gian, loại tài sản, sự kiện.
  - Xuất CSV, PDF, Excel.
  - Theo dõi thay đổi nhạy cảm (License Key, Giá trị tài sản).
- **Cảnh báo bất thường**:
  - Phát hiện hành vi đáng ngờ (VD: Xóa nhiều tài sản cùng lúc).
  - Cảnh báo cho Admin.

#### API Endpoints:
- `GET /audit/logs` - Danh sách log (phân trang, lọc).
- `GET /audit/logs/{id}` - Chi tiết log.
- `GET /audit/logs/export` - Xuất báo cáo audit.
- `GET /audit/trail/{resourceType}/{resourceId}` - Lịch sử thay đổi của một tài sản.

#### Cấu trúc log:
```
{
  "id": "uuid",
  "user_id": "user-123",
  "action": "UPDATE",
  "resource_type": "asset",
  "resource_id": "asset-456",
  "old_value": {"status": "In Stock"},
  "new_value": {"status": "In Use"},
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

### 2.8 Reporting Agent

#### Mô tả:
- Tổng hợp dữ liệu từ các Agent khác.
- Tạo báo cáo, dashboard, phân tích xu hướng.

#### Chức năng:
- **Báo cáo Tài sản**:
  - Tổng quan tài sản theo loại, trạng thái, phòng ban.
  - Tỷ lệ sử dụng tài sản.
  - Lịch sử nhập/xuất theo thời gian.
- **Báo cáo Tài chính**:
  - Tổng giá trị tài sản hiện tại (đồng bộ từ Kho).
  - Khấu hao theo năm.
  - Chi phí mua sắm theo quý/năm.
- **Báo cáo Bảo hành**:
  - Danh sách tài sản sắp hết bảo hành.
  - Lịch sử sửa chữa, bảo dưỡng.
- **Báo cáo License**:
  - Tỷ lệ sử dụng License (Allocated / Total).
  - License sắp hết hạn.
- **Báo cáo Kiểm kê**:
  - Kết quả kiểm kê: Đúng, Thiếu, Thừa, Hỏng.
  - Chênh lệch so với dữ liệu Kho.
- **Dashboard Real-time**:
  - Tổng quan nhanh: Số tài sản đang sử dụng, sắp hết bảo hành, cần kiểm kê.
  - Charts: Biểu đồ trạng thái, biểu đồ theo thời gian.
  - Export: PDF, Excel, CSV.

#### API Endpoints:
- `GET /reports/assets/summary` - Tổng quan tài sản.
- `GET /reports/finance/value` - Giá trị tài sản.
- `GET /reports/warranty/expiring` - Tài sản sắp hết bảo hành.
- `GET /reports/licenses/usage` - Tỷ lệ sử dụng License.
- `GET /reports/audit/check` - Kết quả kiểm kê.
- `GET /reports/dashboard` - Dashboard tổng hợp.
- `POST /reports/export` - Xuất báo cáo.

#### Công nghệ:
- Query Builder: Knex.js / SQLAlchemy.
- Cache: Redis (cache báo cáo 15 phút).
- Export: ExcelJS, PDFKit.

---

### 2.9 Scheduler Agent

#### Mô tả:
- Xử lý các tác vụ định kỳ, chạy nền.
- Đảm bảo các công việc tự động chạy đúng lịch.

#### Chức năng:
- **Đồng bộ dữ liệu**:
  - Đồng bộ danh mục Kho: Hàng ngày lúc 2:00 AM.
  - Đồng bộ nhân viên từ HR: Hàng ngày lúc 3:00 AM.
  - Đồng bộ tài chính từ Kho: Hàng ngày lúc 4:00 AM.
- **Cảnh báo tự động**:
  - Kiểm tra bảo hành sắp hết: Hàng ngày lúc 8:00 AM.
  - Kiểm tra License sắp hết: Hàng ngày lúc 8:30 AM.
  - Kiểm tra tài sản đã cấp quá hạn (nếu có).
- **Dọn dẹp dữ liệu**:
  - Xóa log cũ (nếu có chính sách lưu trữ).
  - Xóa token hết hạn.
  - Dọn Dead Letter Queue.
- **Kiểm kê định kỳ**:
  - Nhắc nhở tạo đợt kiểm kê theo lịch.
- **Backup**:
  - Backup database hàng ngày.
  - Backup file đính kèm.

#### Công nghệ:
- Node-cron / Celery / Hangfire.
- Distributed Lock: Redis để tránh chạy trùng lặp.

#### Cron Jobs:
| Job | Lịch chạy | Mô tả |
|-----|-----------|-------|
| sync_inventory | 0 2 * * * | Đồng bộ danh mục Kho |
| sync_hr | 0 3 * * * | Đồng bộ nhân viên |
| sync_finance | 0 4 * * * | Đồng bộ tài chính |
| check_warranty | 0 8 * * * | Cảnh báo bảo hành |
| check_license | 30 8 * * * | Cảnh báo License |
| cleanup_logs | 0 1 * * 0 | Dọn log cũ (Chủ nhật) |
| backup_db | 0 0 * * * | Backup database (Hàng ngày) |

---

### 2.10 File Agent

#### Mô tả:
- Quản lý lưu trữ file đính kèm của hệ thống.
- Xử lý upload, download, xóa file.

#### Chức năng:
- **Upload file**:
  - Hóa đơn, biên bản, hình ảnh tài sản, file cấu hình thiết bị mạng.
  - Kiểm tra loại file, dung lượng tối đa (10MB).
  - Kiểm tra virus (nếu có).
  - Tạo thumbnail cho hình ảnh.
- **Lưu trữ**:
  - Local Storage (NFS) hoặc Cloud Storage (S3, MinIO).
  - Cấu trúc thư mục: `/assets/{year}/{month}/{asset_id}/{filename}`.
  - Mã hóa file nhạy cảm.
- **Download**:
  - Tạo signed URL (hết hạn sau 1 giờ).
  - Kiểm tra quyền truy cập.
- **Xóa file**:
  - Soft delete (chuyển vào thùng rác).
  - Hard delete sau 30 ngày (tuân thủ backup).
- **Quản lý biên bản**:
  - Tạo PDF biên bản bàn giao, thu hồi, thanh lý.
  - Lưu trữ biên bản đã ký.
  - Gửi biên bản qua email.

#### API Endpoints:
- `POST /files/upload` - Upload file.
- `GET /files/{id}/download` - Download file.
- `DELETE /files/{id}` - Xóa file.
- `POST /files/generate-invoice-pdf` - Tạo PDF hóa đơn.
- `POST /files/generate-handover-pdf` - Tạo PDF biên bản bàn giao.

#### Cấu hình:
- Max file size: 10MB.
- Allowed types: pdf, jpg, png, docx, xlsx, zip.
- Storage path: `/data/itam-files/`.
- Virus scan: ClamAV (optional).

---

### 2.11 QR Agent

#### Mô tả:
- Quản lý sinh và in mã QR/Barcode cho tài sản.
- Tích hợp với máy in để in nhãn.

#### Chức năng:
- **Sinh mã QR/Barcode**:
  - Mã QR chứa: Asset Tag, Serial Number, URL truy cập ITAM.
  - Barcode: Chứa Asset Tag (dạng text).
  - Kích thước: 100x100px (QR), 80x30px (Barcode).
  - Độ phân giải: 300 DPI (chuẩn in nhãn).
- **In nhãn**:
  - Template nhãn: A6, A7, hoặc custom size.
  - Hỗ trợ in hàng loạt.
  - Tích hợp với máy in mạng (Print Server).
- **Quản lý nhãn**:
  - Theo dõi lần in cuối, số lần in lại.
  - Trạng thái nhãn: Mới, Đã in, Hư hỏng, Cần in lại.
- **Quét mã**:
  - Hỗ trợ quét QR/Barcode từ camera (Mobile Web App).
  - Decode thông tin, tra cứu tài sản.

#### API Endpoints:
- `POST /qr/generate` - Sinh mã QR/Barcode.
- `POST /qr/print/batch` - In hàng loạt nhãn.
- `POST /qr/scan` - Quét mã (upload image).
- `GET /qr/labels/{assetId}` - Lấy thông tin nhãn của tài sản.

#### Công nghệ:
- QR Code: qrcode, jsQR.
- Barcode: bwip-js, JsBarcode.
- PDF Label: PDFKit, Puppeteer.

---

### 2.12 Check Agent (Kiểm kê)

#### Mô tả:
- Quản lý đợt kiểm kê tài sản.
- Hỗ trợ đối chiếu dữ liệu thực tế với dữ liệu trên ITAM/Kho.

#### Chức năng:
- **Tạo đợt kiểm kê**:
  - Phạm vi: Phòng ban, Khu vực, Tòa nhà.
  - Thời gian: Bắt đầu, Kết thúc.
  - Người phụ trách: IT Staff.
  - Import danh sách tài sản cần kiểm kê (Excel/CSV) hoặc từ Kho.
- **Thực hiện kiểm kê**:
  - Quét QR/Barcode từng tài sản (qua Mobile Web App).
  - Xác nhận tình trạng thực tế: Đúng, Thiếu, Thừa, Hỏng.
  - Ghi nhận vị trí thực tế, ghi chú.
- **Đối chiếu (Reconciliation)**:
  - So sánh dữ liệu thực tế với dữ liệu ITAM/Kho.
  - Phát hiện chênh lệch.
- **Báo cáo kiểm kê**:
  - Xuất báo cáo: Tổng quan, Chi tiết, Chênh lệch.
  - Định dạng: PDF, Excel.
  - Biểu đồ: Tỷ lệ đúng/thiếu/thừa/hỏng.
- **Xử lý chênh lệch**:
  - Điều chỉnh trạng thái tài sản.
  - Tạo biên bản kiểm kê.

#### API Endpoints:
- `POST /audit-check/sessions` - Tạo đợt kiểm kê.
- `GET /audit-check/sessions/{id}` - Chi tiết đợt kiểm kê.
- `POST /audit-check/sessions/{id}/scan` - Ghi nhận quét tài sản.
- `POST /audit-check/sessions/{id}/reconcile` - Đối chiếu dữ liệu.
- `GET /audit-check/sessions/{id}/report` - Báo cáo kiểm kê.
- `POST /audit-check/sessions/{id}/close` - Kết thúc đợt kiểm kê.

#### Database:
- Table: `audit_sessions` (đợt kiểm kê).
- Table: `audit_items` (từng tài sản trong đợt kiểm kê).

---

### 2.13 Collector Agent (Data Collector)

#### Mô tả:
- Script chạy ngầm trên máy Client để thu thập cấu hình phần cứng/phần mềm.
- Đẩy dữ liệu về API của ITAM (Tùy chọn nâng cao).

#### Chức năng:
- **Quét cấu hình phần cứng**:
  - CPU: Model, Số nhân, Tần số.
  - RAM: Dung lượng, Loại DDR.
  - Ổ cứng: Loại, Dung lượng, Serial.
  - Card mạng: MAC Address, IP.
  - Serial Number: BIOS, CPU, Ổ cứng.
- **Quét phần mềm đã cài đặt**:
  - Tên phần mềm, Phiên bản, Ngày cài đặt.
  - License Key (nếu có).
- **Gửi dữ liệu**:
  - Định kỳ: Hàng ngày, hàng tuần.
  - Giao thức: HTTPS POST.
  - Xác thực: API Key hoặc JWT.
- **Cài đặt**:
  - Chạy như Service/Background Process (Windows Service, systemd).
  - Silent mode, không hiển thị UI.
  - Tự động cập nhật.

#### Công nghệ:
- Windows: PowerShell + WMI, hoặc Python + WMI.
- Linux: Python + dmidecode, lshw, lsb_release.
- Gửi dữ liệu: requests (Python) hoặc axios (Node.js).

#### Cấu hình:
- ITAM API URL: https://itam.company.com/api/v1/collector.
- API Key: [Cấu hình an toàn].
- Interval: 86400s (hàng ngày).

---

### 2.14 Config Agent

#### Mô tả:
- Quản lý cấu hình tập trung của hệ thống.
- Feature Flag, Environment Variables, Cài đặt hệ thống.

#### Chức năng:
- **Quản lý cấu hình**:
  - API Integration settings (URL, API Key, Timeout).
  - SMTP settings (Server, Port, Username, Password).
  - Quy tắc mã tài sản (Prefix, Separator, Số thứ tự).
  - Quy tắc bảo hành (Số ngày cảnh báo trước).
  - Quy tắc License (Số ngày cảnh báo gia hạn).
  - Email templates.
  - Biên bản templates.
- **Feature Flag**:
  - Bật/tắt tính năng: Kiểm kê, Data Collector, Camera Check.
  - Phân biệt theo môi trường: Development, Staging, Production.
- **Lịch sử thay đổi cấu hình**:
  - Ghi log ai đã thay đổi, khi nào, giá trị cũ → giá trị mới.
  - Rollback cấu hình nếu cần.

#### API Endpoints:
- `GET /config/settings` - Lấy danh sách cài đặt.
- `PUT /config/settings/{key}` - Cập nhật cài đặt.
- `GET /config/feature-flags` - Lấy danh sách feature flags.
- `PUT /config/feature-flags/{key}` - Bật/tắt feature flag.
- `GET /config/audit` - Lịch sử thay đổi cấu hình.

#### Lưu trữ:
- Database: Table `config_settings` (key-value).
- Cache: Redis (đọc nhanh, giảm tải DB).

---

## 3. KIẾN TRÚC TỔNG QUAN

### 3.1 Sơ đồ tương tác

```
[Client] → [API Gateway]
              ↓
    +---------+---------+
    |         |         |
[Auth Agent] [Asset Agent] [Lifecycle Agent]
    |         |         |
    +----+----+---------+
         |
    [Integration Agent] → [Kho/ERP/HR/Workspace]
         |
    [Audit Agent] ← [Tất cả Agent đều gửi log]
         |
    [Notification Agent] → [Email/SMS/Push]
         |
    [Reporting Agent] → [Báo cáo/Dashboard]
         |
    [Scheduler Agent] → [Cron Jobs]
         |
    [File Agent] → [Storage]
         |
    [QR Agent] → [Máy in]
         |
    [Check Agent] → [Mobile Web App]
         |
    [Collector Agent] → [Client PCs]
         |
    [Config Agent] ← [Tất cả Agent đọc cấu hình]
```

### 3.2 Công nghệ đề xuất

| Component | Công nghệ | Lý do |
|-----------|-----------|--------|
| Runtime | Node.js / Python | Hiệu năng, ecosystem phong phú |
| Framework | NestJS / FastAPI | Modular, scalable, dễ bảo trì |
| Message Queue | Redis / RabbitMQ | Nhẹ, nhanh, phù hợp microservices |
| Database | PostgreSQL | ACID, JSON support, phù hợp dữ liệu phức tạp |
| Cache | Redis | Session, rate limiting, cache báo cáo |
| Storage | MinIO / S3 | Object storage, scalable |
| Authentication | JWT + SSO | Linh hoạt, tích hợp được với nhiều hệ thống |
| PDF Generation | Puppeteer / PDFKit | Tạo biên bản, báo cáo đẹp |
| Task Queue | BullMQ / Celery | Xử lý bất đồng bộ (Email, API calls) |
| Monitoring | Prometheus + Grafana | Giám sát hiệu năng Agent |

---

## 4. DEPLOYMENT & SCALING

### 4.1 Triển khai
- **Container hóa**: Docker + Docker Compose (Dev) / Kubernetes (Prod).
- **Môi trường**: 
  - Development: Local Docker.
  - Staging: Cloud VM.
  - Production: Kubernetes Cluster (3 nodes minimum).
- **CI/CD**: GitHub Actions / GitLab CI.
  - Build → Test → Push Image → Deploy.

### 4.2 Scaling
- **Horizontal Scaling**:
  - API Gateway: Scale theo request volume.
  - Asset Agent: Scale theo số lượng tài sản.
  - Integration Agent: Scale theo số lệnh đồng bộ.
- **Database Scaling**:
  - Read Replica cho Reporting Agent (đọc nhiều).
  - Sharding theo Phòng ban (nếu > 100K tài sản).
- **Cache Scaling**:
  - Redis Cluster cho session, cache.

### 4.3 Monitoring & Logging
- **Metrics**: Prometheus + Grafana.
  - Request latency, error rate, throughput.
  - Database connection pool, queue length.
- **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana).
  - Structured logging (JSON).
  - Centralized log từ tất cả Agent.
- **Alerting**: 
  - Alert khi Agent down.
  - Alert khi queue dài.
  - Alert khi lỗi tích hợp Kho.

---

## 5. BẢO MẬT AGENT

### 5.1 Xác thực giữa các Agent
- Mỗi Agent có API Key riêng.
- Communication nội bộ qua mTLS (Mutual TLS).
- JWT signed với secret key riêng.

### 5.2 Phân quyền Agent
- Mỗi Agent chỉ có quyền truy cập các Resource cần thiết.
- Principle of Least Privilege.

### 5.3 Bảo vệ dữ liệu
- Mã hóa dữ liệu nhạy cảm trong database (AES-256).
- HTTPS cho tất cả communication external.
- Audit log không thể xóa/sửa.

---

## 6. DỮ LIỆU AGENT

### 6.1 Cấu trúc dữ liệu chính

```
ITAM Database
├── users (Người dùng)
├── roles (Vai trò)
├── permissions (Quyền)
├── departments (Phòng ban)
├── locations (Vị trí)
├── asset_types (Nhóm tài sản)
├── assets (Tài sản)
├── asset_fields (Trường động)
├── asset_values (Giá trị trường động)
├── asset_history (Lịch sử bàn giao)
├── licenses (Phần mềm/License)
├── warranty (Bảo hành)
├── vendors (Nhà cung cấp)
├── audit_logs (Audit Trail)
├── audit_sessions (Đợt kiểm kê)
├── audit_items (Chi tiết kiểm kê)
├── files (File đính kèm)
├── qr_labels (Mã QR/Barcode)
├── notifications (Thông báo)
├── config_settings (Cấu hình)
└── integration_logs (Log tích hợp)
```

### 6.2 Luồng dữ liệu

```
1. IT Staff tạo tài sản
   → Asset Agent lưu DB
   → Audit Agent ghi log
   → QR Agent sinh mã QR
   → Notification Agent thông báo (nếu cần)

2. IT Staff cấp phát tài sản
   → Lifecycle Agent validate
   → Asset Agent cập nhật trạng thái
   → Integration Agent gọi API Xuất kho (Kho)
   → File Agent tạo biên bản PDF
   → Audit Agent ghi log
   → Notification Agent gửi email

3. Hệ thống cảnh báo bảo hành
   → Scheduler Agent chạy hàng ngày
   → Query DB tìm tài sản sắp hết bảo hành
   → Notification Agent gửi email cho IT
```

---

## 7. TESTING & QUALITY

### 7.1 Unit Test
- Mỗi Agent có test riêng (Jest, Pytest).
- Coverage target: > 80%.

### 7.2 Integration Test
- Test tích hợp giữa các Agent.
- Mock API của Kho/HR/Workspace.

### 7.3 E2E Test
- Test luồng nghiệp vụ hoàn chỉnh: Cấp phát → Thu hồi → Báo cáo.
- Sử dụng Testcontainers cho database, message queue.

### 7.4 Load Test
- Test khả năng chịu tải: 500 concurrent users.
- Tool: k6, JMeter.

---

## 8. ROLLOUT PLAN

### Phase 1: Core Agents (4-6 tuần)
- API Gateway, Auth Agent, Asset Agent, Lifecycle Agent.
- Database schema cơ bản.
- Frontend đơn giản để test.

### Phase 2: Integration Agents (2-3 tuần)
- Integration Agent (Kho, HR).
- Notification Agent (Email).
- Audit Agent.
- File Agent.

### Phase 3: Advanced Agents (3-4 tuần)
- QR Agent, Check Agent.
- Reporting Agent.
- Scheduler Agent.

### Phase 4: Optimization (2 tuần)
- Collector Agent (nếu cần).
- Config Agent.
- Tối ưu hiệu năng, scaling.
