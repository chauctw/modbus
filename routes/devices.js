module.exports = function register(app, db, helpers) {
  const { deviceWithCounts } = helpers;

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
      const values = await require('../modbus-client').readTagsForDevice(dev, tags);
      res.json({ values });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/devices/:id/live-disconnect', (req, res) => {
    require('../modbus-client').closeConnection(Number(req.params.id));
    res.json({ ok: true });
  });
};
