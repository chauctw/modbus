# KEPServerEX Tag Manager (Node.js + SQLite + PM2)

Ứng dụng quản lý Channel/Device/Tag Modbus TCP từ file cấu hình KEPServerEX (JSON),
chạy như **dịch vụ nền trên Linux qua PM2** — không cần mở trình duyệt để hoạt động.
Dữ liệu được lưu vào **SQLite** (`data/kepware.db`) ngay khi import, không chỉ giữ trong bộ nhớ trình duyệt.

- Backend: Node.js + Express + `better-sqlite3` (SQLite, không cần cài server DB riêng)
- Frontend: HTML/JS thuần (không build step), gọi API để xem/sửa — chỉ dùng khi bạn *muốn* thao tác bằng giao diện
- Import bằng UI **hoặc** bằng dòng lệnh (không cần trình duyệt) **hoặc** gọi API trực tiếp (script/cron)

## 1. Cài đặt trên server Linux

```bash
cd kepware-tag-manager
npm install          # cài express, better-sqlite3, multer, cors (đã có sẵn prebuilt binary, không cần build tool)
npm install -g pm2   # nếu máy chưa có pm2
```

## 2. Chạy như dịch vụ nền bằng PM2 (không cần mở trình duyệt)

```bash
npm run pm2:start          # = pm2 start ecosystem.config.js
pm2 save                   # lưu lại danh sách process để tự khởi động lại
pm2 startup                # (chạy 1 lần) để pm2 tự chạy cùng lúc máy khởi động lại
```

Kiểm tra:
```bash
pm2 status
pm2 logs kepware-tag-manager
curl http://localhost:3000/api/health
```

Các lệnh khác:
```bash
npm run pm2:restart
npm run pm2:stop
```

Mặc định server nghe ở cổng `3000`. Đổi cổng bằng biến môi trường `PORT` trong `ecosystem.config.js`.

## 3. Import file JSON — 3 cách, 2 chế độ

### ⚠️ Chế độ import: Thay thế vs Gộp thêm
- **Thay thế (replace, mặc định)**: xoá sạch toàn bộ channel/device/tag hiện có, chỉ giữ lại đúng
  nội dung của file vừa import. Dùng khi file JSON là **bản đầy đủ** của toàn bộ project.
- **Gộp thêm (merge)**: giữ nguyên dữ liệu cũ, chỉ thêm channel/device mới hoặc cập nhật channel/device
  đã có (khớp theo **tên**). Dùng khi bạn import **nhiều file JSON rời** (mỗi file 1 phần cấu hình,
  ví dụ mỗi channel 1 file) mà không muốn mất dữ liệu đã có.
  - Channel/Device trùng tên → được cập nhật lại field + đồng bộ lại toàn bộ tag của riêng device đó.
  - Channel/Device không có trong file mới → giữ nguyên, không bị xoá.

**Nếu bạn từng gặp lỗi "mất channel khi import file mới"**: đó là do dùng chế độ Thay thế cho 1 file
chỉ chứa 1 phần cấu hình. Hãy dùng chế độ **Gộp thêm** ở các lần import sau lần đầu.

### Cách A — Dòng lệnh, không cần trình duyệt hay server đang chạy (khuyên dùng khi triển khai)
```bash
node import-cli.js /duong/dan/toi/config.json            # mặc định: THAY THẾ toàn bộ
node import-cli.js /duong/dan/toi/config.json --merge     # GỘP THÊM, giữ dữ liệu cũ
```

### Cách B — Gọi API trực tiếp (khi server đang chạy qua PM2)
```bash
# Thay thế toàn bộ
curl -X POST -F "file=@/duong/dan/toi/config.json" http://localhost:3000/api/import

# Gộp thêm
curl -X POST -F "file=@/duong/dan/toi/config.json" -F "mode=merge" http://localhost:3000/api/import

# Hoặc gửi JSON thẳng trong body:
curl -X POST "http://localhost:3000/api/import-json?mode=merge" \
  -H "Content-Type: application/json" \
  --data @/duong/dan/toi/config.json
```

### Cách C — Qua giao diện web (tuỳ chọn, chỉ cần khi muốn xem/sửa bằng mắt)
Mở `http://<ip-server>:3000` → nút **Import JSON**. Nếu hệ thống đã có dữ liệu, app sẽ hỏi bạn muốn
**Gộp thêm** hay **Thay thế toàn bộ** trước khi import.

**Lưu ý:** mỗi lần import sẽ **thay thế toàn bộ** dữ liệu hiện có trong DB bằng project mới (xoá sạch
channels/devices/tags cũ, nạp lại từ đầu) để đảm bảo đồng bộ 1-1 với file KEPServerEX. Trước khi import
đè, nên **Export** để sao lưu lại nếu cần.

## 4. Export lại đúng định dạng KEPServerEX
```bash
curl -o export.json http://localhost:3000/api/export
```
Hoặc bấm nút **Export JSON** trên giao diện. Mọi field không được UI xử lý (timeout, retry, byte order,
`client_interfaces`, `mbeglobaldata`, v.v.) được giữ nguyên 1-1 vì mỗi channel/device/tag đều lưu kèm
`raw_json` gốc trong DB.

## 5. Cấu trúc DB (SQLite)
- `project` — tiêu đề + các field cấp project không được UI xử lý (`client_interfaces`, `mbeglobaldata`...)
- `channels` — 1 dòng / channel, có `raw_json` đầy đủ để round-trip
- `devices` — 1 dòng / device, có `ip`, `slave_id` tách riêng từ `DEVICE_ID_STRING`, có `raw_json`
- `tags` — 1 dòng / tag, có `raw_json` đầy đủ (kể cả các field scaling)

File DB nằm ở `data/kepware.db`. Sao lưu bằng cách copy file này (dừng service hoặc dùng
`sqlite3 data/kepware.db ".backup data/backup.db"` để backup an toàn khi đang chạy).

## 6. API chính (tham khảo nhanh)
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/import` (multipart `file`) | Import JSON, thay thế toàn bộ DB |
| POST | `/api/import-json` (JSON body) | Import JSON bằng body trực tiếp |
| GET | `/api/export` | Tải JSON đúng định dạng gốc |
| POST | `/api/reset` | Xoá sạch DB |
| GET | `/api/stats` | Thống kê dashboard |
| GET | `/api/validate` | Kiểm tra trùng lặp tên/địa chỉ/IP |
| GET/POST/PUT/DELETE | `/api/channels[/:id]` | CRUD channel |
| GET/POST/PUT/DELETE | `/api/devices[/:id]` | CRUD device |
| POST | `/api/devices/:id/duplicate` | Nhân bản device kèm tag |
| GET/POST/PUT/DELETE | `/api/devices/:id/tags`, `/api/tags[/:id]` | CRUD + phân trang/lọc/sắp xếp tag |
| POST | `/api/tags/bulk-create` | Thêm tag hàng loạt (CSV/TSV) |
| POST | `/api/tags/bulk-delete`, `/api/tags/bulk-update` | Xoá/sửa hàng loạt |
| GET | `/api/tree` | Cây channel → device → số lượng tag |

## 7. Xem giá trị Tag Realtime (đọc thật từ PLC qua Modbus TCP)

Khi mở bảng tag của 1 device, bấm **▶ Bật Realtime** để app kết nối Modbus TCP thật tới
IP của device đó (cổng lấy từ field `modbus_ethernet.DEVICE_ETHERNET_PORT_NUMBER`, mặc định 502)
và đọc giá trị của các tag đang hiển thị trên trang hiện tại, mỗi 2 giây.

- Cột **Giá trị Realtime** hiện chấm xanh + giá trị khi đọc thành công, chấm đỏ + "Lỗi" (hover xem
  chi tiết lỗi, ví dụ timeout/connection refused) khi đọc thất bại.
- Với tag có Scaling (Linear), cột hiện cả giá trị đã quy đổi và giá trị raw.
- Bấm **⏸ Tắt Realtime**, chuyển sang device khác, hoặc đóng tab sẽ tự ngắt kết nối Modbus TCP.
- Hỗ trợ đọc: Coil, Discrete Input, Input Register, Holding Register; kiểu dữ liệu Boolean, Char,
  Byte, Word, Short, DWord, Long, Float, Double, LLong, QWord, và địa chỉ có hậu tố bit (`.N`).
  Kiểu **String** chưa hỗ trợ đọc realtime (đọc/ghi cấu hình thì vẫn bình thường).

### Nếu giá trị đọc về không đúng (đặc biệt Float / DWord / Long / Double)
Nguyên nhân phổ biến nhất là **thứ tự Byte/Word** của PLC thật khác với mặc định. Với các kiểu
32-bit trở lên (chiếm ≥2 register), có nhiều PLC lưu word thấp trước - word cao sau (ngược với
chuẩn big-endian mà app giả định mặc định), khiến giá trị đọc về sai lệch rất lớn.

Vào **Sửa Device** → bật thử **Word Swap** (hay gặp nhất) hoặc **Byte Swap**, rồi bật lại Realtime
để kiểm tra giá trị có đúng không. Đây là cấu hình theo từng Device, áp dụng cho toàn bộ tag 32-bit
trở lên của device đó.

Nếu vẫn sai sau khi thử cả 4 tổ hợp Byte Swap / Word Swap, kiểm tra thêm:
- `Data Type` của tag có đúng với kiểu thực tế trong PLC không (ví dụ đang để Short nhưng PLC thực
  sự trả về Float sẽ ra số vô nghĩa).
- Địa chỉ (`Address`) có đúng theo quy ước Modicon của PLC đó không (một số PLC dùng offset khác 1).
- Slave ID / IP có đúng thiết bị không (dễ nhầm khi nhiều thiết bị dùng chung 1 gateway).

### Làm tròn số thập phân
Mỗi tag có trường **"Số chữ số thập phân hiển thị"** (mặc định 2, sửa được trong form Sửa Tag) —
áp dụng khi hiển thị giá trị Realtime cho kiểu Float/Double, và cho giá trị đã quy đổi (Scaled) của
mọi tag có bật Scaling. Việc làm tròn này chỉ ảnh hưởng hiển thị, không thay đổi dữ liệu cấu hình
gốc khi export JSON.
- **Lưu ý an toàn**: tính năng này chủ động mở kết nối tới PLC thật trong mạng OT — chỉ bật khi
  cần xem giá trị, và đảm bảo server chạy app này có quyền truy cập mạng tới dải IP của các PLC.
  Đây vẫn là *xem* dữ liệu (read-only, không ghi giá trị xuống PLC).

API liên quan:
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/devices/:id/live-read` (body `{tagIds:[...]}`) | Đọc giá trị realtime của các tag chỉ định |
| POST | `/api/devices/:id/live-disconnect` | Ngắt kết nối Modbus TCP tới device |

## 8. Ghi chú khác
- Đây là công cụ soạn thảo cấu hình + xem realtime; **không** ghi giá trị xuống PLC, không có chức năng điều khiển.
- Bảng mã `TAG_DATA_TYPE` theo quy ước KEPServerEX: xem `datatypes.js`.



function Show-Tree {
    param(
        [string]$Path = ".",
        [string]$Indent = ""
    )

    Get-ChildItem $Path | Where-Object { $_.Name -ne "node_modules" } | ForEach-Object {
        Write-Output "$Indent|-- $($_.Name)"
        if ($_.PSIsContainer) {
            Show-Tree $_.FullName ($Indent + "|   ")
        }
    }
}
Show-Tree | Out-File structure.txt -Encoding utf8