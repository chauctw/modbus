# Plan: Cập nhật README.md — Gom file theo nhóm chức năng + Luồng dữ liệu Channel

## Mục tiêu
Cập nhật `README.md` để:
1. Ghi chú phân nhóm file theo chức năng → AI biết chỉnh file nào khi điều chỉnh từng phần dự án.
2. Ghi tóm tắt chi tiết luồng xử lý dữ liệu của các kênh (channel).

## Các thay đổi cần thực hiện

### 1. Thêm phần "Cấu trúc thư mục"
Liệt kê toàn bộ file tree của dự án, kèm mô tả 1 dòng/file.

### 2. Thêm phần "Phân nhóm theo chức năng"
Nhóm file thành các nhóm sau, mỗi nhóm liệt kê file backend chính, file hỗ trợ, và file frontend liên quan:
- Channel CRUD / Channel API
- Device CRUD / Device API
- Tag CRUD / Tag API
- ThingsBoard Integration
- Modbus Realtime Reading
- Import / Export KEPServerEX JSON
- Custom Tags / Expression Engine
- External API Fetch (Live Fetch)
- Database Schema
- Frontend UI / Styling
- Authentication / Users

### 3. Thêm phần "Luồng xử lý dữ liệu Channel"
Mô tả chi tiết 3 giai đoạn:
- **Đi vào (Input):** Các nguồn dữ liệu (KEPServerEX JSON import, API multipart, API JSON body, CRUD thủ công) và điểm vào tương ứng.
- **Xử lý:** 
  - Import REPLACE mode (`importProject`) — xoá sạch, parse channels→devices→tags, insert.
  - Import MERGE mode (`mergeProject`) — khớp theo NAME, update/insert, giữ nguyên unmatched.
- **Lưu trữ:** Sơ đồ ER (project → channels → devices → tags), ràng buộc ON DELETE CASCADE, raw_json round-trip.
- **Đầu ra (Output):** Các điểm đến (frontend tree, channel list, device list, ThingsBoard upload loop, API fetch → TB, export JSON).

## Validation
- Đọc lại README.md sau khi cập nhật, đảm bảo định dạng markdown đúng.
- Kiểm tra tất cả file trong dự án đã được đề cập đúng nhóm chức năng.
- Kiểm tra luồng dữ liệu channel đầy đủ 4 giai đoạn: Input → Processing → Storage → Output.

## Trạng thái
- Không có quyết định mở cần hỏi user.
- Có thể triển khai ngay.
