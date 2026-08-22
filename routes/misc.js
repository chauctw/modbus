module.exports = function register(app, db, helpers) {
  const { stripBom } = helpers;

  app.get('/api/stats', (req, res) => {
    const { DATA_TYPES } = require('../datatypes');
    const totals = {
      channels: db.prepare('SELECT COUNT(*) c FROM channels').get().c,
      devices: db.prepare('SELECT COUNT(*) c FROM devices').get().c,
      tags: db.prepare('SELECT COUNT(*) c FROM tags').get().c,
      customTags: db.prepare('SELECT COUNT(*) c FROM custom_tags').get().c,
      tagsTelemetry: db.prepare('SELECT COUNT(*) c FROM tags WHERE tb_telemetry_enabled=1').get().c
        + db.prepare('SELECT COUNT(*) c FROM custom_tags WHERE tb_telemetry_enabled=1').get().c
        + db.prepare('SELECT COUNT(*) c FROM api_tb_mappings WHERE telemetry_enabled=1').get().c,
      tagsAttributes: db.prepare('SELECT COUNT(*) c FROM tags WHERE tb_attributes_enabled=1').get().c
        + db.prepare('SELECT COUNT(*) c FROM custom_tags WHERE tb_attributes_enabled=1').get().c
        + db.prepare('SELECT COUNT(*) c FROM api_tb_mappings WHERE attributes_enabled=1').get().c,
      tagsRealtime: db.prepare('SELECT COUNT(*) c FROM tags WHERE realtime_enabled=1').get().c
        + db.prepare('SELECT COUNT(*) c FROM custom_tags WHERE realtime_enabled=1').get().c,
    };
    // Thiết bị Modbus mất kết nối: không có socket hoặc chưa đọc được tag nào good
    try {
      const { getDisconnectedDeviceIds } = require('../modbus-client');
      const allIpDevices = db.prepare(
        "SELECT DISTINCT id FROM devices WHERE ip IS NOT NULL AND ip != ''"
      ).all().map(r => r.id);
      const disconnectedIds = getDisconnectedDeviceIds(allIpDevices);
      totals.disconnectedDevices = disconnectedIds.length;
      totals.disconnectedDeviceIds = disconnectedIds;
    } catch (e) {
      totals.disconnectedDevices = 0;
    }
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

  // SSE endpoint: push số lượng thiết bị modbus mất kết nối ngay khi trạng thái thay đổi
  app.get('/api/modbus-status-stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    function sendStatus() {
      try {
        const { getDisconnectedDeviceIds } = require('../modbus-client');
        const allIpDevices = db.prepare(
          "SELECT DISTINCT id FROM devices WHERE ip IS NOT NULL AND ip != ''"
        ).all().map(r => r.id);
        const disconnected = getDisconnectedDeviceIds(allIpDevices);
        res.write(`data: ${JSON.stringify({ disconnectedDevices: disconnected.length, disconnectedDeviceIds: disconnected })}\n\n`);
      } catch (e) {
        res.write(`data: ${JSON.stringify({ disconnectedDevices: 0, disconnectedDeviceIds: [] })}\n\n`);
      }
    }

    // Gửi ngay khi vừa kết nối
    sendStatus();

    // Lắng nghe sự kiện thay đổi từ modbus-client
    const { onStatusChange, offStatusChange } = require('../modbus-client');
    const handler = () => sendStatus();
    onStatusChange(handler);

    // Heartbeat mỗi 15s để giữ kết nối không bị đóng
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      offStatusChange(handler);
    });
  });

  app.get('/api/validate', (req, res) => {
    const dupTagNames = db.prepare(
      `SELECT t.device_id, t.name, COUNT(*) count, GROUP_CONCAT(t.id, ',') tag_ids, d.name device_name, c.name channel_name
       FROM tags t
       JOIN devices d ON d.id = t.device_id
       JOIN channels c ON c.id = d.channel_id
       GROUP BY t.device_id, t.name HAVING COUNT(*) > 1`
    ).all();
    const dupTagAddress = db.prepare(
      `SELECT t.device_id, t.address, COUNT(*) count, GROUP_CONCAT(t.id, ',') tag_ids, d.name device_name, c.name channel_name
       FROM tags t
       JOIN devices d ON d.id = t.device_id
       JOIN channels c ON c.id = d.channel_id
       WHERE t.address IS NOT NULL AND t.address != ''
       GROUP BY t.device_id, t.address HAVING COUNT(*) > 1`
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

  app.get('/api/data-types', (req, res) => {
    const { DATA_TYPES } = require('../datatypes');
    res.json(DATA_TYPES);
  });

  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.get('/api/live-fetch', async (req, res) => {
    try {
      const configs = helpers.getApiFetchConfigs();
      const { fetchCleanWaterLive, fetchRawWaterLive, fetchViwaterLive } = require('../live_fetchers');
      const [cleanWater, rawWater, viwater] = await Promise.all([
        fetchCleanWaterLive(configs.clean_water?.fetch_interval_ms || 10000),
        fetchRawWaterLive(configs.raw_water?.fetch_interval_ms || 10000),
        fetchViwaterLive(configs.viwater?.fetch_interval_ms || 10000),
      ]);
      res.json({ cleanWater, rawWater, viwater });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/import', require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }).single('file'), (req, res) => {
    try {
      let jsonText;
      if (req.file) jsonText = stripBom(req.file.buffer.toString('utf-8'));
      else if (req.body && Object.keys(req.body).length) jsonText = JSON.stringify(req.body);
      else return res.status(400).json({ error: 'Thiếu file JSON (field "file") hoặc JSON body' });

      const parsed = JSON.parse(jsonText);
      const mode = req.body?.mode === 'merge' || req.query.mode === 'merge' ? 'merge' : 'replace';
      const { importProject, mergeProject } = require('../kepware-io');
      const stats = mode === 'merge' ? mergeProject(parsed) : importProject(parsed);
      res.json({ ok: true, mode, imported: stats });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/import-json', (req, res) => {
    try {
      const mode = req.query.mode === 'merge' ? 'merge' : 'replace';
      const { importProject, mergeProject } = require('../kepware-io');
      const stats = mode === 'merge' ? mergeProject(req.body) : importProject(req.body);
      res.json({ ok: true, mode, imported: stats });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/export', (req, res) => {
    try {
      const project = require('../kepware-io').exportProject();
      res.setHeader('Content-Disposition', 'attachment; filename="kepware-export.json"');
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(project, null, 2));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/reset', (req, res) => {
    db.exec('DELETE FROM tags; DELETE FROM devices; DELETE FROM channels; DELETE FROM project; DELETE FROM thingsboard_devices; DELETE FROM tag_tb_devices; DELETE FROM custom_tags; DELETE FROM custom_tag_sources; DELETE FROM custom_tag_tb_devices;');
    res.json({ ok: true });
  });
};
