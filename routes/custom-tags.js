module.exports = function register(app, db, helpers) {
  app.get('/api/custom-tags', (req, res) => {
    const rows = db.prepare('SELECT * FROM custom_tags ORDER BY sort_order, id').all();
    res.json(rows);
  });

  app.post('/api/custom-tags', (req, res) => {
    const { name, expression, decimals = 2, realtime_enabled = 0, tb_telemetry_enabled = 0, tb_telemetry_interval_ms = 5000, tb_attributes_enabled = 0, tb_attributes_interval_ms = 5000 } = req.body;
    if (!name || !expression) return res.status(400).json({ error: 'Thiếu tên / biểu thức' });
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM custom_tags').get().m;
    const info = db.prepare(
      `INSERT INTO custom_tags (name, expression, decimals, sort_order, realtime_enabled, tb_telemetry_enabled, tb_telemetry_interval_ms, tb_attributes_enabled, tb_attributes_interval_ms, raw_json) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(name, expression, Number.isInteger(decimals) ? decimals : 2, maxOrder + 1, realtime_enabled ? 1 : 0, tb_telemetry_enabled ? 1 : 0, Number.isInteger(tb_telemetry_interval_ms) ? tb_telemetry_interval_ms : 5000, tb_attributes_enabled ? 1 : 0, Number.isInteger(tb_attributes_interval_ms) ? tb_attributes_interval_ms : 5000, JSON.stringify({ name, expression }));
    res.json({ id: info.lastInsertRowid });
  });

  app.put('/api/custom-tags/:id', (req, res) => {
    const ct = db.prepare('SELECT * FROM custom_tags WHERE id=?').get(req.params.id);
    if (!ct) return res.status(404).json({ error: 'Không tìm thấy CustomTag' });
    const raw = JSON.parse(ct.raw_json);
    const { name, expression, decimals, realtime_enabled, tb_telemetry_enabled, tb_telemetry_interval_ms, tb_attributes_enabled, tb_attributes_interval_ms } = req.body;
    if (name != null) raw.name = name;
    if (expression != null) raw.expression = expression;
    db.prepare(
      `UPDATE custom_tags SET name=?, expression=?, decimals=?, realtime_enabled=?, tb_telemetry_enabled=?, tb_telemetry_interval_ms=?, tb_attributes_enabled=?, tb_attributes_interval_ms=?, raw_json=? WHERE id=?`
    ).run(
      name ?? ct.name, expression ?? ct.expression,
      Number.isInteger(decimals) ? decimals : ct.decimals,
      realtime_enabled != null ? (realtime_enabled ? 1 : 0) : ct.realtime_enabled,
      tb_telemetry_enabled != null ? (tb_telemetry_enabled ? 1 : 0) : ct.tb_telemetry_enabled,
      Number.isInteger(tb_telemetry_interval_ms) ? tb_telemetry_interval_ms : ct.tb_telemetry_interval_ms,
      tb_attributes_enabled != null ? (tb_attributes_enabled ? 1 : 0) : ct.tb_attributes_enabled,
      Number.isInteger(tb_attributes_interval_ms) ? tb_attributes_interval_ms : ct.tb_attributes_interval_ms,
      JSON.stringify(raw), req.params.id
    );
    res.json({ ok: true });
  });

  app.delete('/api/custom-tags/:id', (req, res) => {
    db.prepare('DELETE FROM custom_tags WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/custom-tags/:id/sources', (req, res) => {
    const rows = db.prepare('SELECT * FROM custom_tag_sources WHERE custom_tag_id=? ORDER BY sort_order, id').all(req.params.id);
    res.json(rows);
  });

  app.post('/api/custom-tags/:id/sources', (req, res) => {
    const ct = db.prepare('SELECT id FROM custom_tags WHERE id=?').get(req.params.id);
    if (!ct) return res.status(404).json({ error: 'Không tìm thấy CustomTag' });
    const { source_type, source_tag_id, source_api_key, source_custom_tag_id } = req.body;
    if (!source_type) return res.status(400).json({ error: 'Thiếu source_type' });
    if (source_type === 'tag' && !source_tag_id) return res.status(400).json({ error: 'Thiếu source_tag_id' });
    if (source_type === 'api_key' && !source_api_key) return res.status(400).json({ error: 'Thiếu source_api_key' });
    if (source_type === 'custom_tag' && !source_custom_tag_id) return res.status(400).json({ error: 'Thiếu source_custom_tag_id' });
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM custom_tag_sources WHERE custom_tag_id=?').get(req.params.id).m;
    const info = db.prepare('INSERT INTO custom_tag_sources (custom_tag_id, source_type, source_tag_id, source_api_key, source_custom_tag_id, sort_order) VALUES (?,?,?,?,?,?)')
      .run(req.params.id, source_type, source_tag_id || null, source_api_key || null, source_custom_tag_id || null, maxOrder + 1);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete('/api/custom-tags/:id/sources/:sid', (req, res) => {
    db.prepare('DELETE FROM custom_tag_sources WHERE id=? AND custom_tag_id=?').run(req.params.sid, req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/custom-tags/:id/tb-devices', (req, res) => {
    const rows = db.prepare('SELECT tb.* FROM thingsboard_devices tb JOIN custom_tag_tb_devices m ON tb.id = m.tb_device_id WHERE m.custom_tag_id=? ORDER BY tb.sort_order, tb.id').all(req.params.id);
    res.json(rows);
  });

  app.post('/api/custom-tags/:id/tb-devices', (req, res) => {
    const ct = db.prepare('SELECT id FROM custom_tags WHERE id=?').get(req.params.id);
    if (!ct) return res.status(404).json({ error: 'Không tìm thấy CustomTag' });
    const { tb_device_id } = req.body;
    if (!tb_device_id) return res.status(400).json({ error: 'Thiếu tb_device_id' });
    db.prepare('INSERT OR IGNORE INTO custom_tag_tb_devices (custom_tag_id, tb_device_id) VALUES (?,?)').run(req.params.id, tb_device_id);
    res.json({ ok: true });
  });

  app.delete('/api/custom-tags/:id/tb-devices/:tbId', (req, res) => {
    db.prepare('DELETE FROM custom_tag_tb_devices WHERE custom_tag_id=? AND tb_device_id=?').run(req.params.id, req.params.tbId);
    res.json({ ok: true });
  });

  app.get('/api/custom-tags/sources/available', (req, res) => {
    const tags = db.prepare('SELECT id, name, device_id FROM tags ORDER BY name').all();
    const devices = db.prepare('SELECT id, name FROM devices ORDER BY name').all();
    const channels = db.prepare('SELECT id, name FROM channels ORDER BY name').all();
    const devMap = new Map(devices.map(d => [d.id, d]));
    const chMap = new Map(channels.map(c => [c.id, c]));
    const tagOptions = tags.map(t => {
      const dev = devMap.get(t.device_id);
      const ch = dev ? chMap.get(dev.channel_id) : null;
      const fullName = ch && dev ? `${ch.name}.${dev.name}.${t.name}` : t.name;
      return { type: 'tag', id: t.id, name: t.name, fullName };
    });
    const apiKeys = db.prepare('SELECT DISTINCT api_key FROM api_tb_mappings').all().map(r => r.api_key);
    const customTags = db.prepare('SELECT id, name FROM custom_tags ORDER BY name').all().map(ct => ({ type: 'custom_tag', id: ct.id, name: ct.name, fullName: ct.name }));
    res.json({ tags: tagOptions, apiKeys, customTags });
  });

  app.get('/api/custom-tags/live-values', (req, res) => {
    const rows = db.prepare('SELECT id, name, expression, decimals FROM custom_tags').all();
    const out = rows.map(r => ({ id: r.id, name: r.name, value: helpers.customTagValueCache.get(r.id), decimals: r.decimals }));
    res.json(out);
  });
};
