const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { DATA_TYPES } = require('./datatypes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'kepware-tag-manager-secret-2026';

const tagValueCache = new Map();
const customTagValueCache = new Map();

function authenticate(req, res, next) {
  const publicPaths = ['/api/auth/login', '/api/health', '/api/import', '/api/import-json'];
  const isPublic = publicPaths.some(p => req.originalUrl === p || req.originalUrl.startsWith(p + '/'));
  if (isPublic) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền truy cập' });
    next();
  };
}

app.use('/api', authenticate);

function removeVietnameseTones(str) {
  let s = String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/đ/g, 'd').replace(/Đ/g, 'D');
  return s;
}

function sanitizeTbKey(key) {
  const noTone = removeVietnameseTones(key);
  return noTone.replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/[_\-\.]+/g, '_').replace(/^_|_$/g, '');
}

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

function stripBom(str) {
  if (typeof str === 'string' && str.charCodeAt(0) === 0xfeff) return str.slice(1);
  return str;
}

function getApiFetchConfigs() {
  const rows = db.prepare('SELECT channel_key, label, fetch_interval_ms FROM api_fetch_configs').all();
  const map = {};
  rows.forEach((r) => { map[r.channel_key] = { label: r.label, fetch_interval_ms: r.fetch_interval_ms }; });
  return map;
}

const helpers = {
  channelWithCounts,
  deviceWithCounts,
  sanitizeTbKey,
  stripBom,
  getApiFetchConfigs,
  tagValueCache,
  customTagValueCache,
};

require('./routes/auth')(app, db);
require('./routes/users')(app, db);
require('./routes/channels')(app, db, helpers);
require('./routes/devices')(app, db, helpers);
require('./routes/tags')(app, db);
require('./routes/thingsboard')(app, db);
require('./routes/custom-tags')(app, db, helpers);
require('./routes/api')(app, db);
require('./routes/misc')(app, db, helpers);

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
    if (Object.prototype.hasOwnProperty.call(payload, key)) key = `${key}_${tag.id}`;
    payload[key] = value;
  });
  if (!Object.keys(payload).length) return;

  try {
    const axios = require('axios');
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

const DEVICE_READ_CONCURRENCY = 8;

const tagColumnsForTb = 't.id, t.name, t.device_id, t.address, t.data_type, t.decimals, t.scaling_type, t.raw_json, d.name as device_name, ch.name as channel_name';
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

async function processThingsBoardUploads() {
  try {
    const tbDevices = db.prepare('SELECT * FROM thingsboard_devices WHERE enabled=1 ORDER BY sort_order, id').all();
    if (!tbDevices.length) return;
    const now = Date.now();

    const dueTelemetryTb = tbDevices.filter((tb) => now - (tbLastTelemetry.get(tb.id) || 0) >= (tb.telemetry_interval_ms || 5000));
    const dueAttributesTb = tbDevices.filter((tb) => now - (tbLastAttributes.get(tb.id) || 0) >= (tb.attributes_interval_ms || 5000));
    if (!dueTelemetryTb.length && !dueAttributesTb.length) return;

    const deviceTagMap = new Map();
    const telemetryPlan = new Map();
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

    const readResults = new Map();
    await mapWithConcurrency([...deviceTagMap.entries()], DEVICE_READ_CONCURRENCY, async ([deviceId, tagMap]) => {
      const dev = deviceByIdStmt.get(deviceId);
      if (!dev || !dev.ip) return;
      try {
        const values = await require('./modbus-client').readTagsForDevice(dev, [...tagMap.values()]);
        readResults.set(deviceId, values);
        Object.entries(values || {}).forEach(([tagId, result]) => {
          if (result && result.value != null) {
            tagValueCache.set(`tag:${tagId}`, result.value);
          }
        });
      } catch (err) {
        console.error(`[TB] Đọc device ${dev.name} lỗi:`, err.message);
      }
    });

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

    if (dueTelemetryTb.length) {
      const cRows = db.prepare('SELECT id, name, decimals FROM custom_tags WHERE tb_telemetry_enabled=1').all();
      cRows.forEach((ct) => {
        const mappings = db.prepare('SELECT tb_device_id FROM custom_tag_tb_devices WHERE custom_tag_id=?').all(ct.id);
        mappings.forEach((m) => {
          const tb = tbDevices.find((d) => d.id === m.tb_device_id);
          if (!tb) return;
          uploadJobs.push(uploadToThingsBoard(tb, [{ ...ct, last_value: customTagValueCache.get(ct.id) }], false));
        });
      });
    }
    if (dueAttributesTb.length) {
      const cRows = db.prepare('SELECT id, name, decimals FROM custom_tags WHERE tb_attributes_enabled=1').all();
      cRows.forEach((ct) => {
        const mappings = db.prepare('SELECT tb_device_id FROM custom_tag_tb_devices WHERE custom_tag_id=?').all(ct.id);
        mappings.forEach((m) => {
          const tb = tbDevices.find((d) => d.id === m.tb_device_id);
          if (!tb) return;
          uploadJobs.push(uploadToThingsBoard(tb, [{ ...ct, last_value: customTagValueCache.get(ct.id) }], true));
        });
      });
    }
    await Promise.all(uploadJobs);
  } catch (err) {
    console.error('[TB] Process uploads error:', err.message);
  }
}

const apiTbLastTelemetry = new Map();
const apiTbLastAttributes = new Map();
const API_TB_CYCLE_INTERVAL_MS = 1000;
let apiTbLoopTimer = null;

async function uploadApiDataToThingsBoard(tbDevice, apiKey, value, isAttributes) {
  if (!tbDevice.enabled || value === null || value === undefined) return;
  const protocol = tbDevice.protocol === 'https' ? 'https' : 'http';
  const url = `${protocol}://${tbDevice.host}:${tbDevice.port}/api/v1/${tbDevice.access_token}/${isAttributes ? 'attributes' : 'telemetry'}`;
  const sanitizedKey = sanitizeTbKey(apiKey);
  const payload = { [sanitizedKey]: value };
  try {
    const axios = require('axios');
    await axios.post(url, payload, { timeout: tbDevice.request_timeout_ms || 5000 });
    console.log(`[API-TB] Upload ${apiKey} to ${tbDevice.name} (${isAttributes ? 'attributes' : 'telemetry'}) OK`);
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    let hint = '';
    if (!status && /socket hang up|ECONNRESET|ECONNREFUSED/i.test(err.message || '')) {
      hint = ` [Gợi ý: không nhận được phản hồi HTTP nào từ server - kiểm tra lại protocol (http/https) và port trong cấu hình "${tbDevice.name}" (URL đang gọi: ${url})]`;
    }
    console.error(`[API-TB] Upload ${apiKey} to ${tbDevice.name} failed: ${err.message}${status ? ` (status ${status})` : ''}${body ? ` - ${typeof body === 'string' ? body : JSON.stringify(body)}` : ''}${hint}`);
  }
}

async function processApiThingsBoardUploads() {
  try {
    const mappings = db.prepare('SELECT m.api_key, m.tb_device_id, m.telemetry_enabled, m.attributes_enabled, m.telemetry_interval_ms, m.attributes_interval_ms FROM api_tb_mappings m JOIN thingsboard_devices tb ON tb.id = m.tb_device_id WHERE tb.enabled=1').all();
    if (!mappings.length) return;

    const configs = getApiFetchConfigs();
    const { fetchCleanWaterLive, fetchRawWaterLive, fetchViwaterLive } = require('./live_fetchers');
    const [cleanWater, rawWater, viwater] = await Promise.all([
      fetchCleanWaterLive(configs.clean_water?.fetch_interval_ms || 10000),
      fetchRawWaterLive(configs.raw_water?.fetch_interval_ms || 10000),
      fetchViwaterLive(configs.viwater?.fetch_interval_ms || 10000),
    ]);
    const allData = [...cleanWater, ...rawWater, ...viwater];
    const dataMap = new Map();
    allData.forEach(item => {
      const metrics = item.rawData || {};
      Object.entries(metrics).forEach(([metric, value]) => {
        const key = `${item.tag_name}_${metric}`;
        dataMap.set(key, value);
        tagValueCache.set(`api:${key}`, value);
      });
    });

    const now = Date.now();
    const tbDeviceIds = [...new Set(mappings.map(m => m.tb_device_id))];
    const tbDevices = db.prepare('SELECT * FROM thingsboard_devices WHERE id IN (' + tbDeviceIds.map(() => '?').join(',') + ')').all(...tbDeviceIds);
    const tbMap = new Map(tbDevices.map(tb => [tb.id, tb]));

    const uploadJobs = [];
    mappings.forEach(m => {
      const value = dataMap.get(m.api_key);
      if (value === undefined) return;
      const tb = tbMap.get(m.tb_device_id);
      if (!tb) return;

      const telemetryKey = `${m.api_key}_${m.tb_device_id}_telemetry`;
      const attributesKey = `${m.api_key}_${m.tb_device_id}_attributes`;

      if (m.telemetry_enabled) {
        const lastTelemetry = apiTbLastTelemetry.get(telemetryKey) || 0;
        if (now - lastTelemetry >= (m.telemetry_interval_ms || 5000)) {
          apiTbLastTelemetry.set(telemetryKey, now);
          uploadJobs.push(uploadApiDataToThingsBoard(tb, m.api_key, value, false));
        }
      }
      if (m.attributes_enabled) {
        const lastAttributes = apiTbLastAttributes.get(attributesKey) || 0;
        if (now - lastAttributes >= (m.attributes_interval_ms || 5000)) {
          apiTbLastAttributes.set(attributesKey, now);
          uploadJobs.push(uploadApiDataToThingsBoard(tb, m.api_key, value, true));
        }
      }
    });
    await Promise.all(uploadJobs);
  } catch (err) {
    console.error('[API-TB] Process uploads error:', err.message);
  }
}

async function apiTbLoopTick() {
  try {
    await processApiThingsBoardUploads();
  } catch (err) {
    console.error('[API-TB] Loop tick error:', err.message);
  } finally {
    apiTbLoopTimer = setTimeout(apiTbLoopTick, API_TB_CYCLE_INTERVAL_MS);
  }
}

function startApiThingsBoardService() {
  apiTbLoopTick();
}

const { compile } = require('./expression-engine');

async function evaluateCustomTags() {
  try {
    const tags = db.prepare('SELECT * FROM custom_tags WHERE realtime_enabled=1 OR tb_telemetry_enabled=1 OR tb_attributes_enabled=1').all();
    const tagInfo = db.prepare(`
      SELECT t.id, t.name as tag_name, t.device_id,
             d.name as device_name, d.channel_id,
             c.name as channel_name
      FROM tags t
      JOIN devices d ON t.device_id = d.id
      JOIN channels c ON d.channel_id = c.id
    `).all();
    const tagInfoMap = new Map(tagInfo.map(t => [t.id, t]));
    const customTagNames = new Map();
    db.prepare('SELECT id, name FROM custom_tags').all().forEach(ct => customTagNames.set(ct.id, ct.name));
    for (const ct of tags) {
      const sources = db.prepare('SELECT * FROM custom_tag_sources WHERE custom_tag_id=? ORDER BY sort_order, id').all(ct.id);
      const ctx = {};
      sources.forEach((src) => {
        let refName = null;
        if (src.source_type === 'tag' && src.source_tag_id != null) {
          const info = tagInfoMap.get(src.source_tag_id);
          refName = info ? `${info.channel_name}.${info.device_name}.${info.tag_name}` : `tag_${src.source_tag_id}`;
          ctx[refName] = tagValueCache.get(`tag:${src.source_tag_id}`);
        } else if (src.source_type === 'api_key' && src.source_api_key) {
          refName = src.source_api_key;
          ctx[refName] = tagValueCache.get(`api:${src.source_api_key}`);
        } else if (src.source_type === 'custom_tag' && src.source_custom_tag_id != null) {
          const cname = customTagNames.get(src.source_custom_tag_id);
          refName = cname || `custom_${src.source_custom_tag_id}`;
          ctx[refName] = customTagValueCache.get(src.source_custom_tag_id);
        }
      });
      try {
        const fn = compile(ct.expression);
        const value = fn((name) => ctx[name]);
        customTagValueCache.set(ct.id, value);
      } catch (e) {
        customTagValueCache.set(ct.id, null);
      }
    }
  } catch (e) {
    console.error('[CustomTag] Evaluate error:', e.message);
  }
}

const CUSTOM_TAG_CYCLE_INTERVAL_MS = 1000;
let customTagLoopTimer = null;
async function customTagLoopTick() {
  try {
    await evaluateCustomTags();
  } catch (err) {
    console.error('[CustomTag] Loop tick error:', err.message);
  } finally {
    customTagLoopTimer = setTimeout(customTagLoopTick, CUSTOM_TAG_CYCLE_INTERVAL_MS);
  }
}

function startCustomTagService() {
  customTagLoopTick();
}

const tbLastTelemetry = new Map();
const tbLastAttributes = new Map();
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
  startApiThingsBoardService();
  startCustomTagService();
}

startThingsBoardService();

app.listen(PORT, () => {
  console.log(`KEPServerEX Tag Manager API đang chạy tại http://0.0.0.0:${PORT}`);
});

function shutdown() {
  if (tbLoopTimer) clearTimeout(tbLoopTimer);
  if (customTagLoopTimer) clearTimeout(customTagLoopTimer);
  if (apiTbLoopTimer) clearTimeout(apiTbLoopTimer);
  require('./modbus-client').closeAll();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
