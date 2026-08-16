const db = require('./db');

const CH_NAME = 'common.ALLTYPES_NAME';
const CH_DRIVER = 'servermain.MULTIPLE_TYPES_DEVICE_DRIVER';
const CH_PORT = 'modbus_ethernet.CHANNEL_ETHERNET_PORT_NUMBER';

const DEV_NAME = 'common.ALLTYPES_NAME';
const DEV_ID_STRING = 'servermain.DEVICE_ID_STRING';
const DEV_SCAN_RATE = 'servermain.DEVICE_SCAN_MODE_RATE_MS';
const DEV_CONN_TO = 'servermain.DEVICE_CONNECTION_TIMEOUT_SECONDS';
const DEV_REQ_TO = 'servermain.DEVICE_REQUEST_TIMEOUT_MILLISECONDS';

const TAG_NAME = 'common.ALLTYPES_NAME';
const TAG_ADDR = 'servermain.TAG_ADDRESS';
const TAG_DTYPE = 'servermain.TAG_DATA_TYPE';
const TAG_RW = 'servermain.TAG_READ_WRITE_ACCESS';
const TAG_SCAN = 'servermain.TAG_SCAN_RATE_MILLISECONDS';
const TAG_SCALING = 'servermain.TAG_SCALING_TYPE';

function parseDeviceIdString(str) {
  if (!str) return { ip: null, slaveId: null };
  const m = String(str).match(/^<(.+)>\.(\d+)$/);
  if (!m) return { ip: null, slaveId: null };
  return { ip: m[1], slaveId: Number(m[2]) };
}

function buildDeviceIdString(ip, slaveId) {
  return `<${ip}>.${slaveId}`;
}

/**
 * Xoá sạch DB và nạp lại toàn bộ project JSON (import = thay thế project hiện tại).
 * Trả về thống kê số lượng đã import.
 */
function importProject(projectRoot) {
  const project = projectRoot.project || projectRoot;
  if (!Array.isArray(project.channels)) {
    throw new Error('JSON không hợp lệ: thiếu project.channels (phải là mảng)');
  }

  const extra = { ...project };
  delete extra.channels;
  const title = project['servermain.PROJECT_TITLE'] || null;

  const tx = db.transaction(() => {
    db.exec('DELETE FROM tags; DELETE FROM devices; DELETE FROM channels; DELETE FROM project;');

    db.prepare('INSERT INTO project (id, title, extra_json) VALUES (1, ?, ?)')
      .run(title, JSON.stringify(extra));

    const insCh = db.prepare(
      'INSERT INTO channels (name, driver, port, sort_order, raw_json) VALUES (?,?,?,?,?)'
    );
    const insDev = db.prepare(
      `INSERT INTO devices (channel_id, name, ip, slave_id, scan_rate_ms, conn_timeout_s, req_timeout_ms, sort_order, raw_json)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const insTag = db.prepare(
      `INSERT INTO tags (device_id, name, address, data_type, rw_access, scan_rate_ms, scaling_type, sort_order, raw_json)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );

    let chCount = 0, devCount = 0, tagCount = 0;

    project.channels.forEach((ch, chIdx) => {
      const chDevices = ch.devices || [];
      const chRaw = { ...ch };
      delete chRaw.devices;

      const chInfo = insCh.run(
        ch[CH_NAME] || `Channel_${chIdx + 1}`,
        ch[CH_DRIVER] || null,
        ch[CH_PORT] ?? null,
        chIdx,
        JSON.stringify(chRaw)
      );
      const channelId = chInfo.lastInsertRowid;
      chCount++;

      chDevices.forEach((dev, devIdx) => {
        const devTags = dev.tags || [];
        const devRaw = { ...dev };
        delete devRaw.tags;
        const { ip, slaveId } = parseDeviceIdString(dev[DEV_ID_STRING]);

        const devInfo = insDev.run(
          channelId,
          dev[DEV_NAME] || `Device_${devIdx + 1}`,
          ip,
          slaveId,
          dev[DEV_SCAN_RATE] ?? null,
          dev[DEV_CONN_TO] ?? null,
          dev[DEV_REQ_TO] ?? null,
          devIdx,
          JSON.stringify(devRaw)
        );
        const deviceId = devInfo.lastInsertRowid;
        devCount++;

        devTags.forEach((tag, tagIdx) => {
          insTag.run(
            deviceId,
            tag[TAG_NAME] || `Tag_${tagIdx + 1}`,
            tag[TAG_ADDR] != null ? String(tag[TAG_ADDR]) : null,
            tag[TAG_DTYPE] ?? null,
            tag[TAG_RW] ?? 0,
            tag[TAG_SCAN] ?? null,
            tag[TAG_SCALING] ?? 0,
            tagIdx,
            JSON.stringify(tag)
          );
          tagCount++;
        });
      });
    });

    return { channels: chCount, devices: devCount, tags: tagCount };
  });

  return tx();
}

/**
 * Dựng lại đúng cấu trúc JSON gốc từ DB hiện tại (round-trip: giữ nguyên mọi field
 * không được UI xử lý, vì mỗi channel/device/tag đều lưu raw_json đầy đủ).
 */
function exportProject() {
  const projectRow = db.prepare('SELECT * FROM project WHERE id = 1').get();
  const extra = projectRow ? JSON.parse(projectRow.extra_json) : {};

  const channels = db.prepare('SELECT * FROM channels ORDER BY sort_order, id').all();
  const devicesStmt = db.prepare('SELECT * FROM devices WHERE channel_id = ? ORDER BY sort_order, id');
  const tagsStmt = db.prepare('SELECT * FROM tags WHERE device_id = ? ORDER BY sort_order, id');

  const channelObjs = channels.map((ch) => {
    const chObj = JSON.parse(ch.raw_json);
    // đồng bộ lại các field đã có thể bị chỉnh qua UI
    chObj[CH_NAME] = ch.name;
    if (ch.driver != null) chObj[CH_DRIVER] = ch.driver;
    if (ch.port != null) chObj[CH_PORT] = ch.port;

    const devices = devicesStmt.all(ch.id).map((dev) => {
      const devObj = JSON.parse(dev.raw_json);
      devObj[DEV_NAME] = dev.name;
      if (dev.ip != null && dev.slave_id != null) {
        devObj[DEV_ID_STRING] = buildDeviceIdString(dev.ip, dev.slave_id);
      }
      if (dev.scan_rate_ms != null) devObj[DEV_SCAN_RATE] = dev.scan_rate_ms;
      if (dev.conn_timeout_s != null) devObj[DEV_CONN_TO] = dev.conn_timeout_s;
      if (dev.req_timeout_ms != null) devObj[DEV_REQ_TO] = dev.req_timeout_ms;

      const tags = tagsStmt.all(dev.id).map((tag) => {
        const tagObj = JSON.parse(tag.raw_json);
        tagObj[TAG_NAME] = tag.name;
        tagObj[TAG_ADDR] = tag.address;
        if (tag.data_type != null) tagObj[TAG_DTYPE] = tag.data_type;
        tagObj[TAG_RW] = tag.rw_access;
        if (tag.scan_rate_ms != null) tagObj[TAG_SCAN] = tag.scan_rate_ms;
        tagObj[TAG_SCALING] = tag.scaling_type;
        return tagObj;
      });

      devObj.tags = tags;
      return devObj;
    });

    chObj.devices = devices;
    return chObj;
  });

  const project = { ...extra, channels: channelObjs };
  return { project };
}

/**
 * Import kiểu MERGE: gộp thêm vào DB hiện có, không xoá dữ liệu cũ.
 * - Channel/Device trùng TÊN với dữ liệu hiện có sẽ được cập nhật (đồng bộ lại field + tags).
 * - Channel/Device mới sẽ được thêm vào cuối.
 * - Tags của 1 device khi merge sẽ được thay thế toàn bộ bằng danh sách tag trong file mới
 *   (đồng bộ đúng device đó), các device khác không bị đụng tới.
 * - Không đụng tới project.extra_json (client_interfaces, mbeglobaldata...) nếu đã có sẵn.
 */
function mergeProject(projectRoot) {
  const project = projectRoot.project || projectRoot;
  if (!Array.isArray(project.channels)) {
    throw new Error('JSON không hợp lệ: thiếu project.channels (phải là mảng)');
  }

  const tx = db.transaction(() => {
    const existingProject = db.prepare('SELECT * FROM project WHERE id = 1').get();
    if (!existingProject) {
      const extra = { ...project };
      delete extra.channels;
      const title = project['servermain.PROJECT_TITLE'] || null;
      db.prepare('INSERT INTO project (id, title, extra_json) VALUES (1, ?, ?)')
        .run(title, JSON.stringify(extra));
    }

    const insCh = db.prepare(
      'INSERT INTO channels (name, driver, port, sort_order, raw_json) VALUES (?,?,?,?,?)'
    );
    const updCh = db.prepare('UPDATE channels SET driver=?, port=?, raw_json=? WHERE id=?');
    const insDev = db.prepare(
      `INSERT INTO devices (channel_id, name, ip, slave_id, scan_rate_ms, conn_timeout_s, req_timeout_ms, sort_order, raw_json)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const updDev = db.prepare(
      `UPDATE devices SET ip=?, slave_id=?, scan_rate_ms=?, conn_timeout_s=?, req_timeout_ms=?, raw_json=? WHERE id=?`
    );
    const insTag = db.prepare(
      `INSERT INTO tags (device_id, name, address, data_type, rw_access, scan_rate_ms, scaling_type, sort_order, raw_json)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const delTagsForDevice = db.prepare('DELETE FROM tags WHERE device_id=?');

    let chNew = 0, chUpdated = 0, devNew = 0, devUpdated = 0, tagCount = 0;

    project.channels.forEach((ch) => {
      const chDevices = ch.devices || [];
      const chRaw = { ...ch };
      delete chRaw.devices;
      const chName = ch[CH_NAME] || 'Unnamed';

      let channelId;
      const existingCh = db.prepare('SELECT * FROM channels WHERE name=?').get(chName);
      if (existingCh) {
        channelId = existingCh.id;
        updCh.run(ch[CH_DRIVER] || existingCh.driver, ch[CH_PORT] ?? existingCh.port, JSON.stringify(chRaw), channelId);
        chUpdated++;
      } else {
        const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM channels').get().m;
        const info = insCh.run(chName, ch[CH_DRIVER] || null, ch[CH_PORT] ?? null, maxOrder + 1, JSON.stringify(chRaw));
        channelId = info.lastInsertRowid;
        chNew++;
      }

      chDevices.forEach((dev) => {
        const devTags = dev.tags || [];
        const devRaw = { ...dev };
        delete devRaw.tags;
        const devName = dev[DEV_NAME] || 'Unnamed';
        const { ip, slaveId } = parseDeviceIdString(dev[DEV_ID_STRING]);

        let deviceId;
        const existingDev = db.prepare('SELECT * FROM devices WHERE channel_id=? AND name=?').get(channelId, devName);
        if (existingDev) {
          deviceId = existingDev.id;
          updDev.run(
            ip ?? existingDev.ip, slaveId ?? existingDev.slave_id,
            dev[DEV_SCAN_RATE] ?? existingDev.scan_rate_ms, dev[DEV_CONN_TO] ?? existingDev.conn_timeout_s,
            dev[DEV_REQ_TO] ?? existingDev.req_timeout_ms, JSON.stringify(devRaw), deviceId
          );
          delTagsForDevice.run(deviceId);
          devUpdated++;
        } else {
          const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM devices WHERE channel_id=?').get(channelId).m;
          const info = insDev.run(
            channelId, devName, ip, slaveId, dev[DEV_SCAN_RATE] ?? null,
            dev[DEV_CONN_TO] ?? null, dev[DEV_REQ_TO] ?? null, maxOrder + 1, JSON.stringify(devRaw)
          );
          deviceId = info.lastInsertRowid;
          devNew++;
        }

        devTags.forEach((tag, tagIdx) => {
          insTag.run(
            deviceId,
            tag[TAG_NAME] || `Tag_${tagIdx + 1}`,
            tag[TAG_ADDR] != null ? String(tag[TAG_ADDR]) : null,
            tag[TAG_DTYPE] ?? null,
            tag[TAG_RW] ?? 0,
            tag[TAG_SCAN] ?? null,
            tag[TAG_SCALING] ?? 0,
            tagIdx,
            JSON.stringify(tag)
          );
          tagCount++;
        });
      });
    });

    return { channelsNew: chNew, channelsUpdated: chUpdated, devicesNew: devNew, devicesUpdated: devUpdated, tags: tagCount };
  });

  return tx();
}

module.exports = { importProject, mergeProject, exportProject, parseDeviceIdString, buildDeviceIdString };
