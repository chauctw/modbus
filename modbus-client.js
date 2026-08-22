// Đọc giá trị THẬT từ PLC qua Modbus TCP (kết nối tới IP thiết bị thật trong mạng).
// Đây là phần duy nhất của app có "chạm" tới thiết bị thật - chỉ chạy khi người dùng
// chủ động bật Realtime trên UI, không tự động polling nền toàn bộ project.

const ModbusRTU = require('modbus-serial');

const pool = new Map(); // deviceId -> { client, connecting: Promise|null }
const scanCache = new Map(); // deviceId -> { lastScanTime, values, tagIds }
const lastReadOk = new Map(); // deviceId -> timestamp của lần đọc thành công (có ít nhất 1 tag quality=good) gần nhất

// Event emitter cho trạng thái kết nối modbus thay đổi
const listeners = new Set();
function onStatusChange(fn) { listeners.add(fn); }
function offStatusChange(fn) { listeners.delete(fn); }
function _emitStatusChange() {
  // Chỉ emit khi danh sách thay đổi thực sự
  // (sẽ được gọi sau mỗi lần đọc xong)
  for (const fn of listeners) {
    try { fn(); } catch (e) { /* ignore */ }
  }
}

async function getConnection(device) {
  let entry = pool.get(device.id);
  if (entry && entry.client && entry.client.isOpen) return entry.client;
  if (entry && entry.connecting) return entry.connecting.then(() => entry.client);

  const client = new ModbusRTU();
  client.setTimeout(device.req_timeout_ms || 1000);

  let port = 502;
  try {
    const raw = device.raw_json ? JSON.parse(device.raw_json) : {};
    port = raw['modbus_ethernet.DEVICE_ETHERNET_PORT_NUMBER'] || 502;
  } catch (e) { /* giữ mặc định 502 */ }

  const connecting = client
    .connectTCP(device.ip, { port })
    .then(() => {
      client.setID(device.slave_id ?? 1);
      return client;
    })
    .catch((err) => {
      pool.delete(device.id);
      throw err;
    });

  pool.set(device.id, { client, connecting });
  await connecting;
  pool.set(device.id, { client, connecting: null });
  return client;
}

function closeConnection(deviceId) {
  const entry = pool.get(deviceId);
  if (entry && entry.client) {
    try { entry.client.close(() => {}); } catch (e) { /* ignore */ }
  }
  pool.delete(deviceId);
  scanCache.delete(String(deviceId));
  lastReadOk.delete(deviceId);
  _emitStatusChange();
}

function closeAll() {
  for (const id of pool.keys()) closeConnection(id);
}

// Parse địa chỉ kiểu Modicon: "400046" -> Holding Register offset 46 (1-based)
// Hỗ trợ hậu tố bit: "400001.1" -> đọc bit thứ 1 trong word tại 400001
function parseAddress(address) {
  const str = String(address).trim();
  const [main, bitPart] = str.split('.');
  const bit = bitPart != null && bitPart !== '' ? parseInt(bitPart, 10) : null;

  if (!/^\d{5,6}$/.test(main)) {
    throw new Error(`Địa chỉ không hợp lệ: ${address}`);
  }
  const region = main[0];
  const offsetOneBased = parseInt(main.slice(1), 10);
  const protocolOffset = offsetOneBased - 1;

  const regionMap = {
    0: 'coil',
    1: 'discrete_input',
    3: 'input_register',
    4: 'holding_register',
  };
  const kind = regionMap[region];
  if (!kind) throw new Error(`Không nhận diện được vùng nhớ từ địa chỉ: ${address}`);

  return { kind, protocolOffset, bit };
}

// Số lượng register cần đọc theo kiểu dữ liệu (đối với input/holding register)
function registerCountForType(dataType) {
  switch (dataType) {
    case 1: // Boolean (đọc nguyên word rồi so 0)
    case 2: // Char
    case 3: // Byte
    case 4: // Word
    case 5: // Short
    case 11: // BCD
      return 1;
    case 6: // DWord
    case 7: // Long
    case 8: // Float
    case 12: // LBCD
      return 2;
    case 9: // Double
    case 14: // LLong
    case 15: // QWord
      return 4;
    default:
      return 1; // fallback an toàn, các kiểu String/Date không hỗ trợ realtime
  }
}

function decodeRegisters(regs, dataType, { byteSwap = false, wordSwap = false } = {}) {
  let ordered = wordSwap ? [...regs].reverse() : regs;
  const buf = Buffer.alloc(ordered.length * 2);
  ordered.forEach((r, i) => {
    let word = r & 0xffff;
    if (byteSwap) word = ((word & 0xff) << 8) | ((word >> 8) & 0xff);
    buf.writeUInt16BE(word, i * 2);
  });

  switch (dataType) {
    case 1: return regs[0] !== 0; // Boolean
    case 2: return buf.readInt8(0); // Char (byte thấp)
    case 3: return buf.readUInt8(0); // Byte
    case 4: return buf.readUInt16BE(0); // Word
    case 5: return buf.readInt16BE(0); // Short
    case 6: return buf.readUInt32BE(0); // DWord
    case 7: return buf.readInt32BE(0); // Long
    case 8: return buf.readFloatBE(0); // Float
    case 9: return buf.readDoubleBE(0); // Double
    case 11: case 12: return regs[0]; // BCD/LBCD: hiển thị raw, không decode BCD
    case 14: return buf.readBigInt64BE(0); // LLong
    case 15: return buf.readBigUInt64BE(0); // QWord
    default: return regs[0];
  }
}

function roundTo(value, decimals) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const d = Number.isInteger(decimals) && decimals >= 0 ? decimals : 2;
  const factor = 10 ** d;
  return Math.round(value * factor) / factor;
}

function applyScaling(rawValue, scalingRaw) {
  if (!scalingRaw || typeof rawValue !== 'number') return null;
  const { rawLow, rawHigh, scaledLow, scaledHigh } = scalingRaw;
  if (rawHigh === rawLow) return null;
  const scaled = ((rawValue - rawLow) / (rawHigh - rawLow)) * (scaledHigh - scaledLow) + scaledLow;
  return scaled;
}

/**
 * Đọc giá trị hiện tại của 1 tag từ PLC thật (đọc riêng lẻ, dùng cho fallback/1 tag).
 * Trả về { value, scaledValue, quality: 'good'|'bad', error? }
 */
async function readTagValue(client, tag, device) {
  try {
    const { kind, protocolOffset, bit } = parseAddress(tag.address);

    if (kind === 'coil') {
      const r = await client.readCoils(protocolOffset, 1);
      return { value: !!r.data[0], quality: 'good' };
    }
    if (kind === 'discrete_input') {
      const r = await client.readDiscreteInputs(protocolOffset, 1);
      return { value: !!r.data[0], quality: 'good' };
    }

    if (bit != null) {
      const readFn = kind === 'holding_register' ? 'readHoldingRegisters' : 'readInputRegisters';
      const r = await client[readFn](protocolOffset, 1);
      const word = r.data[0];
      const value = ((word >> bit) & 1) === 1;
      return { value, quality: 'good' };
    }

    const count = registerCountForType(tag.data_type);
    const readFn = kind === 'holding_register' ? 'readHoldingRegisters' : 'readInputRegisters';
    const r = await client[readFn](protocolOffset, count);
    return decodeTagFromRegs(r.data, tag);
  } catch (err) {
    return { value: null, quality: 'bad', error: err.message };
  }
}

// Giải mã 1 tag từ mảng register đã đọc được (dùng chung cho đọc lẻ và đọc theo block)
function decodeTagFromRegs(regs, tag, device = {}) {
  const raw = decodeRegisters(regs, tag.data_type, {
    byteSwap: !!device.byte_swap,
    wordSwap: !!device.word_swap,
  });
  const decimals = Number.isInteger(tag.decimals) ? tag.decimals : 2;
  const isFloatType = tag.data_type === 8 || tag.data_type === 9; // Float / Double
  const roundedRaw = isFloatType && typeof raw === 'number' ? roundTo(raw, decimals) : raw;

  let scaledValue = null;
  if (tag.scaling_type) {
    const rawObj = JSON.parse(tag.raw_json);
    const scaled = applyScaling(Number(raw), {
      rawLow: rawObj['servermain.TAG_SCALING_RAW_LOW'],
      rawHigh: rawObj['servermain.TAG_SCALING_RAW_HIGH'],
      scaledLow: rawObj['servermain.TAG_SCALING_SCALED_LOW'],
      scaledHigh: rawObj['servermain.TAG_SCALING_SCALED_HIGH'],
    });
    scaledValue = scaled != null ? roundTo(scaled, decimals) : null;
  }

  return {
    value: typeof roundedRaw === 'bigint' ? roundedRaw.toString() : roundedRaw,
    scaledValue,
    quality: 'good',
  };
}

// ---- Gộp nhiều tag thành ít lệnh đọc Modbus hơn (quan trọng khi có hàng nghìn tag) ----
// Thay vì đọc từng tag 1 lệnh riêng, gộp các tag có address gần nhau (cùng vùng nhớ)
// thành 1 khối liên tục rồi đọc 1 lần, sau đó cắt buffer ra cho từng tag.
const MAX_REGS_PER_BLOCK = 120; // an toàn dưới giới hạn Modbus (125 register/lần)
const MAX_REG_GAP = 10; // cho phép "nuốt" tối đa 10 register trống giữa 2 tag để gộp khối
const MAX_BITS_PER_BLOCK = 1968; // an toàn dưới giới hạn 2000 coil/discrete input mỗi lần
const MAX_BIT_GAP = 16;

function buildBlocks(items, maxSpan, maxGap) {
  // items: [{ start, span, ...bất kỳ field nào khác }] đã biết offset (start) và số ô chiếm (span)
  const sorted = [...items].sort((a, b) => a.start - b.start || a.span - b.span);
  const blocks = [];
  let current = null;
  for (const it of sorted) {
    const itEnd = it.start + it.span;
    if (current && it.start - current.end <= maxGap && (itEnd - current.start) <= maxSpan) {
      current.end = Math.max(current.end, itEnd);
      current.items.push(it);
    } else {
      if (current) blocks.push(current);
      current = { start: it.start, end: itEnd, items: [it] };
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

/**
 * Đọc nhiều tag cùng lúc trên 1 device (1 socket), gộp các tag liền/gần nhau thành
 * ít lệnh Modbus nhất có thể thay vì 1 lệnh/tag. Giảm mạnh số round-trip khi có
 * hàng nghìn tag trên cùng 1 device.
 */
async function readTagsBatch(client, tags, device) {
  const result = {};
  const groups = { coil: [], discrete_input: [], holding_register: [], input_register: [] };

  tags.forEach((tag) => {
    try {
      const { kind, protocolOffset, bit } = parseAddress(tag.address);
      if (kind === 'coil' || kind === 'discrete_input') {
        groups[kind].push({ tag, start: protocolOffset, span: 1, bit: null });
        return;
      }
      if (bit != null) {
        groups[kind].push({ tag, start: protocolOffset, span: 1, bit });
        return;
      }
      const span = registerCountForType(tag.data_type);
      groups[kind].push({ tag, start: protocolOffset, span, bit: null });
    } catch (err) {
      result[tag.id] = { value: null, quality: 'bad', error: err.message };
    }
  });

  // coil / discrete_input: đọc theo bit, gộp khối theo MAX_BITS_PER_BLOCK
  for (const kind of ['coil', 'discrete_input']) {
    const items = groups[kind];
    if (!items.length) continue;
    const blocks = buildBlocks(items, MAX_BITS_PER_BLOCK, MAX_BIT_GAP);
    const readFn = kind === 'coil' ? 'readCoils' : 'readDiscreteInputs';
    for (const block of blocks) {
      try {
        const r = await client[readFn](block.start, block.end - block.start);
        block.items.forEach((it) => {
          result[it.tag.id] = { value: !!r.data[it.start - block.start], quality: 'good' };
        });
      } catch (err) {
        block.items.forEach((it) => {
          result[it.tag.id] = { value: null, quality: 'bad', error: err.message };
        });
      }
    }
  }

  // holding_register / input_register: gộp khối theo MAX_REGS_PER_BLOCK
  for (const kind of ['holding_register', 'input_register']) {
    const items = groups[kind];
    if (!items.length) continue;
    const blocks = buildBlocks(items, MAX_REGS_PER_BLOCK, MAX_REG_GAP);
    const readFn = kind === 'holding_register' ? 'readHoldingRegisters' : 'readInputRegisters';
    for (const block of blocks) {
      try {
        const r = await client[readFn](block.start, block.end - block.start);
        block.items.forEach((it) => {
          const idx = it.start - block.start;
          if (it.bit != null) {
            const word = r.data[idx];
            result[it.tag.id] = { value: ((word >> it.bit) & 1) === 1, quality: 'good' };
            return;
          }
          const regsSlice = r.data.slice(idx, idx + it.span);
          result[it.tag.id] = decodeTagFromRegs(regsSlice, it.tag, device);
        });
      } catch (err) {
        block.items.forEach((it) => {
          result[it.tag.id] = { value: null, quality: 'bad', error: err.message };
        });
      }
    }
  }

  return result;
}

/**
 * Đọc nhiều tag của CÙNG 1 device (tuần tự trên 1 kết nối - Modbus TCP không hỗ trợ
 * nhiều giao dịch song song trên cùng 1 socket một cách an toàn).
 * Sử dụng cache theo scan_rate_ms của thiết bị để tránh đọc PLC quá nhanh.
 */
async function readTagsForDevice(device, tags) {
  let client;
  try {
    client = await getConnection(device);
  } catch (err) {
    const result = {};
    tags.forEach((t) => { result[t.id] = { value: null, quality: 'bad', error: `Không kết nối được: ${err.message}` }; });
    _emitStatusChange();
    return result;
  }

  const cacheKey = String(device.id);
  const cached = scanCache.get(cacheKey);
  const scanRate = Number(device.scan_rate_ms) > 0 ? Number(device.scan_rate_ms) : 1000;
  const now = Date.now();
  const currentTagIds = tags.map((t) => t.id);

  if (cached && (now - cached.lastScanTime < scanRate) && cached.tagIds.length === currentTagIds.length && cached.tagIds.every((id, i) => id === currentTagIds[i])) {
    return cached.values;
  }

  const result = await readTagsBatch(client, tags, device);

  // Ghi nhận thời điểm đọc thành công nếu có ít nhất 1 tag trả về good
  const hasGood = Object.values(result).some(r => r && r.quality === 'good');
  if (hasGood) {
    lastReadOk.set(device.id, now);
  }

  // Emit khi trạng thái có thể đã thay đổi (kết nối thành công hoặc mất kết nối)
  _emitStatusChange();

  scanCache.set(cacheKey, {
    lastScanTime: now,
    values: result,
    tagIds: currentTagIds,
  });

  return result;
}

function getConnectedDeviceIds() {
  const ids = new Set();
  pool.forEach((entry, id) => {
    if (entry.client && entry.client.isOpen) ids.add(id);
  });
  return ids;
}

// Thời gian tối đa coi lastReadOk là "mới" (ms).
// Nếu lần đọc thành công cuối cùng cũ hơn ngưỡng này → coi như mất kết nối.
const STALE_THRESHOLD_MS = 15_000; // 15 giây

// Trả về danh sách device id đang "mất kết nối":
// - Không có socket trong pool, HOẶC
// - Có socket nhưng chưa từng đọc được tag nào có quality=good, HOẶC
// - Có socket + đã đọc good nhưng lần cuối quá cũ (stale)
function getDisconnectedDeviceIds(deviceIds) {
  const connectedIds = getConnectedDeviceIds();
  const now = Date.now();
  return deviceIds.filter(id => {
    if (!connectedIds.has(id)) return true; // không có socket
    if (!lastReadOk.has(id)) return true;   // có socket nhưng chưa đọc được gì good
    const lastOk = lastReadOk.get(id);
    if (now - lastOk > STALE_THRESHOLD_MS) return true; // đọc được nhưng đã cũ
    return false;
  });
}

module.exports = { readTagsForDevice, closeConnection, closeAll, parseAddress, getConnectedDeviceIds, getDisconnectedDeviceIds, onStatusChange, offStatusChange };