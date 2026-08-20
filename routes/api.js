module.exports = function register(app, db) {
  app.get('/api/api-fetch-configs', (req, res) => {
    const rows = db.prepare('SELECT channel_key, label, fetch_interval_ms FROM api_fetch_configs').all();
    const map = {};
    rows.forEach((r) => { map[r.channel_key] = { label: r.label, fetch_interval_ms: r.fetch_interval_ms }; });
    res.json(map);
  });

  app.put('/api/api-fetch-configs/:channelKey', (req, res) => {
    const { fetch_interval_ms } = req.body;
    const row = db.prepare('SELECT * FROM api_fetch_configs WHERE channel_key=?').get(req.params.channelKey);
    if (!row) return res.status(404).json({ error: 'Không tìm thấy cấu hình fetch' });
    if (fetch_interval_ms != null && (!Number.isInteger(fetch_interval_ms) || fetch_interval_ms < 1000)) {
      return res.status(400).json({ error: 'fetch_interval_ms phải là số nguyên >= 1000' });
    }
    db.prepare('UPDATE api_fetch_configs SET fetch_interval_ms=? WHERE channel_key=?')
      .run(fetch_interval_ms ?? row.fetch_interval_ms, req.params.channelKey);
    res.json({ ok: true });
  });

  app.get('/api/api-tb-mappings', (req, res) => {
    const rows = db.prepare('SELECT api_key, tb_device_id, telemetry_enabled, attributes_enabled, telemetry_interval_ms, attributes_interval_ms FROM api_tb_mappings').all();
    res.json(rows);
  });

  app.post('/api/api-tb-mappings', (req, res) => {
    const { api_key, mappings, tb_device_id, telemetry_enabled = 1, attributes_enabled = 1, telemetry_interval_ms = 5000, attributes_interval_ms = 5000 } = req.body;
    if (!api_key) return res.status(400).json({ error: 'Thiếu api_key' });
    if (mappings && Array.isArray(mappings)) {
      const tx = db.transaction(() => {
        db.prepare('DELETE FROM api_tb_mappings WHERE api_key=?').run(api_key);
        const ins = db.prepare('INSERT INTO api_tb_mappings (api_key, tb_device_id, enabled, telemetry_enabled, attributes_enabled, telemetry_interval_ms, attributes_interval_ms) VALUES (?,?,?,?,?,?,?)');
        mappings.forEach(m => {
          ins.run(api_key, m.tb_device_id, 1, m.telemetry_enabled ? 1 : 0, m.attributes_enabled ? 1 : 0, Number(m.telemetry_interval_ms) || 5000, Number(m.attributes_interval_ms) || 5000);
        });
      });
      tx();
      res.json({ ok: true });
    } else if (tb_device_id) {
      db.prepare('INSERT OR REPLACE INTO api_tb_mappings (api_key, tb_device_id, enabled, telemetry_enabled, attributes_enabled, telemetry_interval_ms, attributes_interval_ms) VALUES (?,?,?,?,?,?,?)')
        .run(api_key, tb_device_id, 1, telemetry_enabled ? 1 : 0, attributes_enabled ? 1 : 0, Number(telemetry_interval_ms) || 5000, Number(attributes_interval_ms) || 5000);
      res.json({ ok: true });
    } else {
      return res.status(400).json({ error: 'Thiếu mappings hoặc tb_device_id' });
    }
  });

  app.put('/api/api-tb-mappings', (req, res) => {
    const { api_key, tb_device_id, telemetry_enabled, attributes_enabled, telemetry_interval_ms, attributes_interval_ms } = req.body;
    if (!api_key || !tb_device_id) return res.status(400).json({ error: 'Thiếu api_key / tb_device_id' });
    const mapping = db.prepare('SELECT * FROM api_tb_mappings WHERE api_key=? AND tb_device_id=?').get(api_key, tb_device_id);
    if (!mapping) return res.status(404).json({ error: 'Không tìm thấy mapping' });
    db.prepare('UPDATE api_tb_mappings SET telemetry_enabled=?, attributes_enabled=?, telemetry_interval_ms=?, attributes_interval_ms=? WHERE api_key=? AND tb_device_id=?')
      .run(telemetry_enabled != null ? (telemetry_enabled ? 1 : 0) : mapping.telemetry_enabled, attributes_enabled != null ? (attributes_enabled ? 1 : 0) : mapping.attributes_enabled, telemetry_interval_ms != null ? Number(telemetry_interval_ms) : mapping.telemetry_interval_ms, attributes_interval_ms != null ? Number(attributes_interval_ms) : mapping.attributes_interval_ms, api_key, tb_device_id);
    res.json({ ok: true });
  });

  app.delete('/api/api-tb-mappings', (req, res) => {
    const { api_key, tb_device_id } = req.body;
    if (!api_key) return res.status(400).json({ error: 'Thiếu api_key' });
    if (tb_device_id) {
      db.prepare('DELETE FROM api_tb_mappings WHERE api_key=? AND tb_device_id=?').run(api_key, tb_device_id);
    } else {
      db.prepare('DELETE FROM api_tb_mappings WHERE api_key=?').run(api_key);
    }
    res.json({ ok: true });
  });
};
