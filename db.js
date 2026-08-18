const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'kepware.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS project (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  title TEXT,
  extra_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  driver TEXT,
  port INTEGER,
  sort_order INTEGER DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ip TEXT,
  slave_id INTEGER,
  scan_rate_ms INTEGER,
  conn_timeout_s INTEGER,
  req_timeout_ms INTEGER,
  sort_order INTEGER DEFAULT 0,
  byte_swap INTEGER DEFAULT 0,
  word_swap INTEGER DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  data_type INTEGER,
  rw_access INTEGER,
  scan_rate_ms INTEGER,
  scaling_type INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  decimals INTEGER DEFAULT 2,
  realtime_enabled INTEGER DEFAULT 0,
  tb_telemetry_enabled INTEGER DEFAULT 0,
  tb_telemetry_interval_ms INTEGER DEFAULT 5000,
  tb_attributes_enabled INTEGER DEFAULT 0,
  tb_attributes_interval_ms INTEGER DEFAULT 5000,
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS thingsboard_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 80,
  protocol TEXT DEFAULT 'http',
  access_token TEXT NOT NULL,
  device_name TEXT,
  telemetry_interval_ms INTEGER DEFAULT 5000,
  attributes_interval_ms INTEGER DEFAULT 5000,
  request_timeout_ms INTEGER DEFAULT 5000,
  enabled INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS tag_tb_devices (
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  tb_device_id INTEGER NOT NULL REFERENCES thingsboard_devices(id) ON DELETE CASCADE,
  PRIMARY KEY (tag_id, tb_device_id)
);

CREATE TABLE IF NOT EXISTS api_tb_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key TEXT NOT NULL,
  tb_device_id INTEGER NOT NULL REFERENCES thingsboard_devices(id) ON DELETE CASCADE,
  enabled INTEGER DEFAULT 1,
  UNIQUE(api_key, tb_device_id)
);

CREATE TABLE IF NOT EXISTS api_fetch_configs (
  channel_key TEXT PRIMARY KEY,
  label TEXT,
  fetch_interval_ms INTEGER DEFAULT 10000,
  enabled INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_devices_channel ON devices(channel_id);
CREATE INDEX IF NOT EXISTS idx_tags_device ON tags(device_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_address ON tags(address);
CREATE INDEX IF NOT EXISTS idx_api_tb_mappings_key ON api_tb_mappings(api_key);
`);

// ---- Migration an toàn cho DB đã tồn tại từ bản trước (thêm cột nếu chưa có) ----
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('devices', 'byte_swap', 'INTEGER DEFAULT 0');
ensureColumn('devices', 'word_swap', 'INTEGER DEFAULT 0');
ensureColumn('tags', 'decimals', 'INTEGER DEFAULT 2');
ensureColumn('tags', 'realtime_enabled', 'INTEGER DEFAULT 0');
ensureColumn('tags', 'tb_telemetry_enabled', 'INTEGER DEFAULT 0');
ensureColumn('tags', 'tb_telemetry_interval_ms', 'INTEGER DEFAULT 5000');
ensureColumn('tags', 'tb_attributes_enabled', 'INTEGER DEFAULT 0');
ensureColumn('tags', 'tb_attributes_interval_ms', 'INTEGER DEFAULT 5000');
ensureColumn('thingsboard_devices', 'telemetry_interval_ms', 'INTEGER DEFAULT 5000');
ensureColumn('thingsboard_devices', 'attributes_interval_ms', 'INTEGER DEFAULT 5000');
ensureColumn('thingsboard_devices', 'protocol', "TEXT DEFAULT 'http'");
// Cho phép gán 1 thiết bị ThingsBoard "mặc định" ngay ở cấp Device: mọi tag của
// device này (đã bật Telemetry/Attributes) sẽ tự động gửi lên thiết bị TB này mà
// không cần gán riêng từng tag qua bảng tag_tb_devices nữa (xem processThingsBoardUploads
// trong server.js). Không đặt FOREIGN KEY cứng ở đây (SQLite ALTER TABLE hạn chế thêm
// FK vào bảng đã có sẵn) - việc dọn dẹp khi xoá thiết bị TB được xử lý thủ công ở
// server.js (DELETE /api/thingsboard-devices/:id).
ensureColumn('devices', 'default_tb_device_id', 'INTEGER');

// Migration for api_tb_mappings intervals
(function migrateApiTbMappings() {
  const cols = db.prepare("PRAGMA table_info(api_tb_mappings)").all().map(c => c.name);
  if (!cols.includes('telemetry_enabled')) {
    db.exec("ALTER TABLE api_tb_mappings ADD COLUMN telemetry_enabled INTEGER DEFAULT 1");
  }
  if (!cols.includes('attributes_enabled')) {
    db.exec("ALTER TABLE api_tb_mappings ADD COLUMN attributes_enabled INTEGER DEFAULT 1");
  }
  if (!cols.includes('telemetry_interval_ms')) {
    db.exec("ALTER TABLE api_tb_mappings ADD COLUMN telemetry_interval_ms INTEGER DEFAULT 5000");
  }
  if (!cols.includes('attributes_interval_ms')) {
    db.exec("ALTER TABLE api_tb_mappings ADD COLUMN attributes_interval_ms INTEGER DEFAULT 5000");
  }
})();

// Migration: đồng bộ cột protocol từ raw_json cho các DB cũ (trước đây protocol chỉ
// nằm trong raw_json, không phải cột thật, khiến API GET không trả về được và form
// Sửa luôn hiện lại HTTP mặc định dù thiết bị đã cấu hình HTTPS).
(function migrateTbProtocol() {
  const rows = db.prepare("SELECT id, raw_json, protocol FROM thingsboard_devices").all();
  const updRaw = db.prepare('UPDATE thingsboard_devices SET raw_json=? WHERE id=?');
  const updCol = db.prepare('UPDATE thingsboard_devices SET protocol=? WHERE id=?');
  rows.forEach((r) => {
    try {
      const obj = JSON.parse(r.raw_json || '{}');
      const protocolFromJson = obj.protocol === 'https' ? 'https' : null;
      if (!r.protocol || r.protocol === 'http') {
        if (protocolFromJson) updCol.run(protocolFromJson, r.id);
      }
      if (obj.protocol == null) {
        obj.protocol = r.protocol || protocolFromJson || 'http';
        updRaw.run(JSON.stringify(obj), r.id);
      }
    } catch (e) { /* ignore */ }
  });
})();

// Migration: tạo bảng api_fetch_configs và insert default rows nếu chưa có
(function migrateApiFetchConfigs() {
  db.exec(`CREATE TABLE IF NOT EXISTS api_fetch_configs (
    channel_key TEXT PRIMARY KEY,
    label TEXT,
    fetch_interval_ms INTEGER DEFAULT 10000
  )`);
  const count = db.prepare('SELECT COUNT(*) c FROM api_fetch_configs').get().c;
  if (count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO api_fetch_configs (channel_key, label, fetch_interval_ms) VALUES (?,?,?)');
    ins.run('clean_water', 'Nước Sạch', 10000);
    ins.run('raw_water', 'Nước Thô', 10000);
    ins.run('viwater', 'Viwater', 10000);
  }
})();

// ---------- USERS ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// Seed default admin if no users exist
const bcrypt = require('bcrypt');
const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (userCount === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
}

module.exports = db;