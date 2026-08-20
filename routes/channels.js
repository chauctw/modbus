module.exports = function register(app, db, helpers) {
  const { channelWithCounts } = helpers;

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

  app.get('/api/channels/:channelId/devices', (req, res) => {
    const rows = db.prepare('SELECT * FROM devices WHERE channel_id=? ORDER BY sort_order, id').all(req.params.channelId);
    res.json(rows.map(helpers.deviceWithCounts));
  });
};
