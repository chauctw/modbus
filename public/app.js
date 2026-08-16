const API = '';
let state = {
  tree: [],
  currentDeviceId: null,
  currentChannelId: null,
  tagSearch: '',
  sort: 'sort_order',
  dir: 'asc',
  page: 1,
  pageSize: 200,
  selected: new Set(),
  dataTypes: {},
  realtimeEnabled: false,
  realtimeTimer: null,
  realtimeFilter: false,
};

const REALTIME_POLL_MS = 2000;

const $ = (sel) => document.querySelector(sel);
const modalRoot = $('#modalRoot');
let expandedChannels = new Set();

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
    ...opts,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || 'Lỗi không xác định');
  return data;
}

function closeModal() { modalRoot.innerHTML = ''; }
function openModal(html) {
  modalRoot.innerHTML = `<div class="modal-backdrop" id="backdrop"><div class="modal">${html}</div></div>`;
  $('#backdrop').addEventListener('click', (e) => { if (e.target.id === 'backdrop') closeModal(); });
}

// ---------- DASHBOARD ----------
async function loadDashboard() {
  const [stats, validation] = await Promise.all([api('/api/stats'), api('/api/validate')]);
  state.dataTypes = state.dataTypes;
  const el = $('#dashboard');
  const problems = validation.dupTagNames.length + validation.dupTagAddress.length +
    validation.dupDeviceNames.length + validation.dupChannelNames.length +
    validation.emptyAddressCount + stats.duplicateIPs.length;

  const fastScan = stats.byScanRate.filter(r => r.scan_rate_ms != null && r.scan_rate_ms <= 100)
    .reduce((s, r) => s + r.count, 0);

  el.innerHTML = `
    <div class="stat-card"><div class="num">${stats.totals.channels}</div><div class="label">CHANNELS</div></div>
    <div class="stat-card"><div class="num">${stats.totals.devices}</div><div class="label">DEVICES</div></div>
    <div class="stat-card"><div class="num">${stats.totals.tags}</div><div class="label">TAGS</div></div>
    <div class="stat-card ${fastScan > 500 ? 'warn' : ''}"><div class="num">${fastScan}</div><div class="label">TAGS SCAN &le;100MS</div></div>
    <div class="stat-card ${problems ? 'danger' : ''}"><div class="num">${problems}</div><div class="label">CẢNH BÁO / TRÙNG LẶP</div></div>
  `;
}

// ---------- TREE ----------
async function loadTree() {
  state.tree = await api('/api/tree');
  renderTree();
}

function renderTree() {
  const filter = $('#treeSearch').value.trim().toLowerCase();
  const treeEl = $('#tree');
  treeEl.innerHTML = '';

  state.tree.forEach((ch) => {
    if (ch.name === '__REALTIME__') return;
    const devices = ch.devices.filter((d) => !filter || d.name.toLowerCase().includes(filter) || ch.name.toLowerCase().includes(filter));
    if (filter && !ch.name.toLowerCase().includes(filter) && !devices.length) return;
    const totalTags = ch.devices.reduce((s, d) => s + d.tagCount, 0);
    const isExpanded = expandedChannels.has(String(ch.id)) || state.currentChannelId === ch.id;

    const chDiv = document.createElement('div');
    chDiv.className = 'tree-channel';
    chDiv.innerHTML = `
      <div class="tree-channel-row ${isExpanded ? 'expanded' : ''}" data-channel="${ch.id}">
        <span class="tree-channel-toggle">▶</span>
        <span class="tree-channel-name">📁 ${escapeHtml(ch.name)}</span>
        <span class="badge">${ch.devices.length} dev / ${totalTags} tag</span>
        <button class="tree-channel-actions" title="Tùy chọn">⋯</button>
      </div>
      <div class="tree-devices ${isExpanded ? '' : 'collapsed'}"></div>
    `;
    const devicesEl = chDiv.querySelector('.tree-devices');
    (filter ? devices : ch.devices).forEach((d) => {
      const row = document.createElement('div');
      row.className = 'tree-device-row' + (d.id === state.currentDeviceId ? ' active' : '');
      row.dataset.device = d.id;
      row.dataset.channel = ch.id;
      row.innerHTML = `<span>🖥 ${escapeHtml(d.name)}</span><span class="badge">${d.tagCount}</span>`;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        selectDevice(ch.id, d.id);
      });
      devicesEl.appendChild(row);
    });

    chDiv.querySelector('.tree-channel-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      if (expandedChannels.has(String(ch.id))) {
        expandedChannels.delete(String(ch.id));
      } else {
        expandedChannels.add(String(ch.id));
      }
      renderTree();
    });

    chDiv.querySelector('.tree-channel-name').addEventListener('click', (e) => {
      e.stopPropagation();
      if (expandedChannels.has(String(ch.id))) {
        expandedChannels.delete(String(ch.id));
      } else {
        expandedChannels.add(String(ch.id));
      }
      renderTree();
    });

    chDiv.querySelector('.tree-channel-actions').addEventListener('click', (e) => {
      e.stopPropagation();
      openChannelMenu(ch);
    });
    treeEl.appendChild(chDiv);
  });
}

function openChannelMenu(ch) {
  openModal(`
    <h3>Channel: ${escapeHtml(ch.name)}</h3>
    <div class="field"><label>Tên</label><input id="f-name" value="${escapeHtml(ch.name)}" /></div>
    <div class="field-row">
      <div class="field"><label>Driver</label><input id="f-driver" value="${escapeHtml(ch.driver || '')}" /></div>
      <div class="field"><label>Cổng TCP</label><input id="f-port" type="number" value="${ch.port || 502}" /></div>
    </div>
    <div class="field">
      <button class="btn btn-block" id="addDeviceInChannel">+ Thêm Device vào channel này</button>
    </div>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn btn-danger" id="delCh">Xoá channel (${ch.deviceCount} device, ${ch.tagCount} tag)</button>
      <button class="btn" onclick="closeModal()">Đóng</button>
      <button class="btn btn-primary" id="saveCh">Lưu</button>
    </div>
  `);
  $('#saveCh').onclick = async () => {
    try {
      await api(`/api/channels/${ch.id}`, { method: 'PUT', body: JSON.stringify({
        name: $('#f-name').value, driver: $('#f-driver').value, port: Number($('#f-port').value),
      }) });
      closeModal(); await loadTree();
    } catch (e) { $('#err').textContent = e.message; }
  };
  $('#delCh').onclick = async () => {
    if (!confirm(`Xoá channel "${ch.name}" sẽ xoá ${ch.deviceCount} device và ${ch.tagCount} tag. Chắc chắn?`)) return;
    await api(`/api/channels/${ch.id}`, { method: 'DELETE' });
    closeModal(); state.currentDeviceId = null; showEmptyState(); await loadTree(); await loadDashboard();
  };
  $('#addDeviceInChannel').onclick = () => { closeModal(); openDeviceForm(ch.id); };
}

$('#addChannelBtn').addEventListener('click', () => {
  openModal(`
    <h3>Thêm Channel</h3>
    <div class="field"><label>Tên</label><input id="f-name" placeholder="VD: HUNGPHU" /></div>
    <div class="field-row">
      <div class="field"><label>Driver</label><input id="f-driver" value="Modbus TCP/IP Ethernet" /></div>
      <div class="field"><label>Cổng TCP</label><input id="f-port" type="number" value="502" /></div>
    </div>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Huỷ</button>
      <button class="btn btn-primary" id="save">Tạo</button>
    </div>
  `);
  $('#save').onclick = async () => {
    try {
      await api('/api/channels', { method: 'POST', body: JSON.stringify({
        name: $('#f-name').value, driver: $('#f-driver').value, port: Number($('#f-port').value),
      }) });
      closeModal(); await loadTree(); await loadDashboard();
    } catch (e) { $('#err').textContent = e.message; }
  };
});

$('#treeSearch').addEventListener('input', renderTree);

// ---------- DEVICE ----------
async function selectDevice(channelId, deviceId) {
  stopRealtime();
  if (state.currentDeviceId && state.currentDeviceId !== deviceId) {
    api(`/api/devices/${state.currentDeviceId}/live-disconnect`, { method: 'POST' }).catch(() => {});
  }
  state.currentChannelId = channelId;
  state.currentDeviceId = deviceId;
  state.page = 1;
  state.selected.clear();
  expandedChannels.clear();
  expandedChannels.add(String(channelId));
  renderTree();
  const dev = await api(`/api/devices/${deviceId}`);
  $('#emptyState').style.display = 'none';
  $('#deviceHeader').style.display = 'flex';
  $('#tagToolbar').style.display = 'flex';
  $('#deviceTitle').textContent = dev.name;
  $('#deviceMeta').textContent = `IP: ${dev.ip || '-'} | Slave ID: ${dev.slave_id ?? '-'} | Scan: ${dev.scan_rate_ms}ms | Timeout: ${dev.conn_timeout_s}s / ${dev.req_timeout_ms}ms | Byte Swap: ${dev.byte_swap ? 'Bật' : 'Tắt'} | Word Swap: ${dev.word_swap ? 'Bật' : 'Tắt'}`;

  $('#editDeviceBtn').style.display = '';
  $('#duplicateDeviceBtn').style.display = '';
  $('#deleteDeviceBtn').style.display = '';
  $('#editDeviceBtn').onclick = () => openDeviceForm(channelId, dev);
  $('#duplicateDeviceBtn').onclick = () => openDuplicateForm(dev);
  $('#deleteDeviceBtn').onclick = async () => {
    if (!confirm(`Xoá device "${dev.name}" và ${dev.tagCount} tag bên trong?`)) return;
    await api(`/api/devices/${deviceId}`, { method: 'DELETE' });
    state.currentDeviceId = null;
    showEmptyState(); await loadTree(); await loadDashboard();
  };

  await loadTags();
}

function showEmptyState() {
  stopRealtime();
  $('#emptyState').style.display = 'block';
  $('#deviceHeader').style.display = 'none';
  $('#tagToolbar').style.display = 'none';
  $('#tagTable').style.display = 'none';
  $('#tagPagination').innerHTML = '';
  expandedChannels.clear();
  state.currentChannelId = null;
  state.currentDeviceId = null;
  renderTree();
}

function openDeviceForm(channelId, dev = null) {
  const isEdit = !!dev;
  openModal(`
    <h3>${isEdit ? 'Sửa' : 'Thêm'} Device</h3>
    <div class="field"><label>Tên</label><input id="f-name" value="${dev ? escapeHtml(dev.name) : ''}" /></div>
    <div class="field-row">
      <div class="field"><label>IP</label><input id="f-ip" value="${dev ? dev.ip || '' : ''}" placeholder="192.168.1.10" /></div>
      <div class="field"><label>Slave ID (0-255)</label><input id="f-slave" type="number" value="${dev ? dev.slave_id ?? 1 : 1}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Scan Mode Rate (ms)</label><input id="f-scan" type="number" value="${dev ? dev.scan_rate_ms : 1000}" /></div>
      <div class="field"><label>Conn Timeout (s)</label><input id="f-conn" type="number" value="${dev ? dev.conn_timeout_s : 1}" /></div>
    </div>
    <div class="field"><label>Request Timeout (ms)</label><input id="f-req" type="number" value="${dev ? dev.req_timeout_ms : 1000}" /></div>
    <div class="checkbox-inline"><input type="checkbox" id="f-byteswap" ${dev && dev.byte_swap ? 'checked' : ''} /> <label for="f-byteswap">Đảo Byte (Byte Swap)</label></div>
    <div class="checkbox-inline"><input type="checkbox" id="f-wordswap" ${dev && dev.word_swap ? 'checked' : ''} /> <label for="f-wordswap">Đảo Word (Word Swap)</label></div>
    <p class="muted">Bật 2 tuỳ chọn này nếu giá trị Realtime (đặc biệt kiểu Float/DWord/Long, 32-bit trở lên) đọc về sai — do PLC dùng thứ tự byte/word khác mặc định. Thử bật/tắt để tìm đúng tổ hợp khớp với thiết bị thật.</p>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Huỷ</button>
      <button class="btn btn-primary" id="save">Lưu</button>
    </div>
  `);
  $('#save').onclick = async () => {
    const body = {
      name: $('#f-name').value,
      ip: $('#f-ip').value,
      slave_id: Number($('#f-slave').value),
      scan_rate_ms: Number($('#f-scan').value),
      conn_timeout_s: Number($('#f-conn').value),
      req_timeout_ms: Number($('#f-req').value),
      byte_swap: $('#f-byteswap').checked,
      word_swap: $('#f-wordswap').checked,
    };
    try {
      if (isEdit) await api(`/api/devices/${dev.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/devices', { method: 'POST', body: JSON.stringify({ ...body, channel_id: channelId }) });
      closeModal(); await loadTree(); await loadDashboard();
      if (isEdit) await selectDevice(channelId, dev.id);
    } catch (e) { $('#err').textContent = e.message; }
  };
}

function openDuplicateForm(dev) {
  openModal(`
    <h3>Duplicate Device: ${escapeHtml(dev.name)}</h3>
    <div class="field"><label>Tên mới</label><input id="f-name" value="${dev.name}_COPY" /></div>
    <div class="field"><label>IP mới</label><input id="f-ip" value="${dev.ip || ''}" /></div>
    <p class="muted">Toàn bộ ${dev.tagCount} tag sẽ được nhân bản kèm theo.</p>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Huỷ</button>
      <button class="btn btn-primary" id="save">Nhân bản</button>
    </div>
  `);
  $('#save').onclick = async () => {
    try {
      const r = await api(`/api/devices/${dev.id}/duplicate`, { method: 'POST', body: JSON.stringify({
        newName: $('#f-name').value, newIp: $('#f-ip').value,
      }) });
      closeModal(); await loadTree(); await loadDashboard();
      await selectDevice(state.currentChannelId, r.id);
    } catch (e) { $('#err').textContent = e.message; }
  };
}

// ---------- TAGS TABLE ----------
let dataTypesCache = null;
async function getDataTypes() {
  if (!dataTypesCache) dataTypesCache = await api('/api/data-types');
  return dataTypesCache;
}

async function loadTags() {
  const dataTypes = await getDataTypes();
  const q = new URLSearchParams({
    search: state.tagSearch, sort: state.sort, dir: state.dir, page: state.page, pageSize: state.pageSize,
    realtime: state.realtimeFilter ? 1 : 0,
  });
  const { total, rows } = await api(`/api/devices/${state.currentDeviceId}/tags?${q}`);
  $('#tagCountLabel').textContent = `${total} tag`;
  $('#filterOnBtn').classList.toggle('btn-primary', state.realtimeFilter);
  $('#tagTable').style.display = 'table';

  const tbody = $('#tagTableBody');
  tbody.innerHTML = '';
  rows.forEach((tag, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.id = tag.id;
    const stt = (state.page - 1) * state.pageSize + idx + 1;
    const scalingLabel = tag.scaling_type ? 'Linear' : 'None';
    const rtClass = tag.realtime_enabled ? 'on' : 'off';
    tr.innerHTML = `
      <td class="muted">${stt}</td>
      <td><input type="checkbox" class="row-check" ${state.selected.has(tag.id) ? 'checked' : ''} /></td>
      <td><input type="text" class="cell-name" value="${escapeHtml(tag.name)}" /></td>
      <td><input type="text" class="cell-address" value="${escapeHtml(tag.address || '')}" /></td>
      <td>
        <select class="cell-datatype">
          ${Object.entries(dataTypes).map(([code, n]) => `<option value="${code}" ${Number(code) === tag.data_type ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </td>
      <td>
        <select class="cell-rw">
          <option value="0" ${tag.rw_access === 0 ? 'selected' : ''}>Read Only</option>
          <option value="1" ${tag.rw_access === 1 ? 'selected' : ''}>Read/Write</option>
        </select>
      </td>
      <td><input type="number" class="cell-scan" value="${tag.scan_rate_ms ?? ''}" /></td>
      <td class="muted">${scalingLabel}</td>
      <td><button class="rt-toggle ${rtClass}" data-tag-id="${tag.id}">${tag.realtime_enabled ? 'ON' : 'OFF'}</button></td>
      <td class="cell-live"><span class="live-value"><span class="live-dot"></span><span class="live-text muted">—</span></span></td>
      <td class="row-actions">
        <button class="icon-btn edit-btn" title="Sửa chi tiết (scaling)">⚙</button>
        <button class="icon-btn del-btn" title="Xoá">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);

    tr.querySelector('.row-check').addEventListener('change', (e) => {
      if (e.target.checked) state.selected.add(tag.id); else state.selected.delete(tag.id);
      updateBulkButtons();
    });
    tr.querySelector('.rt-toggle').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const isOn = btn.classList.contains('on');
      const newState = isOn ? 0 : 1;
      try {
        await api(`/api/tags/${tag.id}`, { method: 'PUT', body: JSON.stringify({ realtime_enabled: newState }) });
        await loadTags();
        await loadTree();
        const anyOn = document.querySelectorAll('#tagTableBody .rt-toggle.on').length > 0;
        if (!anyOn) stopRealtime();
        else if (!state.realtimeEnabled) startRealtime();
      } catch (err) {
        alert(err.message);
        loadTags();
      }
    });
    tr.querySelector('.edit-btn').addEventListener('click', () => openTagForm(tag));
    tr.querySelector('.del-btn').addEventListener('click', async () => {
      if (!confirm(`Xoá tag "${tag.name}"?`)) return;
      await api(`/api/tags/${tag.id}`, { method: 'DELETE' });
      await loadTags(); await loadTree(); await loadDashboard();
    });
    ['cell-name', 'cell-address', 'cell-datatype', 'cell-rw', 'cell-scan'].forEach((cls) => {
      const el = tr.querySelector('.' + cls);
      el.addEventListener('change', () => saveInlineEdit(tag.id, tr));
    });
  });

  renderPagination(total);

  const anyOn = document.querySelectorAll('#tagTableBody .rt-toggle.on').length > 0;
  if (anyOn && !state.realtimeEnabled) startRealtime();
  else if (!anyOn && state.realtimeEnabled) stopRealtime();
}

// ---------- REALTIME ----------
function setLiveCell(tagId, result) {
  const tr = document.querySelector(`#tagTableBody tr[data-id="${tagId}"]`);
  if (!tr) return;
  const dot = tr.querySelector('.live-dot');
  const text = tr.querySelector('.live-text');
  if (!dot || !text) return;

  if (!result || result.quality === 'bad') {
    dot.className = 'live-dot bad';
    text.className = 'live-text';
    text.textContent = 'Lỗi';
    text.title = result?.error || 'Không đọc được';
    return;
  }
  dot.className = 'live-dot good';
  text.className = 'live-text';
  text.title = '';
  if (typeof result.value === 'boolean') {
    text.textContent = result.value ? 'TRUE' : 'FALSE';
  } else if (result.scaledValue != null) {
    text.textContent = `${formatNum(result.scaledValue)} (raw ${formatNum(result.value)})`;
  } else {
    text.textContent = formatNum(result.value);
  }
}

function formatNum(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v);
}

async function pollLiveValues() {
  if (!state.realtimeEnabled || !state.currentDeviceId) return;
  const rows = document.querySelectorAll('#tagTableBody tr');
  const tagIds = [...rows]
    .map((r) => Number(r.dataset.id))
    .filter((id) => {
      const toggle = document.querySelector(`#tagTableBody tr[data-id="${id}"] .rt-toggle`);
      return toggle ? toggle.classList.contains('on') : true;
    });
  if (!tagIds.length) return;
  try {
    const { values } = await api(`/api/devices/${state.currentDeviceId}/live-read`, {
      method: 'POST', body: JSON.stringify({ tagIds }),
    });
    Object.entries(values).forEach(([id, res]) => setLiveCell(Number(id), res));
    $('#realtimeStatus').textContent = `Cập nhật lúc ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    $('#realtimeStatus').textContent = 'Lỗi đọc realtime: ' + e.message;
  }
}

function startRealtime() {
  if (state.realtimeEnabled) return;
  state.realtimeEnabled = true;
  pollLiveValues();
  state.realtimeTimer = setInterval(pollLiveValues, REALTIME_POLL_MS);
}

function stopRealtime() {
  state.realtimeEnabled = false;
  if (state.realtimeTimer) clearInterval(state.realtimeTimer);
  state.realtimeTimer = null;
  const status = $('#realtimeStatus');
  if (status) status.textContent = '';
}

async function saveInlineEdit(id, tr) {
  const body = {
    name: tr.querySelector('.cell-name').value,
    address: tr.querySelector('.cell-address').value,
    data_type: Number(tr.querySelector('.cell-datatype').value),
    rw_access: Number(tr.querySelector('.cell-rw').value),
    scan_rate_ms: Number(tr.querySelector('.cell-scan').value),
  };
  try {
    await api(`/api/tags/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    await loadDashboard();
  } catch (e) { alert(e.message); await loadTags(); }
}

function renderPagination(total) {
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  const el = $('#tagPagination');
  el.innerHTML = `
    <button class="btn" id="prevPage" ${state.page <= 1 ? 'disabled' : ''}>‹ Trước</button>
    <span class="muted">Trang ${state.page}/${pages}</span>
    <button class="btn" id="nextPage" ${state.page >= pages ? 'disabled' : ''}>Sau ›</button>
  `;
  $('#prevPage').onclick = () => { state.page--; loadTags(); };
  $('#nextPage').onclick = () => { state.page++; loadTags(); };
}

function updateBulkButtons() {
  const has = state.selected.size > 0;
  $('#bulkDeleteBtn').disabled = !has;
  $('#bulkScanRateBtn').disabled = !has;
}

$('#selectAllTags').addEventListener('change', (e) => {
  document.querySelectorAll('.row-check').forEach((cb) => {
    cb.checked = e.target.checked;
    const id = Number(cb.closest('tr').dataset.id);
    if (e.target.checked) state.selected.add(id); else state.selected.delete(id);
  });
  updateBulkButtons();
});

document.querySelectorAll('#tagTable th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (state.sort === col) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else { state.sort = col; state.dir = 'asc'; }
    loadTags();
  });
});

let searchDebounce;
$('#tagSearch').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { state.tagSearch = e.target.value; state.page = 1; loadTags(); }, 250);
});

$('#filterOnBtn').addEventListener('click', () => {
  state.realtimeFilter = !state.realtimeFilter;
  state.page = 1;
  loadTags();
});

$('#bulkDeleteBtn').addEventListener('click', async () => {
  if (!state.selected.size) return;
  if (!confirm(`Xoá ${state.selected.size} tag đã chọn?`)) return;
  await api('/api/tags/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: [...state.selected] }) });
  state.selected.clear();
  await loadTags(); await loadTree(); await loadDashboard();
});

$('#bulkScanRateBtn').addEventListener('click', () => {
  openModal(`
    <h3>Sửa Scan Rate hàng loạt (${state.selected.size} tag)</h3>
    <div class="field"><label>Scan Rate mới (ms)</label><input id="f-rate" type="number" value="1000" /></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Huỷ</button>
      <button class="btn btn-primary" id="save">Áp dụng</button>
    </div>
  `);
  $('#save').onclick = async () => {
    await api('/api/tags/bulk-update', { method: 'POST', body: JSON.stringify({
      ids: [...state.selected], patch: { scan_rate_ms: Number($('#f-rate').value) },
    }) });
    closeModal(); state.selected.clear();
    await loadTags(); await loadDashboard();
  };
});

// ---------- TAG FORM (add / edit with scaling) ----------
async function openTagForm(tag = null) {
  const dataTypes = await getDataTypes();
  const isEdit = !!tag;
  const hasScaling = tag ? !!tag.scaling_type : false;
  const raw = tag ? JSON.parse(tag.raw_json) : {};

  openModal(`
    <h3>${isEdit ? 'Sửa' : 'Thêm'} Tag</h3>
    <div class="field"><label>Tên</label><input id="f-name" value="${tag ? escapeHtml(tag.name) : ''}" /></div>
    <div class="field-row">
      <div class="field"><label>Address</label><input id="f-address" value="${tag ? escapeHtml(tag.address || '') : ''}" placeholder="VD: 400001" /></div>
      <div class="field"><label>Data Type</label>
        <select id="f-datatype">
          ${Object.entries(dataTypes).map(([code, n]) => `<option value="${code}" ${tag && Number(code) === tag.data_type ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>R/W Access</label>
        <select id="f-rw">
          <option value="0" ${!tag || tag.rw_access === 0 ? 'selected' : ''}>Read Only</option>
          <option value="1" ${tag && tag.rw_access === 1 ? 'selected' : ''}>Read/Write</option>
        </select>
      </div>
      <div class="field"><label>Scan Rate (ms)</label><input id="f-scan" type="number" value="${tag ? tag.scan_rate_ms : 1000}" /></div>
    </div>
      <div class="field"><label>Số chữ số thập phân hiển thị (Realtime)</label><input id="f-decimals" type="number" min="0" max="6" value="${tag && Number.isInteger(tag.decimals) ? tag.decimals : 2}" /></div>
    <div class="checkbox-inline"><input type="checkbox" id="f-realtime" ${tag && tag.realtime_enabled ? 'checked' : ''} /> <label for="f-realtime">Bật Realtime</label></div>
    <div class="checkbox-inline"><input type="checkbox" id="f-scaling-enabled" ${hasScaling ? 'checked' : ''} /> <label for="f-scaling-enabled">Bật Scaling (Linear)</label></div>
    <div id="scalingFields" style="display:${hasScaling ? 'block' : 'none'}">
      <div class="field-row">
        <div class="field"><label>Raw Low</label><input id="f-rawlow" type="number" value="${raw['servermain.TAG_SCALING_RAW_LOW'] ?? 0}" /></div>
        <div class="field"><label>Raw High</label><input id="f-rawhigh" type="number" value="${raw['servermain.TAG_SCALING_RAW_HIGH'] ?? 10000}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Scaled Low</label><input id="f-scaledlow" type="number" value="${raw['servermain.TAG_SCALING_SCALED_LOW'] ?? 0}" /></div>
        <div class="field"><label>Scaled High</label><input id="f-scaledhigh" type="number" value="${raw['servermain.TAG_SCALING_SCALED_HIGH'] ?? 1000}" /></div>
      </div>
      <div class="field"><label>Scaled Data Type</label>
        <select id="f-scaleddatatype">
          ${Object.entries(dataTypes).map(([code, n]) => `<option value="${code}" ${Number(code) === (raw['servermain.TAG_SCALING_SCALED_DATA_TYPE'] ?? 8) ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Units</label><input id="f-units" value="${escapeHtml(raw['servermain.TAG_SCALING_UNITS'] || '')}" /></div>
      <div class="scaling-preview" id="scalingPreview"></div>
    </div>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Huỷ</button>
      <button class="btn btn-primary" id="save">Lưu</button>
    </div>
  `);

  const toggleScaling = () => { $('#scalingFields').style.display = $('#f-scaling-enabled').checked ? 'block' : 'none'; updatePreview(); };
  $('#f-scaling-enabled').addEventListener('change', toggleScaling);

  function updatePreview() {
    if (!$('#f-scaling-enabled').checked) return;
    const rl = Number($('#f-rawlow').value), rh = Number($('#f-rawhigh').value);
    const sl = Number($('#f-scaledlow').value), sh = Number($('#f-scaledhigh').value);
    $('#scalingPreview').textContent =
      `scaled = (raw - ${rl}) / (${rh} - ${rl}) * (${sh} - ${sl}) + ${sl}`;
  }
  ['f-rawlow', 'f-rawhigh', 'f-scaledlow', 'f-scaledhigh'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updatePreview);
  });
  updatePreview();

  $('#save').onclick = async () => {
    const scalingEnabled = $('#f-scaling-enabled').checked;
    const body = {
      name: $('#f-name').value,
      address: $('#f-address').value,
      data_type: Number($('#f-datatype').value),
      rw_access: Number($('#f-rw').value),
      scan_rate_ms: Number($('#f-scan').value),
      decimals: Number($('#f-decimals').value),
      realtime_enabled: $('#f-realtime').checked ? 1 : 0,
      scaling: scalingEnabled ? {
        rawLow: Number($('#f-rawlow').value), rawHigh: Number($('#f-rawhigh').value),
        scaledLow: Number($('#f-scaledlow').value), scaledHigh: Number($('#f-scaledhigh').value),
        scaledDataType: Number($('#f-scaleddatatype').value), units: $('#f-units').value,
      } : null,
    };
    try {
      if (isEdit) await api(`/api/tags/${tag.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/tags', { method: 'POST', body: JSON.stringify({ ...body, device_id: state.currentDeviceId }) });
      closeModal(); await loadTags(); await loadTree(); await loadDashboard();
    } catch (e) { $('#err').textContent = e.message; }
  };
}

$('#addTagBtn').addEventListener('click', () => openTagForm());

$('#bulkAddBtn').addEventListener('click', () => {
  openModal(`
    <h3>Thêm tag hàng loạt</h3>
    <p class="muted">Dán CSV/TSV: mỗi dòng <b>tên,address,data_type,scan_rate</b> (data_type và scan_rate có thể bỏ trống).</p>
    <div class="field"><textarea id="f-csv" placeholder="PV_LEVEL_1,400001,5,100&#10;PV_LEVEL_2,400002,5,100"></textarea></div>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Huỷ</button>
      <button class="btn btn-primary" id="save">Tạo</button>
    </div>
  `);
  $('#save').onclick = async () => {
    try {
      const r = await api('/api/tags/bulk-create', { method: 'POST', body: JSON.stringify({
        device_id: state.currentDeviceId, csv: $('#f-csv').value,
      }) });
      closeModal();
      await loadTags(); await loadTree(); await loadDashboard();
      if (r.errors.length) alert(`Tạo ${r.created} tag. Có ${r.errors.length} dòng lỗi:\n` + r.errors.map(e => `Dòng ${e.line}: ${e.reason}`).join('\n'));
    } catch (e) { $('#err').textContent = e.message; }
  };
});

// ---------- IMPORT / EXPORT / RESET ----------
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const isFirstImport = state.tree.length === 0;
  let mode = 'replace';
  if (!isFirstImport) {
    const merge = confirm(
      'Đã có dữ liệu trong hệ thống.\n\n' +
      'Bấm OK để GỘP THÊM (giữ lại channel/device cũ, chỉ thêm/cập nhật theo file mới).\n' +
      'Bấm Cancel để THAY THẾ TOÀN BỘ (xoá hết dữ liệu cũ, chỉ giữ lại đúng nội dung file mới).'
    );
    mode = merge ? 'merge' : 'replace';
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);
  try {
    const r = await api('/api/import', { method: 'POST', body: formData });
    if (r.mode === 'merge') {
      alert(`Gộp thành công: ${r.imported.channelsNew} channel mới, ${r.imported.channelsUpdated} channel cập nhật, ${r.imported.devicesNew} device mới, ${r.imported.devicesUpdated} device cập nhật, ${r.imported.tags} tag.`);
    } else {
      alert(`Import (thay thế) thành công: ${r.imported.channels} channel, ${r.imported.devices} device, ${r.imported.tags} tag.`);
    }
    state.currentDeviceId = null;
    showEmptyState();
    await loadTree(); await loadDashboard();
  } catch (err) { alert('Import lỗi: ' + err.message); }
  e.target.value = '';
});

$('#exportBtn').addEventListener('click', () => { window.location.href = '/api/export'; });

$('#resetBtn').addEventListener('click', async () => {
  if (!confirm('Xoá toàn bộ dữ liệu hiện tại trong DB? Hành động này không thể hoàn tác.')) return;
  await api('/api/reset', { method: 'POST' });
  state.currentDeviceId = null;
  showEmptyState();
  await loadTree(); await loadDashboard();
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

window.addEventListener('beforeunload', () => {
  if (state.currentDeviceId) {
    navigator.sendBeacon(`/api/devices/${state.currentDeviceId}/live-disconnect`, JSON.stringify({}));
  }
});

// ---------- INIT ----------
(async function init() {
  await loadDashboard();
  await loadTree();
})();
