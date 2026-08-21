# KEPServerEX Tag Manager (Node.js + SQLite + PM2)

Ứng dụng quản lý Channel/Device/Tag Modbus TCP từ file cấu hình KEPServerEX (JSON),
chạy như **dịch vụ nền trên Linux qua PM2** — không cần mở trình duyệt để hoạt động.
Dữ liệu được lưu vào **SQLite** (`data/kepware.db`) ngay khi import, không chỉ giữ trong bộ nhớ trình duyệt.

- Backend: Node.js + Express + `better-sqlite3` (SQLite, không cần cài server DB riêng)
- Frontend: HTML/JS thuần (không build step), gọi API để xem/sửa — chỉ dùng khi bạn *muốn* thao tác bằng giao diện
- Import bằng UI **hoặc** bằng dòng lệnh (không cần trình duyệt) **hoặc** gọi API trực tiếp (script/cron)

## Cấu trúc thư mục

```
modbus/
├── server.js                  # Server Express chính, JWT auth, ThingsBoard orchestration
├── db.js                      # SQLite init, schema, migrations
├── package.json               # Scripts & dependencies
├── ecosystem.config.js        # PM2 production config
│
├── routes/                    # API Routes
│   ├── api.js                 # API fetch configs, mappings
│   ├── auth.js                # Login, change-password
│   ├── channels.js            # Channel CRUD
│   ├── custom-tags.js         # Custom tag CRUD, sources, TB mapping
│   ├── devices.js             # Device CRUD, duplicate, live-read/disconnect
│   ├── misc.js                # Stats, validate, tree, datatypes, import/export, reset
│   ├── tags.js                # Tag CRUD, bulk ops, TB mapping per tag
│   ├── thingsboard.js         # TB device CRUD, stats
│   └── users.js               # User CRUD (admin/editor/viewer)
│
├── kepware-io.js              # KEPServerEX JSON import/merge/export, round-trip raw_json
├── import-cli.js              # CLI import (no server needed)
├── modbus-client.js           # Modbus TCP pool, block read, decode, scaling, byte/word swap
├── live_fetchers.js           # External API fetchers (Clean Water, Raw Water, Viwater)
├── expression-engine.js       # Custom expression parser/AST/evaluator (abs/round/min/max)
├── datatypes.js               # KEPServerEX data type codes, R/W constants, Modicon hints
│
├── public/                    # Frontend (vanilla HTML/JS/CSS, no build step)
│   ├── index.html             # Main app shell (dashboard, tree, tables, modals)
│   ├── login.html             # Login page
│   ├── app.js                 # App init, global state, API helper, modal system
│   ├── style.css              # Full CSS (TB PE theme, tables, modals, toggles)
│   └── js/
│       ├── tree.js            # Tree view: channels → devices → tag counts
│       ├── tree-events.js     # Global handlers: add channel, add TB device, search
│       ├── devices.js         # Device list, form, duplicate, TB device select
│       ├── tags.js            # Tag table, inline edit, tag form (scaling), bulk ops
│       ├── realtime.js        # Realtime Modbus polling, live cell updates
│       ├── custom-tags.js     # Custom tag table, form, expression builder, TB mapping
│       ├── live-fetch.js      # API fetch config, live fetch table, TB toggle
│       ├── dashboard.js       # Dashboard stat cards (channels, devices, tags, dupes)
│       ├── import-export.js   # Import (multipart), export download, reset DB
│       └── auth.js            # Change password, user management UI
│
├── data/                      # Runtime data (gitignored except .gitkeep)
│   └── kepware.db             # SQLite DB
├── logs/                      # PM2 logs
├── .NhaMay1.json              # Sample KEPServerEX config
├── .HungPhu.json              # Sample KEPServerEX config
└── README.md
```

## Phân nhóm theo chức năng (để AI biết chỉnh file nào khi điều chỉnh dự án)

### Channel CRUD / Channel API
- **Backend chính:** `routes/channels.js`
- **Hỗ trợ:** `server.js` (`channelWithCounts`, `sanitizeTbKey`)
- **Frontend:** `public/js/tree.js`, `public/js/tree-events.js`, `public/js/devices.js`

### Device CRUD / Device API
- **Backend chính:** `routes/devices.js`
- **Hỗ trợ:** `server.js` (`deviceWithCounts`)
- **Frontend:** `public/js/devices.js`, `public/js/tree.js`

### Tag CRUD / Tag API
- **Backend chính:** `routes/tags.js`
- **Frontend:** `public/js/tags.js`, `public/js/realtime.js`

### ThingsBoard Integration
- **Backend chính:** `server.js` (`processThingsBoardUploads`, `uploadToThingsBoard`, `processApiThingsBoardUploads`)
- **Routes:** `routes/thingsboard.js`, `routes/api.js`, `routes/tags.js` (per-tag TB mapping)
- **Frontend:** `public/js/devices.js`, `public/js/tags.js`, `public/js/live-fetch.js`, `public/js/custom-tags.js`

### Modbus Realtime Reading
- **Backend chính:** `modbus-client.js` (connection pool, block read, decode, scaling, byte/word swap)
- **Frontend:** `public/js/realtime.js`
- **Hỗ trợ:** `server.js` (`readTagsForDevice`), `datatypes.js`

### Import / Export KEPServerEX JSON
- **Backend chính:** `kepware-io.js` (`importProject`, `mergeProject`, `exportProject`)
- **CLI:** `import-cli.js`
- **Routes:** `routes/misc.js` (`/api/import`, `/api/import-json`, `/api/export`)
- **Frontend:** `public/js/import-export.js`

### Custom Tags / Expression Engine
- **Backend chính:** `expression-engine.js` (tokenizer, parser, evaluator)
- **Routes:** `routes/custom-tags.js`
- **Frontend:** `public/js/custom-tags.js`
- **Hỗ trợ:** `server.js` (`evaluateCustomTags`)

### External API Fetch (Live Fetch)
- **Backend chính:** `live_fetchers.js` (Clean Water, Raw Water, Viwater)
- **Routes:** `routes/api.js`, `routes/misc.js` (`/api/live-fetch`)
- **Hỗ trợ:** `server.js` (`processApiThingsBoardUploads`)
- **Frontend:** `public/js/live-fetch.js`

### Database Schema
- **Backend chính:** `db.js` (all table definitions, migrations)
- **Phụ thuộc:** `kepware-io.js`, mọi `routes/*.js`

### Frontend UI / Styling
- **Layout:** `public/index.html`, `public/login.html`
- **CSS:** `public/style.css`
- **JS Core:** `public/app.js`, `public/js/tree.js`
- **Feature JS:** `public/js/*.js`

### Authentication / Users
- **Backend:** `routes/auth.js`, `routes/users.js`, `server.js` (JWT middleware)
- **Frontend:** `public/js/auth.js`, `public/login.html`

## Luồng xử lý dữ liệu Channel (chi tiết)

### Đi vào (Input)

| Nguồn | Đường dẫn |
|--------|-----------|
| KEPServerEX JSON | `import-cli.js` → `kepware-io.js.importProject()` hoặc `mergeProject()` |
| API multipart | `routes/misc.js` POST `/api/import` → `kepware-io.js` |
| API JSON body | `routes/misc.js` POST `/api/import-json` → `kepware-io.js` |
| CRUD thủ công | UI → `routes/channels.js` POST/PUT/DELETE |

### Xử lý

**Import REPLACE mode (`importProject`)**
1. Xoá sạch `tags`, `devices`, `channels`, `project`
2. Đọc `project.channels[]`
3. Với mỗi channel:
   - Trích xuất: `common.ALLTYPES_NAME`, `servermain.MULTIPLE_TYPES_DEVICE_DRIVER`, `modbus_ethernet.CHANNEL_ETHERNET_PORT_NUMBER`
   - Lưu `raw_json` (đầy đủ KEPServerEX object, trừ `devices` array)
   - `INSERT INTO channels`
   - Với mỗi `channel.devices[]`:
     - Parse `DEVICE_ID_STRING` (`<ip>.slaveId`)
     - `INSERT INTO devices`
     - Với mỗi `device.tags[]`:
       - `INSERT INTO tags`

**Import MERGE mode (`mergeProject`)**
1. Không xoá dữ liệu cũ
2. Khớp channel theo `NAME`
   - Tồn tại → `UPDATE`
   - Mới → `INSERT`
3. Khớp device theo `channel_id + NAME`
   - Tồn tại → `UPDATE`, xoá tag cũ, insert tag mới
   - Mới → `INSERT` kèm tags
4. Channel/device không khớp → giữ nguyên

### Lưu trữ

**SQLite: `data/kepware.db`**

```
project (id, title, extra_json)
    └── channels (id, name, driver, port, sort_order, raw_json)
            └── devices (id, channel_id → channels.id, name, ip, slave_id,
                         scan_rate_ms, conn_timeout_s, req_time_ms,
                         byte_swap, word_swap, default_tb_device_id, raw_json)
                    └── tags (id, device_id → devices.id, name, address, data_type,
                              rw_access, scaling_type, sort_order, decimals,
                              realtime_enabled, tb_telemetry_enabled,
                              tb_telemetry_interval_ms, tb_attributes_enabled,
                              tb_attributes_interval_ms, raw_json)
```

- `ON DELETE CASCADE`: xoá channel → xoá devices → xoá tags
- `raw_json` trên mọi table giữ nguyên toàn bộ field KEPServerEX để export round-trip

### Đầu ra (Output)

| Đích | Luồng |
|------|--------|
| **Frontend Tree** | `GET /api/tree` → `channels` + `devices` + `COUNT(tags)` → `public/js/tree.js` render |
| **Frontend Channel List** | `GET /api/channels` → `channelWithCounts` |
| **Frontend Device List** | `GET /api/devices/:id` + `GET /api/devices/:deviceId/tags` |
| **ThingsBoard Upload** | `tbLoopTick()` mỗi 1s → JOIN channels-devices-tags → đọc Modbus → `uploadToThingsBoard()` |
| **API Fetch → ThingsBoard** | `apiTbLoopTick()` mỗi 1s → `live_fetchers.js` → normalize → `uploadApiDataToThingsBoard()` |
| **Export JSON** | `GET /api/export` → `kepware-io.js.exportProject()` → reconstruct KEPServerEX JSON |

---

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

## 4. Import file JSON — 3 cách, 2 chế độ

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

## 5. Export lại đúng định dạng KEPServerEX
```bash
curl -o export.json http://localhost:3000/api/export
```
Hoặc bấm nút **Export JSON** trên giao diện. Mọi field không được UI xử lý (timeout, retry, byte order,
`client_interfaces`, `mbeglobaldata`, v.v.) được giữ nguyên 1-1 vì mỗi channel/device/tag đều lưu kèm
`raw_json` gốc trong DB.

## 6. Cấu trúc DB (SQLite)
- `project` — tiêu đề + các field cấp project không được UI xử lý (`client_interfaces`, `mbeglobaldata`...)
- `channels` — 1 dòng / channel, có `raw_json` đầy đủ để round-trip
- `devices` — 1 dòng / device, có `ip`, `slave_id` tách riêng từ `DEVICE_ID_STRING`, có `raw_json`
- `tags` — 1 dòng / tag, có `raw_json` đầy đủ (kể cả các field scaling)

File DB nằm ở `data/kepware.db`. Sao lưu bằng cách copy file này (dừng service hoặc dùng
`sqlite3 data/kepware.db ".backup data/backup.db"` để backup an toàn khi đang chạy).

## 7. API chính (tham khảo nhanh)
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

## 8. Xem giá trị Tag Realtime (đọc thật từ PLC qua Modbus TCP)

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

## 9. Ghi chú khác
- Đây là công cụ soạn thảo cấu hình + xem realtime; **không** ghi giá trị xuống PLC, không có chức năng điều khiển.
- Bảng mã `TAG_DATA_TYPE` theo quy ước KEPServerEX: xem `datatypes.js`.





Fix custom tag insertion bugs