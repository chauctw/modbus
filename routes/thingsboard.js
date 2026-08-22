module.exports = function register(app, db) {
  app.get('/api/thingsboard-devices', (req, res) => {
    const { page, pageSize } = req.query;
    if (!page || !pageSize) {
      const rows = db.prepare('SELECT * FROM thingsboard_devices ORDER BY sort_order, id').all();
      return res.json(rows);
    }
    const total = db.prepare('SELECT COUNT(*) c FROM thingsboard_devices').get().c;
    const offset = (Number(page) - 1) * Number(pageSize);
    const rows = db.prepare('SELECT * FROM thingsboard_devices ORDER BY sort_order, id LIMIT ? OFFSET ?').all(Number(pageSize), offset);
    res.json({ total, page: Number(page), pageSize: Number(pageSize), rows });
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
    db.prepare('DELETE FROM custom_tag_tb_devices WHERE tb_device_id=?').run(req.params.id);
    db.prepare('DELETE FROM api_tb_mappings WHERE tb_device_id=?').run(req.params.id);
    db.prepare('UPDATE devices SET default_tb_device_id=NULL WHERE default_tb_device_id=?').run(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/tb-stats', (req, res) => {
    const total = db.prepare('SELECT COUNT(*) c FROM thingsboard_devices').get().c;
    const enabled = db.prepare('SELECT COUNT(*) c FROM thingsboard_devices WHERE enabled=1').get().c;
    const mappings = db.prepare('SELECT COUNT(*) c FROM tag_tb_devices').get().c;
    res.json({ total, enabled, mappings });
  });
};
