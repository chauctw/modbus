module.exports = function register(app, db, helpers) {
  const { sanitizePart } = helpers || {};
  function computeDisplayName(chName, devName, tagName) {
    return [chName, devName, tagName].filter(Boolean).map(sanitizePart || (s => String(s))).filter(Boolean).join('.');
  }

  app.get('/api/devices/:deviceId/tags', (req, res) => {
    const { search = '', sort = 'sort_order', dir = 'asc', page = 1, pageSize: pageSizeRaw = 20, realtime, tb, status } = req.query;
    const pageSize = Number(pageSizeRaw);
    const allowedSort = ['name', 'address', 'data_type', 'rw_access', 'scaling_type', 'sort_order', 'id'];
    const sortCol = allowedSort.includes(sort) ? sort : 'sort_order';
    const sortDir = dir === 'desc' ? 'DESC' : 'ASC';

    let where = 'WHERE t.device_id = ?';
    const params = [req.params.deviceId];
    if (search) {
      where += ' AND (t.name LIKE ? OR t.address LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status === 'realtime') {
      where += ' AND t.realtime_enabled = 1';
    } else if (status === 'telemetry') {
      where += ' AND t.tb_telemetry_enabled = 1';
    } else if (status === 'attributes') {
      where += ' AND t.tb_attributes_enabled = 1';
    } else {
      if (realtime == '1') {
        where += ' AND t.realtime_enabled = 1';
      }
      if (tb == '1') {
        where += ' AND (t.tb_telemetry_enabled = 1 OR t.tb_attributes_enabled = 1)';
      }
    }

    const total = db.prepare(`SELECT COUNT(*) c FROM tags t ${where}`).get(...params).c;
    const offset = (Number(page) - 1) * pageSize;
    const rows = db.prepare(
      `SELECT t.*, d.name AS device_name, c.name AS channel_name
       FROM tags t
       JOIN devices d ON d.id = t.device_id
       JOIN channels c ON c.id = d.channel_id
       ${where}
       ORDER BY t.${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset);
    rows.forEach(r => { r.displayName = computeDisplayName(r.channel_name, r.device_name, r.name); });

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
};
