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
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_devices_channel ON devices(channel_id);
CREATE INDEX IF NOT EXISTS idx_tags_device ON tags(device_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_address ON tags(address);
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

module.exports = db;
