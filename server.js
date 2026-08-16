const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const db = require('./db');
const { importProject, mergeProject, exportProject } = require('./kepware-io');
const { DATA_TYPES } = require('./datatypes');
const { readTagsForDevice, closeConnection, closeAll } = require('./modbus-client');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// Chuyển chữ có dấu tiếng Việt thành không dấu (Điện -> Dien, áp -> ap...) trước khi
// sanitize, tránh việc sanitizeTbKey biến toàn bộ ký tự có dấu thành "_" làm mất
// nghĩa và dễ khiến 2 tên khác nhau bị trùng thành cùng 1 key (đè giá trị lên nhau).
function removeVietnameseTones(str) {
  let s = String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/đ/g, 'd').replace(/Đ/g, 'D');
  return s;
}

function sanitizeTbKey(key) {
  const noTone = removeVietnameseTones(key);
  return noTone.replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// ---------- helpers ----------
function channelWithCounts(ch) {
  const devCount = db.prepare('SELECT COUNT(*) c FROM devices WHERE channel_id=?').get(ch.id).c;
  const tagCount = db.prepare(
    `SELECT COUNT(*) c FROM tags WHERE device_id IN (SELECT id FROM devices WHERE channel_id=?)`
  ).get(ch.id).c;
  return { ...ch, deviceCount: devCount, tagCount };
}

function deviceWithCounts(dev) {
  const tagCount = db.prepare('SELECT COUNT(*) c FROM tags WHERE device_id=?').get(dev.id).c;
  let default_tb_device = null;
  if (dev.default_tb_device_id) {
    default_tb_device = db.prepare('SELECT id, name, host, port FROM thingsboard_devices WHERE id=?').get(dev.default_tb_device_id) || null;
  }
  return { ...dev, tagCount, default_tb_device };
}

// ---------- IMPORT / EXPORT ----------
function stripBom(str) {
  if (typeof str === 'string' && str.charCodeAt(0) === 0xfeff) return str.slice(1);
  return str;
}

app.post('/api/import', upload.single('file'), (req, res) => {
  try {
    let jsonText;
    if (req.file) jsonText = stripBom(req.file.buffer.toString('utf-8'));
    else if (req.body && Object.keys(req.body).length) jsonText = JSON.stringify(req.body);
    else return res.status(400).json({ error: 'Thiếu file JSON (field "file") hoặc JSON body' });

    const parsed = JSON.parse(jsonText);
    const mode = req.body?.mode === 'merge' || req.query.mode === 'merge' ? 'merge' : 'replace';
    const stats = mode === 'merge' ? mergeProject(parsed) : importProject(parsed);
    res.json({ ok: true, mode, imported: stats });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Import trực tiếp bằng JSON body (dùng cho script/CLI, không cần multipart)
app.post('/api/import-json', (req, res) => {
  try {
    const mode = req.query.mode === 'merge' ? 'merge' : 'replace';
    const stats = mode === 'merge' ? mergeProject(req.body) : importProject(req.body);
    res.json({ ok: true, mode, imported: stats });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/export', (req, res) => {
  try {
    const project = exportProject();
    res.setHeader('Content-Disposition', 'attachment; filename="kepware-export.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(project, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reset', (req, res) => {
  db.exec('DELETE FROM tags; DELETE FROM devices; DELETE FROM channels; DELETE FROM project; DELETE FROM thingsboard_devices; DELETE FROM tag_tb_devices;');
  res.json({ ok: true });
});

// ---------- DASHBOARD / STATS ----------
app.get('/api/stats', (req, res) => {
  const totals = {
    channels: db.prepare('SELECT COUNT(*) c FROM channels').get().c,
    devices: db.prepare('SELECT COUNT(*) c FROM devices').get().c,
    tags: db.prepare('SELECT COUNT(*) c FROM tags').get().c,
  };
  const byDataType = db.prepare(
    'SELECT data_type, COUNT(*) count FROM tags GROUP BY data_type ORDER BY count DESC'
  ).all().map((r) => ({ ...r, dataTypeName: DATA_TYPES[r.data_type] || `Unknown(${r.data_type})` }));

  const byDeviceScanRate = db.prepare(
    'SELECT scan_rate_ms, COUNT(*) count FROM devices GROUP BY scan_rate_ms ORDER BY count DESC'
  ).all();

  const duplicateIPs = db.prepare(
    `SELECT ip, COUNT(*) count, GROUP_CONCAT(name, ', ') devices
     FROM devices WHERE ip IS NOT NULL GROUP BY ip HAVING COUNT(*) > 1`
  ).all();

  res.json({ totals, byDataType, byDeviceScanRate, duplicateIPs });
});

app.get('/api/validate', (req, res) => {
  const dupTagNames = db.prepare(
    `SELECT device_id, name, COUNT(*) count FROM tags GROUP BY device_id, name HAVING COUNT(*) > 1`
  ).all();
  const dupTagAddress = db.prepare(
    `SELECT device_id, address, COUNT(*) count FROM tags WHERE address IS NOT NULL AND address != ''
     GROUP BY device_id, address HAVING COUNT(*) > 1`
  ).all();
  const dupDeviceNames = db.prepare(
    `SELECT channel_id, name, COUNT(*) count FROM devices GROUP BY channel_id, name HAVING COUNT(*) > 1`
  ).all();
  const dupChannelNames = db.prepare(
    `SELECT name, COUNT(*) count FROM channels GROUP BY name HAVING COUNT(*) > 1`
  ).all();
  const emptyAddress = db.prepare(`SELECT COUNT(*) c FROM tags WHERE address IS NULL OR address = ''`).get().c;

  res.json({ dupTagNames, dupTagAddress, dupDeviceNames, dupChannelNames, emptyAddressCount: emptyAddress });
});

// ---------- CHANNELS ----------
app.get('/api/channels', (req, res) => {
  const rows = db.prepare('SELECT id, name, driver, port, sort_order FROM channels ORDER BY sort_order, id').all();
  res.json(rows.map(channelWithCounts));
});

app.post('/api/channels', (req, res) => {
  const { name, driver = 'Modbus TCP/IP Ethernet', port = 502 } = req.body;
  if (!name) return res.status(400).json({ error: 'Thiếu tên channel' });
  const raw = {
    'common.ALLTYPES_NAME': name,
    'servermain.MULTIPLE_TYPES_DEVICE_DRIVER': driver,
    'modbus_ethernet.CHANNEL_ETHERNET_PORT_NUMBER': port,
  };
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM channels').get().m;
  const info = db.prepare('INSERT INTO channels (name, driver, port, sort_order, raw_json) VALUES (?,?,?,?,?)')
    .run(name, driver, port, maxOrder + 1, JSON.stringify(raw));
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/channels/:id', (req, res) => {
  const { name, driver, port } = req.body;
  const ch = db.prepare('SELECT * FROM channels WHERE id=?').get(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Không tìm thấy channel' });
  db.prepare('UPDATE channels SET name=?, driver=?, port=? WHERE id=?')
    .run(name ?? ch.name, driver ?? ch.driver, port ?? ch.port, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/channels/:id', (req, res) => {
  db.prepare('DELETE FROM channels WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- DEVICES ----------
app.get('/api/channels/:channelId/devices', (req, res) => {
  const rows = db.prepare('SELECT * FROM devices WHERE channel_id=? ORDER BY sort_order, id').all(req.params.channelId);
  res.json(rows.map(deviceWithCounts));
});

app.get('/api/devices/:id', (req, res) => {
  const dev = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if (!dev) return res.status(404).json({ error: 'Không tìm thấy device' });
  res.json(deviceWithCounts(dev));
});

app.post('/api/devices', (req, res) => {
  const { channel_id, name, ip, slave_id = 1, scan_rate_ms = 1000, conn_timeout_s = 1, req_timeout_ms = 1000, byte_swap = false, word_swap = false, default_tb_device_id = null } = req.body;
  if (!channel_id || !name || !ip) return res.status(400).json({ error: 'Thiếu channel_id / name / ip' });
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return res.status(400).json({ error: 'IP không hợp lệ' });
  if (slave_id < 0 || slave_id > 255) return res.status(400).json({ error: 'Slave ID phải trong khoảng 0-255' });
  if (default_tb_device_id != null && !db.prepare('SELECT id FROM thingsboard_devices WHERE id=?').get(default_tb_device_id)) {
    return res.status(400).json({ error: 'Thiết bị ThingsBoard không tồn tại' });
  }

  const raw = {
    'common.ALLTYPES_NAME': name,
    'servermain.DEVICE_ID_STRING': `<${ip}>.${slave_id}`,
    'servermain.DEVICE_SCAN_MODE_RATE_MS': scan_rate_ms,
    'servermain.DEVICE_CONNECTION_TIMEOUT_SECONDS': conn_timeout_s,
    'servermain.DEVICE_REQUEST_TIMEOUT_MILLISECONDS': req_timeout_ms,
    'modbus_ethernet.DEVICE_ETHERNET_PORT_NUMBER': 502,
  };
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM devices WHERE channel_id=?').get(channel_id).m;
  const info = db.prepare(
    `INSERT INTO devices (channel_id,name,ip,slave_id,scan_rate_ms,conn_timeout_s,req_timeout_ms,sort_order,byte_swap,word_swap,default_tb_device_id,raw_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(channel_id, name, ip, slave_id, scan_rate_ms, conn_timeout_s, req_timeout_ms, maxOrder + 1, byte_swap ? 1 : 0, word_swap ? 1 : 0, default_tb_device_id || null, JSON.stringify(raw));
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/devices/:id', (req, res) => {
  const dev = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if (!dev) return res.status(404).json({ error: 'Không tìm thấy device' });
  const { name, ip, slave_id, scan_rate_ms, conn_timeout_s, req_timeout_ms, byte_swap, word_swap } = req.body;
  if (ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return res.status(400).json({ error: 'IP không hợp lệ' });
  if (slave_id != null && (slave_id < 0 || slave_id > 255)) return res.status(400).json({ error: 'Slave ID phải trong khoảng 0-255' });

  // default_tb_device_id: cho phép gửi null để BỎ gán (khác với undefined = không đổi),
  // nên phải kiểm tra sự có mặt của field trong body thay vì dùng "??".
  let defaultTbDeviceId = dev.default_tb_device_id;
  if ('default_tb_device_id' in req.body) {
    const v = req.body.default_tb_device_id;
    if (v == null || v === '') {
      defaultTbDeviceId = null;
    } else {
      if (!db.prepare('SELECT id FROM thingsboard_devices WHERE id=?').get(v)) {
        return res.status(400).json({ error: 'Thiết bị ThingsBoard không tồn tại' });
      }
      defaultTbDeviceId = v;
    }
  }

  db.prepare(
    `UPDATE devices SET name=?, ip=?, slave_id=?, scan_rate_ms=?, conn_timeout_s=?, req_timeout_ms=?, byte_swap=?, word_swap=?, default_tb_device_id=? WHERE id=?`
  ).run(
    name ?? dev.name, ip ?? dev.ip, slave_id ?? dev.slave_id,
    scan_rate_ms ?? dev.scan_rate_ms, conn_timeout_s ?? dev.conn_timeout_s, req_timeout_ms ?? dev.req_timeout_ms,
    byte_swap != null ? (byte_swap ? 1 : 0) : dev.byte_swap,
    word_swap != null ? (word_swap ? 1 : 0) : dev.word_swap,
    defaultTbDeviceId,
    req.params.id
  );
  res.json({ ok: true });
});

app.delete('/api/devices/:id', (req, res) => {
  db.prepare('DELETE FROM devices WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/devices/:id/duplicate', (req, res) => {
  const dev = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if (!dev) return res.status(404).json({ error: 'Không tìm thấy device' });
  const { newIp, newName } = req.body;
  const ip = newIp || dev.ip;
  const name = newName || `${dev.name}_COPY`;
  const rawObj = JSON.parse(dev.raw_json);
  rawObj['common.ALLTYPES_NAME'] = name;
  rawObj['servermain.DEVICE_ID_STRING'] = `<${ip}>.${dev.slave_id}`;

  const tx = db.transaction(() => {
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM devices WHERE channel_id=?').get(dev.channel_id).m;
    const info = db.prepare(
      `INSERT INTO devices (channel_id,name,ip,slave_id,scan_rate_ms,conn_timeout_s,req_timeout_ms,sort_order,byte_swap,word_swap,default_tb_device_id,raw_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(dev.channel_id, name, ip, dev.slave_id, dev.scan_rate_ms, dev.conn_timeout_s, dev.req_timeout_ms, maxOrder + 1, dev.byte_swap, dev.word_swap, dev.default_tb_device_id, JSON.stringify(rawObj));
    const newDeviceId = info.lastInsertRowid;

    const tags = db.prepare('SELECT * FROM tags WHERE device_id=? ORDER BY sort_order, id').all(dev.id);
    const insTag = db.prepare(
      `INSERT INTO tags (device_id,name,address,data_type,rw_access,scaling_type,sort_order,raw_json)
       VALUES (?,?,?,?,?,?,?,?)`
    );
    tags.forEach((t) => {
      insTag.run(newDeviceId, t.name, t.address, t.data_type, t.rw_access, t.scaling_type, t.sort_order, t.raw_json);
    });
    return newDeviceId;
  });

  const newDeviceId = tx();
  res.json({ id: newDeviceId });
});

// ---------- TAGS ----------
app.get('/api/devices/:deviceId/tags', (req, res) => {
  const { search = '', sort = 'sort_order', dir = 'asc', page = 1, pageSize = 200, realtime, tb } = req.query;
  const allowedSort = ['name', 'address', 'data_type', 'rw_access', 'scaling_type', 'sort_order', 'id'];
  const sortCol = allowedSort.includes(sort) ? sort : 'sort_order';
  const sortDir = dir === 'desc' ? 'DESC' : 'ASC';

  let where = 'WHERE device_id = ?';
  const params = [req.params.deviceId];
  if (search) {
    where += ' AND (name LIKE ? OR address LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (realtime == '1') {
    where += ' AND realtime_enabled = 1';
  }
  if (tb == '1') {
    where += ' AND (tb_telemetry_enabled = 1 OR tb_attributes_enabled = 1)';
  }

  const total = db.prepare(`SELECT COUNT(*) c FROM tags ${where}`).get(...params).c;
  const offset = (Number(page) - 1) * Number(pageSize);
  const rows = db.prepare(
    `SELECT * FROM tags ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`
  ).all(...params, Number(pageSize), offset);

  const tagIds = rows.map((r) => r.id);
  const tbMap = new Map();
  if (tagIds.length) {
    const placeholders = tagIds.map(() => '?').join(',');
    const mappings = db.prepare(`SELECT tag_id, tb.id, tb.name, tb.host, tb.port FROM tag_tb_devices m JOIN thingsboard_devices tb ON tb.id = m.tb_device_id WHERE m.tag_id IN (${placeholders})`).all(...tagIds);
    mappings.forEach((m) => {
      if (!tbMap.has(m.tag_id)) tbMap.set(m.tag_id, []);
      tbMap.get(m.tag_id).push({ id: m.id, name: m.name, host: m.host, port: m.port });
    });
  }
  // Gộp thêm thiết bị TB được gán mặc định ở cấp Device (nếu có) vào danh sách của
  // MỌI tag thuộc device này - đây là cơ chế chính giúp không cần gán riêng từng tag.
  const currentDevice = db.prepare('SELECT default_tb_device_id FROM devices WHERE id=?').get(req.params.deviceId);
  if (currentDevice?.default_tb_device_id) {
    const defTb = db.prepare('SELECT id, name, host, port FROM thingsboard_devices WHERE id=?').get(currentDevice.default_tb_device_id);
    if (defTb) {
      rows.forEach((r) => {
        if (!tbMap.has(r.id)) tbMap.set(r.id, []);
        if (!tbMap.get(r.id).some((tb) => tb.id === defTb.id)) {
          tbMap.get(r.id).push({ ...defTb, inherited: true });
        }
      });
    }
  }

  res.json({ total, page: Number(page), pageSize: Number(pageSize), rows: rows.map((r) => ({ ...r, tb_devices: tbMap.get(r.id) || [] })) });
});

app.get('/api/tb-devices/:tbDeviceId/tags', (req, res) => {
  const { search = '', sort = 'sort_order', dir = 'asc', page = 1, pageSize = 200 } = req.query;
  const allowedSort = ['name', 'address', 'data_type', 'rw_access', 'scaling_type', 'sort_order', 'id'];
  const sortCol = allowedSort.includes(sort) ? sort : 'sort_order';
  const sortDir = dir === 'desc' ? 'DESC' : 'ASC';

  // Bao gồm cả tag được gán riêng qua tag_tb_devices LẪN tag thuộc device có
  // default_tb_device_id = thiết bị TB này (gán ở cấp Device).
  let where = `WHERE (t.id IN (SELECT tag_id FROM tag_tb_devices WHERE tb_device_id = ?) OR t.device_id IN (SELECT id FROM devices WHERE default_tb_device_id = ?))`;
  const params = [req.params.tbDeviceId, req.params.tbDeviceId];
  if (search) {
    where += ' AND (t.name LIKE ? OR t.address LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = db.prepare(`SELECT COUNT(*) c FROM tags t ${where}`).get(...params).c;
  const offset = (Number(page) - 1) * Number(pageSize);
  const rows = db.prepare(
    `SELECT t.* FROM tags t ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`
  ).all(...params, Number(pageSize), offset);

  const tagIds = rows.map((r) => r.id);
  const tbMap = new Map();
  if (tagIds.length) {
    const placeholders = tagIds.map(() => '?').join(',');
    const mappings = db.prepare(`SELECT tag_id, tb.id, tb.name, tb.host, tb.port FROM tag_tb_devices m JOIN thingsboard_devices tb ON tb.id = m.tb_device_id WHERE m.tag_id IN (${placeholders})`).all(...tagIds);
    mappings.forEach((m) => {
      if (!tbMap.has(m.tag_id)) tbMap.set(m.tag_id, []);
      tbMap.get(m.tag_id).push({ id: m.id, name: m.name, host: m.host, port: m.port });
    });
  }

  res.json({ total, page: Number(page), pageSize: Number(pageSize), rows: rows.map((r) => ({ ...r, tb_devices: tbMap.get(r.id) || [] })) });
});

app.post('/api/tags', (req, res) => {
  const { device_id, name, address, data_type = 5, rw_access = 0, scaling = null, decimals = 2, realtime_enabled = 0, tb_telemetry_enabled = 0, tb_telemetry_interval_ms = 5000, tb_attributes_enabled = 0, tb_attributes_interval_ms = 5000 } = req.body;
  if (!device_id || !name || address == null) return res.status(400).json({ error: 'Thiếu device_id / name / address' });

  const raw = {
    'common.ALLTYPES_NAME': name,
    'servermain.TAG_ADDRESS': String(address),
    'servermain.TAG_DATA_TYPE': data_type,
    'servermain.TAG_READ_WRITE_ACCESS': rw_access,
    'servermain.TAG_SCALING_TYPE': scaling ? 1 : 0,
  };
  if (scaling) {
    raw['servermain.TAG_SCALING_RAW_LOW'] = scaling.rawLow;
    raw['servermain.TAG_SCALING_RAW_HIGH'] = scaling.rawHigh;
    raw['servermain.TAG_SCALING_SCALED_DATA_TYPE'] = scaling.scaledDataType;
    raw['servermain.TAG_SCALING_SCALED_LOW'] = scaling.scaledLow;
    raw['servermain.TAG_SCALING_SCALED_HIGH'] = scaling.scaledHigh;
    raw['servermain.TAG_SCALING_CLAMP_LOW'] = !!scaling.clampLow;
    raw['servermain.TAG_SCALING_CLAMP_HIGH'] = !!scaling.clampHigh;
    raw['servermain.TAG_SCALING_NEGATE_VALUE'] = !!scaling.negate;
    raw['servermain.TAG_SCALING_UNITS'] = scaling.units || '';
  }

  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM tags WHERE device_id=?').get(device_id).m;
  const info = db.prepare(
    `INSERT INTO tags (device_id,name,address,data_type,rw_access,scaling_type,sort_order,decimals,realtime_enabled,tb_telemetry_enabled,tb_telemetry_interval_ms,tb_attributes_enabled,tb_attributes_interval_ms,raw_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(device_id, name, String(address), data_type, rw_access, scaling ? 1 : 0, maxOrder + 1, Number.isInteger(decimals) ? decimals : 2, realtime_enabled ? 1 : 0, tb_telemetry_enabled ? 1 : 0, Number.isInteger(tb_telemetry_interval_ms) ? tb_telemetry_interval_ms : 5000, tb_attributes_enabled ? 1 : 0, Number.isInteger(tb_attributes_interval_ms) ? tb_attributes_interval_ms : 5000, JSON.stringify(raw));
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/tags/:id', (req, res) => {
  const tag = db.prepare('SELECT * FROM tags WHERE id=?').get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Không tìm thấy tag' });
  const raw = JSON.parse(tag.raw_json);
  const { name, address, data_type, rw_access, scaling, decimals, realtime_enabled, tb_telemetry_enabled, tb_telemetry_interval_ms, tb_attributes_enabled, tb_attributes_interval_ms } = req.body;

  if (name != null) raw['common.ALLTYPES_NAME'] = name;
  if (address != null) raw['servermain.TAG_ADDRESS'] = String(address);
  if (data_type != null) raw['servermain.TAG_DATA_TYPE'] = data_type;
  if (rw_access != null) raw['servermain.TAG_READ_WRITE_ACCESS'] = rw_access;
  if (scaling !== undefined) {
    raw['servermain.TAG_SCALING_TYPE'] = scaling ? 1 : 0;
    if (scaling) {
      raw['servermain.TAG_SCALING_RAW_LOW'] = scaling.rawLow;
      raw['servermain.TAG_SCALING_RAW_HIGH'] = scaling.rawHigh;
      raw['servermain.TAG_SCALING_SCALED_DATA_TYPE'] = scaling.scaledDataType;
      raw['servermain.TAG_SCALING_SCALED_LOW'] = scaling.scaledLow;
      raw['servermain.TAG_SCALING_SCALED_HIGH'] = scaling.scaledHigh;
      raw['servermain.TAG_SCALING_CLAMP_LOW'] = !!scaling.clampLow;
      raw['servermain.TAG_SCALING_CLAMP_HIGH'] = !!scaling.clampHigh;
      raw['servermain.TAG_SCALING_NEGATE_VALUE'] = !!scaling.negate;
      raw['servermain.TAG_SCALING_UNITS'] = scaling.units || '';
    }
  }

  db.prepare(
    `UPDATE tags SET name=?, address=?, data_type=?, rw_access=?, scaling_type=?, decimals=?, realtime_enabled=?, tb_telemetry_enabled=?, tb_telemetry_interval_ms=?, tb_attributes_enabled=?, tb_attributes_interval_ms=?, raw_json=? WHERE id=?`
  ).run(
    name ?? tag.name, address != null ? String(address) : tag.address, data_type ?? tag.data_type,
    rw_access ?? tag.rw_access,
    scaling !== undefined ? (scaling ? 1 : 0) : tag.scaling_type,
    Number.isInteger(decimals) ? decimals : tag.decimals,
    realtime_enabled != null ? (realtime_enabled ? 1 : 0) : tag.realtime_enabled,
    tb_telemetry_enabled != null ? (tb_telemetry_enabled ? 1 : 0) : tag.tb_telemetry_enabled,
    Number.isInteger(tb_telemetry_interval_ms) ? tb_telemetry_interval_ms : tag.tb_telemetry_interval_ms,
    tb_attributes_enabled != null ? (tb_attributes_enabled ? 1 : 0) : tag.tb_attributes_enabled,
    Number.isInteger(tb_attributes_interval_ms) ? tb_attributes_interval_ms : tag.tb_attributes_interval_ms,
    JSON.stringify(raw), req.params.id
  );
  res.json({ ok: true });
});

app.delete('/api/tags/:id', (req, res) => {
  db.prepare('DELETE FROM tags WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/tags/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Thiếu danh sách ids' });
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM tags WHERE id IN (${placeholders})`).run(...ids);
  res.json({ ok: true, deleted: ids.length });
});

app.post('/api/tags/bulk-update', (req, res) => {
  const { ids, patch } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Thiếu danh sách ids' });
  const tx = db.transaction(() => {
    ids.forEach((id) => {
      const tag = db.prepare('SELECT * FROM tags WHERE id=?').get(id);
      if (!tag) return;
      const raw = JSON.parse(tag.raw_json);
      if (patch.rw_access != null) raw['servermain.TAG_READ_WRITE_ACCESS'] = patch.rw_access;
      const sets = ['rw_access=?', 'raw_json=?'];
      const vals = [patch.rw_access ?? tag.rw_access, JSON.stringify(raw)];
      if (patch.realtime_enabled != null) { sets.push('realtime_enabled=?'); vals.push(patch.realtime_enabled ? 1 : 0); }
      vals.push(id);
      db.prepare(`UPDATE tags SET ${sets.join(', ')} WHERE id=?`).run(...vals);
    });
  });
  tx();
  res.json({ ok: true, updated: ids.length });
});

// Thêm tag hàng loạt từ CSV/TSV dán vào (name, address, data_type, scan_rate)
app.post('/api/tags/bulk-create', (req, res) => {
  const { device_id, csv } = req.body;
  if (!device_id || !csv) return res.status(400).json({ error: 'Thiếu device_id / csv' });

  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  const insTag = db.prepare(
    `INSERT INTO tags (device_id,name,address,data_type,rw_access,scaling_type,sort_order,raw_json)
     VALUES (?,?,?,?,?,0,?,?)`
  );
  let maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM tags WHERE device_id=?').get(device_id).m;
  const created = [];
  const errors = [];

  const tx = db.transaction(() => {
    lines.forEach((line, idx) => {
      const parts = line.split(/\t|,/).map((p) => p.trim());
      const [name, address, dataType] = parts;
      if (!name || !address) { errors.push({ line: idx + 1, reason: 'Thiếu tên hoặc địa chỉ' }); return; }
      const dt = dataType ? Number(dataType) : 5;
      maxOrder++;
      const raw = {
        'common.ALLTYPES_NAME': name,
        'servermain.TAG_ADDRESS': address,
        'servermain.TAG_DATA_TYPE': dt,
        'servermain.TAG_READ_WRITE_ACCESS': 0,
        'servermain.TAG_SCALING_TYPE': 0,
      };
      const info = insTag.run(device_id, name, address, dt, 0, maxOrder, JSON.stringify(raw));
      created.push(info.lastInsertRowid);
    });
  });
  tx();
  res.json({ ok: true, created: created.length, errors });
});

// ---------- REALTIME (đọc giá trị THẬT từ PLC qua Modbus TCP) ----------
// Chỉ đọc khi được gọi rõ ràng (người dùng bật Realtime trên UI) - không tự polling nền.
app.post('/api/devices/:id/live-read', async (req, res) => {
  const dev = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if (!dev) return res.status(404).json({ error: 'Không tìm thấy device' });
  if (!dev.ip) return res.status(400).json({ error: 'Device chưa có IP hợp lệ' });

  const { tagIds } = req.body;
  if (!Array.isArray(tagIds) || !tagIds.length) return res.status(400).json({ error: 'Thiếu danh sách tagIds' });

  const placeholders = tagIds.map(() => '?').join(',');
  const tags = db.prepare(`SELECT * FROM tags WHERE id IN (${placeholders}) AND device_id=?`).all(...tagIds, dev.id);
  if (!tags.length) return res.json({ values: {} });

  try {
    const values = await readTagsForDevice(dev, tags);
    res.json({ values });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Đóng kết nối Modbus TCP tới 1 device (khi rời trang / tắt Realtime)
app.post('/api/devices/:id/live-disconnect', (req, res) => {
  closeConnection(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- THINGSBOARD ----------
app.get('/api/thingsboard-devices', (req, res) => {
  const rows = db.prepare('SELECT * FROM thingsboard_devices ORDER BY sort_order, id').all();
  res.json(rows);
});

app.post('/api/thingsboard-devices', (req, res) => {
  const { name, host, port = 80, access_token, device_name, protocol = 'http', telemetry_interval_ms = 5000, attributes_interval_ms = 5000, request_timeout_ms = 5000, enabled = true } = req.body;
  if (!name || !host || !access_token) return res.status(400).json({ error: 'Thiếu tên / host / access_token' });
  const protocolNorm = protocol === 'https' ? 'https' : 'http';
  const raw = { name, host, port, access_token, device_name, protocol: protocolNorm, telemetry_interval_ms, attributes_interval_ms, request_timeout_ms, enabled };
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM thingsboard_devices').get().m;
  const info = db.prepare('INSERT INTO thingsboard_devices (name, host, port, protocol, access_token, device_name, telemetry_interval_ms, attributes_interval_ms, request_timeout_ms, enabled, sort_order, raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(name, host, port, protocolNorm, access_token, device_name || null, telemetry_interval_ms, attributes_interval_ms, request_timeout_ms, enabled ? 1 : 0, maxOrder + 1, JSON.stringify(raw));
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/thingsboard-devices/:id', (req, res) => {
  const tb = db.prepare('SELECT * FROM thingsboard_devices WHERE id=?').get(req.params.id);
  if (!tb) return res.status(404).json({ error: 'Không tìm thấy thiết bị ThingsBoard' });
  const { name, host, port, access_token, device_name, protocol, telemetry_interval_ms, attributes_interval_ms, request_timeout_ms, enabled } = req.body;
  const protocolNorm = protocol != null ? (protocol === 'https' ? 'https' : 'http') : tb.protocol;
  db.prepare('UPDATE thingsboard_devices SET name=?, host=?, port=?, protocol=?, access_token=?, device_name=?, telemetry_interval_ms=?, attributes_interval_ms=?, request_timeout_ms=?, enabled=? WHERE id=?')
    .run(name ?? tb.name, host ?? tb.host, port ?? tb.port, protocolNorm, access_token ?? tb.access_token, device_name ?? tb.device_name, telemetry_interval_ms ?? tb.telemetry_interval_ms, attributes_interval_ms ?? tb.attributes_interval_ms, request_timeout_ms ?? tb.request_timeout_ms, enabled != null ? (enabled ? 1 : 0) : tb.enabled, req.params.id);
  const raw = JSON.parse(tb.raw_json);
  if (name != null) raw.name = name;
  if (host != null) raw.host = host;
  if (port != null) raw.port = port;
  if (access_token != null) raw.access_token = access_token;
  if (device_name != null) raw.device_name = device_name;
  if (protocol != null) raw.protocol = protocol;
  if (telemetry_interval_ms != null) raw.telemetry_interval_ms = telemetry_interval_ms;
  if (attributes_interval_ms != null) raw.attributes_interval_ms = attributes_interval_ms;
  if (request_timeout_ms != null) raw.request_timeout_ms = request_timeout_ms;
  if (enabled != null) raw.enabled = enabled;
  db.prepare('UPDATE thingsboard_devices SET raw_json=? WHERE id=?').run(JSON.stringify(raw), req.params.id);
  res.json({ ok: true });
});

app.delete('/api/thingsboard-devices/:id', (req, res) => {
  db.prepare('DELETE FROM thingsboard_devices WHERE id=?').run(req.params.id);
  db.prepare('DELETE FROM tag_tb_devices WHERE tb_device_id=?').run(req.params.id);
  // Bỏ gán ở cấp Device cho các device đang trỏ tới thiết bị TB vừa bị xoá
  db.prepare('UPDATE devices SET default_tb_device_id=NULL WHERE default_tb_device_id=?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/tags/:tagId/tb-devices', (req, res) => {
  const rows = db.prepare('SELECT tb.* FROM thingsboard_devices tb JOIN tag_tb_devices m ON tb.id = m.tb_device_id WHERE m.tag_id=? ORDER BY tb.sort_order, tb.id').all(req.params.tagId);
  res.json(rows);
});

app.post('/api/tags/:tagId/tb-devices', (req, res) => {
  const { tb_device_id } = req.body;
  if (!tb_device_id) return res.status(400).json({ error: 'Thiếu tb_device_id' });
  db.prepare('INSERT OR IGNORE INTO tag_tb_devices (tag_id, tb_device_id) VALUES (?,?)').run(req.params.tagId, tb_device_id);
  res.json({ ok: true });
});

app.delete('/api/tags/:tagId/tb-devices/:tbDeviceId', (req, res) => {
  db.prepare('DELETE FROM tag_tb_devices WHERE tag_id=? AND tb_device_id=?').run(req.params.tagId, req.params.tbDeviceId);
  res.json({ ok: true });
});

app.get('/api/tb-stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c FROM thingsboard_devices').get().c;
  const enabled = db.prepare('SELECT COUNT(*) c FROM thingsboard_devices WHERE enabled=1').get().c;
  const mappings = db.prepare('SELECT COUNT(*) c FROM tag_tb_devices').get().c;
  res.json({ total, enabled, mappings });
});

// ---------- tree (channel > device > tagCount), dùng cho sidebar ----------
app.get('/api/tree', (req, res) => {
  const channels = db.prepare('SELECT id, name, driver, port, sort_order FROM channels ORDER BY sort_order, id').all();
  const devStmt = db.prepare('SELECT id, name FROM devices WHERE channel_id=? ORDER BY sort_order, id');
  const tagCountStmt = db.prepare('SELECT COUNT(*) c FROM tags WHERE device_id=?');
  const tree = channels.map((ch) => ({
    ...ch,
    devices: devStmt.all(ch.id).map((d) => ({ ...d, tagCount: tagCountStmt.get(d.id).c })),
  }));
  res.json(tree);
});

app.get('/api/data-types', (req, res) => res.json(DATA_TYPES));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---------- THINGSBOARD UPLOAD SERVICE ----------
const tbLastTelemetry = new Map();
const tbLastAttributes = new Map();

async function uploadToThingsBoard(tbDevice, tags, isAttributes) {
  if (!tbDevice.enabled || !tags.length) return;
  const protocol = tbDevice.protocol === 'https' ? 'https' : 'http';
  const url = `${protocol}://${tbDevice.host}:${tbDevice.port}/api/v1/${tbDevice.access_token}/${isAttributes ? 'attributes' : 'telemetry'}`;
  const payload = {};
  tags.forEach((tag) => {
    let value = tag.last_value;
    if (value === null || value === undefined) return;
    if (typeof value === 'boolean') value = value ? 'true' : 'false';
    else if (typeof value === 'bigint') value = value.toString();
    else if (typeof value === 'number' && (!Number.isFinite(value))) return;
    let key = sanitizeTbKey(`${tag.channel_name || ''}_${tag.device_name || ''}_${tag.name}`);
    if (!key) key = `tag_${tag.id}`;
    // Nếu 2 tag khác nhau vẫn cho ra cùng 1 key sau khi sanitize (trùng tên sau khi
    // bỏ dấu/ký tự đặc biệt), thêm hậu tố id để không bị đè giá trị lên nhau.
    if (Object.prototype.hasOwnProperty.call(payload, key)) key = `${key}_${tag.id}`;
    payload[key] = value;
  });
  if (!Object.keys(payload).length) return;

  try {
    const response = await axios.post(url, payload, { timeout: tbDevice.request_timeout_ms || 5000 });
    console.log(`[TB] Upload ${isAttributes ? 'attributes' : 'telemetry'} ${Object.keys(payload).length} tag to ${tbDevice.name} OK`);
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    let hint = '';
    if (!status && /socket hang up|ECONNRESET|ECONNREFUSED/i.test(err.message || '')) {
      hint = ` [Gợi ý: không nhận được phản hồi HTTP nào từ server - kiểm tra lại protocol (http/https) và port trong cấu hình "${tbDevice.name}" (URL đang gọi: ${url})]`;
    }
    console.error(`[TB] Upload to ${tbDevice.name} failed: ${err.message}${status ? ` (status ${status})` : ''}${body ? ` - ${typeof body === 'string' ? body : JSON.stringify(body)}` : ''}${hint}`);
  }
}

// Chạy tối đa `limit` tác vụ song song (dùng để đọc nhiều device Modbus cùng lúc -
// mỗi device là 1 socket riêng nên đọc song song an toàn, chỉ cần đọc tuần tự BÊN TRONG
// 1 device vì Modbus TCP không hỗ trợ nhiều giao dịch song song trên cùng 1 socket).
async function mapWithConcurrency(items, limit, fn) {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      await fn(items[cur], cur);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
}

const DEVICE_READ_CONCURRENCY = 8; // số device đọc Modbus song song trong 1 chu kỳ

const tagColumnsForTb = 't.id, t.name, t.device_id, t.address, t.data_type, t.decimals, t.scaling_type, t.raw_json, d.name as device_name, ch.name as channel_name';
// Lấy tag cần gửi lên 1 thiết bị TB cụ thể: bao gồm CẢ 2 nguồn
//  (1) gán riêng từng tag qua bảng tag_tb_devices (cách cũ), VÀ
//  (2) gán 1 lần ở cấp Device (devices.default_tb_device_id) - tag chỉ cần bật
//      Telemetry/Attributes là tự động được gửi, không cần gán riêng nữa.
const tbTelemetryTagsStmt = db.prepare(`
  SELECT DISTINCT ${tagColumnsForTb}
  FROM tags t
  JOIN devices d ON t.device_id = d.id
  JOIN channels ch ON d.channel_id = ch.id
  LEFT JOIN tag_tb_devices m ON t.id = m.tag_id AND m.tb_device_id = ?
  WHERE (m.tag_id IS NOT NULL OR d.default_tb_device_id = ?) AND t.tb_telemetry_enabled=1
`);
const tbAttributesTagsStmt = db.prepare(`
  SELECT DISTINCT ${tagColumnsForTb}
  FROM tags t
  JOIN devices d ON t.device_id = d.id
  JOIN channels ch ON d.channel_id = ch.id
  LEFT JOIN tag_tb_devices m ON t.id = m.tag_id AND m.tb_device_id = ?
  WHERE (m.tag_id IS NOT NULL OR d.default_tb_device_id = ?) AND t.tb_attributes_enabled=1
`);
const deviceByIdStmt = db.prepare('SELECT * FROM devices WHERE id=?');

/**
 * 1 chu kỳ gửi dữ liệu lên ThingsBoard:
 * - Chỉ xử lý các thiết bị TB đã tới hạn gửi telemetry/attributes theo interval riêng.
 * - Gộp toàn bộ tag cần đọc theo device (tránh đọc 2 lần nếu 1 tag vừa dùng cho
 *   telemetry vừa dùng cho attributes, hoặc được map tới nhiều thiết bị TB).
 * - Đọc các device song song (giới hạn concurrency), mỗi device tự gộp lệnh Modbus
 *   bên trong (xem readTagsBatch trong modbus-client.js).
 * - Gửi lên ThingsBoard song song sau khi đã có đủ giá trị.
 */
async function processThingsBoardUploads() {
  try {
    const tbDevices = db.prepare('SELECT * FROM thingsboard_devices WHERE enabled=1 ORDER BY sort_order, id').all();
    if (!tbDevices.length) return;
    const now = Date.now();

    const dueTelemetryTb = tbDevices.filter((tb) => now - (tbLastTelemetry.get(tb.id) || 0) >= (tb.telemetry_interval_ms || 5000));
    const dueAttributesTb = tbDevices.filter((tb) => now - (tbLastAttributes.get(tb.id) || 0) >= (tb.attributes_interval_ms || 5000));
    if (!dueTelemetryTb.length && !dueAttributesTb.length) return;

    const deviceTagMap = new Map(); // deviceId -> Map(tagId -> tag row)
    const telemetryPlan = new Map(); // tb.id -> tag rows
    const attributesPlan = new Map();

    const collect = (tb, rows, plan) => {
      if (!rows.length) return;
      plan.set(tb.id, rows);
      rows.forEach((r) => {
        if (!deviceTagMap.has(r.device_id)) deviceTagMap.set(r.device_id, new Map());
        deviceTagMap.get(r.device_id).set(r.id, r);
      });
    };

    dueTelemetryTb.forEach((tb) => {
      tbLastTelemetry.set(tb.id, now);
      collect(tb, tbTelemetryTagsStmt.all(tb.id, tb.id), telemetryPlan);
    });
    dueAttributesTb.forEach((tb) => {
      tbLastAttributes.set(tb.id, now);
      collect(tb, tbAttributesTagsStmt.all(tb.id, tb.id), attributesPlan);
    });

    if (!deviceTagMap.size) return;

    // Đọc mỗi device đúng 1 lần cho chu kỳ này, song song có giới hạn
    const readResults = new Map(); // deviceId -> { tagId: {value,...} }
    await mapWithConcurrency([...deviceTagMap.entries()], DEVICE_READ_CONCURRENCY, async ([deviceId, tagMap]) => {
      const dev = deviceByIdStmt.get(deviceId);
      if (!dev || !dev.ip) return;
      try {
        const values = await readTagsForDevice(dev, [...tagMap.values()]);
        readResults.set(deviceId, values);
      } catch (err) {
        console.error(`[TB] Đọc device ${dev.name} lỗi:`, err.message);
      }
    });

    // Gửi lên ThingsBoard song song dựa trên kết quả đã đọc
    const uploadJobs = [];
    telemetryPlan.forEach((rows, tbId) => {
      const tb = tbDevices.find((d) => d.id === tbId);
      const withValue = rows.map((t) => ({ ...t, last_value: readResults.get(t.device_id)?.[t.id]?.value }));
      uploadJobs.push(uploadToThingsBoard(tb, withValue, false));
    });
    attributesPlan.forEach((rows, tbId) => {
      const tb = tbDevices.find((d) => d.id === tbId);
      const withValue = rows.map((t) => ({ ...t, last_value: readResults.get(t.device_id)?.[t.id]?.value }));
      uploadJobs.push(uploadToThingsBoard(tb, withValue, true));
    });
    await Promise.all(uploadJobs);
  } catch (err) {
    console.error('[TB] Process uploads error:', err.message);
  }
}

// Tự lên lịch lại SAU KHI chu kỳ trước xử lý xong, thay vì setInterval cố định -
// tránh chồng chéo (overlap) nhiều chu kỳ chạy song song khi có hàng nghìn tag khiến
// 1 chu kỳ mất hơn 1 giây.
const TB_CYCLE_INTERVAL_MS = 1000;
let tbLoopTimer = null;
async function tbLoopTick() {
  try {
    await processThingsBoardUploads();
  } catch (err) {
    console.error('[TB] Loop tick error:', err.message);
  } finally {
    tbLoopTimer = setTimeout(tbLoopTick, TB_CYCLE_INTERVAL_MS);
  }
}

function startThingsBoardService() {
  tbLoopTick();
}

startThingsBoardService();

app.listen(PORT, () => {
  console.log(`KEPServerEX Tag Manager API đang chạy tại http://0.0.0.0:${PORT}`);
});

function shutdown() {
  if (tbLoopTimer) clearTimeout(tbLoopTimer);
  closeAll();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);