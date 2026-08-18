const API = '';
let state = {
  tree: [],
  currentDeviceId: null,
  currentChannelId: null,
  tagSearch: '',
  sort: 'sort_order',
  dir: 'asc',
  page: 1,
  pageSize: 999999, // Đã tăng tối đa để không phân trang
  total: 0,
  selected: new Set(),
  dataTypes: {},
  realtimeEnabled: false,
  realtimeTimer: null,
  realtimeFilter: false,
  tbDevices: [],
  tbFilter: false,
  tbPage: 1,
  tbPageSize: 999999, // Đã tăng tối đa để không phân trang
  tbTotal: 0,
  lfPage: 1,
  lfPageSize: 999999, // Đã tăng tối đa để không phân trang
  lfTotal: 0,
};

// Auto adjust pageSize - Đã vô hiệu hóa để hiển thị toàn bộ dữ liệu trên thanh cuộn dọc
let _pageSizeDebounce;
function updatePageSize() {
  return;
}
updatePageSize();
window.addEventListener('resize', updatePageSize);
window.addEventListener('orientationchange', updatePageSize);

let realtimePollMs = 2000;

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

  const fastScan = stats.byDeviceScanRate.filter(r => r.scan_rate_ms != null && r.scan_rate_ms <= 100)
    .reduce((s, r) => s + r.count, 0);

  el.innerHTML = `
    <div class="stat-card"><div class="num">${stats.totals.channels}</div><div class="label">CHANNELS</div></div>
    <div class="stat-card"><div class="num">${stats.totals.devices}</div><div class="label">DEVICES</div></div>
    <div class="stat-card"><div class="num">${stats.totals.tags}</div><div class="label">TAGS</div></div>
    <div class="stat-card ${fastScan > 500 ? 'warn' : ''}"><div class="num">${fastScan}</div><div class="label">TAGS SCAN &le;100MS</div></div>
    <div class="stat-card ${problems ? 'danger' : ''}"><div class="num">${problems}</div><div class="label">TAG TRÙNG LẶP</div></div>
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

  // =========================================================
  // 1. THINGSBOARD SECTION (Đưa lên đầu tiên)
  // =========================================================
  const tbSection = document.createElement('div');
  tbSection.className = 'tree-channel';
  const tbDevices = state.tbDevices.filter((tb) => !filter || tb.name.toLowerCase().includes(filter));
  tbSection.innerHTML = `
    <div class="tree-channel-row" data-channel="__tb__">
      <span class="tree-channel-name">THINGSBOARD DEVICES</span>
      <button class="tree-channel-actions" title="Thêm thiết bị TB">+</button>
    </div>
  `;

  tbSection.querySelector('.tree-channel-name').addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Nếu đang ở màn hình ThingsBoard rồi thì bỏ qua, không làm gì cả
    if (state.currentChannelId === '__tb__') return; 

    // Nếu chưa ở màn hình ThingsBoard thì mới chuyển sang
    state.currentChannelId = '__tb__';
    state.currentDeviceId = null;
    currentLiveSource = null; 
    expandedChannels.clear();
    $('#emptyState').style.display = 'none';
    $('#deviceHeader').style.display = 'none';
    $('#tagToolbar').style.display = 'none';
    $('#tagTableWrap').style.display = 'none';
    $('#tagPagination').style.display = 'none';
    $('#liveFetchConfigBar').style.display = 'none'; 
    $('#liveFetchTableWrap').style.display = 'none';
    $('#liveFetchPagination').style.display = 'none'; 
    $('#tbDeviceTableWrap').style.display = 'block';
    $('#tbDevicePagination').style.display = 'none'; 
    renderTbDeviceList(state.tbDevices);
    renderTree();
  });

  tbSection.querySelector('.tree-channel-actions').addEventListener('click', (e) => {
    e.stopPropagation();
    openTbDeviceForm();
  });

  treeEl.appendChild(tbSection);

  // =========================================================
  // 2. CHANNEL API FETCH (Đưa lên thứ 2)
  // =========================================================
  const apiSection = document.createElement('div');
  apiSection.className = 'tree-channel';
  
  const isApiExpanded = expandedChannels.has('__api__'); 
  
  apiSection.innerHTML = `
    <div class="tree-channel-row ${isApiExpanded ? 'expanded' : ''}" data-channel="__api__">
      <span class="tree-channel-toggle">▶</span>
      <span class="tree-channel-name">CHANNEL API FETCH</span>
      <button class="tree-channel-actions" title="Tùy chọn">⋯</button>
    </div>
    <div class="tree-devices ${isApiExpanded ? '' : 'collapsed'}"></div>
  `;
  
  const apiDevicesEl = apiSection.querySelector('.tree-devices');
  liveFetchSources.forEach((src) => {
    const row = document.createElement('div');
    row.className = 'tree-device-row' + (currentLiveSource === src.key ? ' active' : '');
    row.dataset.device = src.key;
    row.dataset.channel = '__api__';
    row.dataset.type = 'api';
    
    row.innerHTML = `<span>${escapeHtml(src.label).toUpperCase()}</span>`; 
    
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      selectLiveSource(src.key);
    });
    apiDevicesEl.appendChild(row);
  });

  apiSection.querySelector('.tree-channel-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    if (expandedChannels.has('__api__')) {
      expandedChannels.delete('__api__');
    } else {
      expandedChannels.add('__api__');
    }
    renderTree();
  });

  apiSection.querySelector('.tree-channel-name').addEventListener('click', (e) => {
    e.stopPropagation();
    if (expandedChannels.has('__api__')) {
      expandedChannels.delete('__api__');
    } else {
      expandedChannels.add('__api__');
    }
    renderTree();
  });

  apiSection.querySelector('.tree-channel-actions').addEventListener('click', (e) => {
    e.stopPropagation();
    currentLiveSource = null;
    renderLiveFetchTable();
    renderTree();
  });

  treeEl.appendChild(apiSection);

  // =========================================================
  // 3. CÁC KÊNH MODBUS (Đưa xuống cuối cùng)
  // =========================================================
  state.tree.forEach((ch) => {
    if (ch.name === '__REALTIME__') return;
    const devices = ch.devices.filter((d) => !filter || d.name.toLowerCase().includes(filter) || ch.name.toLowerCase().includes(filter));
    if (filter && !ch.name.toLowerCase().includes(filter) && !devices.length) return;
        
    const isExpanded = expandedChannels.has(String(ch.id));

    const chDiv = document.createElement('div');
    chDiv.className = 'tree-channel';
    chDiv.innerHTML = `
      <div class="tree-channel-row ${isExpanded ? 'expanded' : ''}" data-channel="${ch.id}">
        <span class="tree-channel-toggle">▶</span>
        <span class="tree-channel-name">${escapeHtml(ch.name).toUpperCase()}</span>
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
      row.dataset.type = 'modbus';
      row.innerHTML = `<span>${escapeHtml(d.name)}</span>`;
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

$('#addTbBtn').addEventListener('click', () => {
  openTbDeviceForm();
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
  currentLiveSource = null;
  renderTree();
  await loadTbDevices();
  const dev = await api(`/api/devices/${deviceId}`);
  realtimePollMs = Number(dev.scan_rate_ms) > 0 ? Number(dev.scan_rate_ms) : 2000;
  $('#emptyState').style.display = 'none';
  $('#deviceHeader').style.display = 'flex';
  $('#tagToolbar').style.display = 'flex';
  $('#tagTableWrap').style.display = 'block';
  $('#tagPagination').style.display = 'none'; // Đã ẩn
  $('#tbDeviceTableWrap').style.display = 'none';
  $('#tbDevicePagination').style.display = 'none';
  
  $('#liveFetchConfigBar').style.display = 'none'; 
  $('#liveFetchTableWrap').style.display = 'none';
  $('#liveFetchPagination').style.display = 'none';
  
  $('#deviceTitle').textContent = dev.name;
  const tbInfo = dev.default_tb_device ? `📡 ${escapeHtml(dev.default_tb_device.name)}` : 'Chưa gán';
  $('#deviceMeta').innerHTML = `IP: ${dev.ip || '-'} | Slave ID: ${dev.slave_id ?? '-'} | Scan: ${dev.scan_rate_ms}ms | Timeout: ${dev.conn_timeout_s}s / ${dev.req_timeout_ms}ms | Byte Swap: ${dev.byte_swap ? 'Bật' : 'Tắt'} | Word Swap: ${dev.word_swap ? 'Bật' : 'Tắt'} | Thiết bị TB: ${tbInfo}`;

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
  currentLiveSource = null;
  $('#emptyState').style.display = 'block';
  $('#deviceHeader').style.display = 'none';
  $('#tagToolbar').style.display = 'none';
  $('#tagTableWrap').style.display = 'none';
  $('#tagPagination').style.display = 'none';
  $('#tbDeviceTableWrap').style.display = 'none';
  $('#tbDevicePagination').style.display = 'none';
  $('#liveFetchConfigBar').style.display = 'none';
  $('#liveFetchTableWrap').style.display = 'none';
  $('#liveFetchPagination').style.display = 'none';
  expandedChannels.clear();
  state.currentChannelId = null;
  state.currentDeviceId = null;
  renderTree();
}

async function selectTbDevice(tb) {
  stopRealtime();
  currentLiveSource = null;
  state.currentChannelId = '__tb__';
  state.currentDeviceId = `tb-${tb.id}`;
  state.page = 1;
  state.tbPage = 1;
  state.selected.clear();
  expandedChannels.clear();
  expandedChannels.add('__tb__');
  renderTree();
  await loadTbDevices();
  $('#emptyState').style.display = 'none';
  $('#deviceHeader').style.display = 'flex';
  $('#tagToolbar').style.display = 'none';
  $('#deviceTitle').textContent = `📡 ${tb.name}`;
  $('#deviceMeta').textContent = `Host: ${tb.host}:${tb.port} | Token: ${tb.access_token} | Device: ${tb.device_name || '-'} | Telemetry: ${tb.telemetry_interval_ms}ms | Attributes: ${tb.attributes_interval_ms}ms | ${tb.enabled ? 'Bật' : 'Tắt'}`;

  $('#editDeviceBtn').style.display = 'none';
  $('#duplicateDeviceBtn').style.display = 'none';
  $('#deleteDeviceBtn').style.display = 'none';
  $('#editDeviceBtn').onclick = null;
  $('#duplicateDeviceBtn').onclick = null;
  $('#deleteDeviceBtn').onclick = null;

  $('#tagTableWrap').style.display = 'none';
  $('#tagPagination').style.display = 'none';
  
  $('#liveFetchConfigBar').style.display = 'none';
  $('#liveFetchTableWrap').style.display = 'none';
  $('#liveFetchPagination').style.display = 'none';
  
  $('#tbDeviceTableWrap').style.display = 'block';
  $('#tbDevicePagination').style.display = 'none';
  renderTbDeviceList(state.tbDevices);
}

async function openDeviceForm(channelId, dev = null) {
  const isEdit = !!dev;
  await loadTbDevices();
  const tbOptions = `
    <option value="">— Không gán (gán riêng theo từng tag) —</option>
    ${state.tbDevices.map((tb) => `<option value="${tb.id}" ${dev && dev.default_tb_device_id === tb.id ? 'selected' : ''}>${escapeHtml(tb.name)} (${escapeHtml(tb.host)}${tb.port !== 80 ? ':' + tb.port : ''})</option>`).join('')}
  `;
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
    <div class="field">
      <label>Thiết bị ThingsBoard nhận dữ liệu</label>
      <select id="f-tb">${tbOptions}</select>
    </div>
    <p class="muted">Khi chọn 1 thiết bị ở đây, mọi tag của device này (đã bật Telemetry/Attributes) sẽ tự động gửi tới thiết bị này — không cần vào từng tag để gán riêng nữa. Vẫn có thể gán thêm thiết bị khác cho 1 tag cụ thể qua cột "Thiết bị TB" nếu cần.</p>
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
      default_tb_device_id: $('#f-tb').value ? Number($('#f-tb').value) : null,
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

async function loadTbDevices() {
  state.tbPage = 1;
  state.tbDevices = await api('/api/thingsboard-devices');
}

function renderTbDeviceList(tbDevices) {
  const tbody = $('#tbDeviceTableBody');
  tbody.innerHTML = '';
  const start = 0;
  const pageItems = tbDevices; // Lấy toàn bộ thiết bị, không cắt trang
  state.tbTotal = tbDevices.length;
  pageItems.forEach((tb, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.id = tb.id;
    tr.innerHTML = `
      <td class="muted">${start + idx + 1}</td>
      <td title="${escapeHtml(tb.name)}">${escapeHtml(tb.name)}</td>
      <td title="${escapeHtml(tb.host)}">${escapeHtml(tb.host)}</td>
      <td class="muted">${tb.port}</td>
      <td title="${escapeHtml(tb.access_token)}"><span style="font-family:monospace">${escapeHtml(tb.access_token)}</span></td>
      <td class="muted" title="${escapeHtml(tb.device_name || '-')}">${escapeHtml(tb.device_name || '-')}</td>
      <td class="muted">${tb.protocol === 'https' ? 'HTTPS' : 'HTTP'}</td>
      <td class="muted">${tb.telemetry_interval_ms}</td>
      <td class="muted">${tb.attributes_interval_ms}</td>
      <td class="muted">${tb.request_timeout_ms}</td>
      <td>${tb.enabled ? '<span class="badge on">Bật</span>' : '<span class="badge off">Tắt</span>'}</td>
      <td class="row-actions">
        <button class="icon-btn edit-btn" title="Sửa">⚙</button>
        <button class="icon-btn del-btn" title="Xoá">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('.edit-btn').addEventListener('click', () => openTbDeviceForm(tb));
    tr.querySelector('.del-btn').addEventListener('click', async () => {
      if (!confirm(`Xoá thiết bị ThingsBoard "${tb.name}"?`)) return;
      await api(`/api/thingsboard-devices/${tb.id}`, { method: 'DELETE' });
      await loadTbDevices();
      if (state.currentDeviceId === `tb-${tb.id}`) {
        showEmptyState();
      } else if (state.currentDeviceId && String(state.currentDeviceId).startsWith('tb-')) {
        renderTbDeviceList(state.tbDevices);
      }
    });
  });
}

function openTbDeviceForm(tb = null) {
  const isEdit = !!tb;
  openModal(`
    <h3>${isEdit ? 'Sửa' : 'Thêm'} Thiết bị ThingsBoard</h3>
    <div class="field"><label>Tên</label><input id="f-name" value="${tb ? escapeHtml(tb.name) : ''}" /></div>
    <div class="field-row">
      <div class="field"><label>Host</label><input id="f-host" value="${tb ? escapeHtml(tb.host) : ''}" placeholder="192.168.1.100" /></div>
      <div class="field"><label>Cổng</label><input id="f-port" type="number" value="${tb ? tb.port || 80 : 80}" /></div>
    </div>
    <div class="field"><label>Giao thức</label>
      <select id="f-protocol">
        <option value="http" ${tb && tb.protocol === 'https' ? '' : 'selected'}>HTTP</option>
        <option value="https" ${tb && tb.protocol === 'https' ? 'selected' : ''}>HTTPS</option>
      </select>
    </div>
    <div class="field"><label>Access Token</label><input id="f-token" value="${tb ? escapeHtml(tb.access_token) : ''}" /></div>
    <div class="field"><label>Device Name (tùy chọn)</label><input id="f-device-name" value="${tb ? escapeHtml(tb.device_name || '') : ''}" /></div>
    <div class="field-row">
      <div class="field"><label>Chu kỳ Telemetry (ms)</label><input id="f-telemetry-interval" type="number" value="${tb ? tb.telemetry_interval_ms || 5000 : 5000}" /></div>
      <div class="field"><label>Chu kỳ Attributes (ms)</label><input id="f-attributes-interval" type="number" value="${tb ? tb.attributes_interval_ms || 5000 : 5000}" /></div>
    </div>
    <div class="field"><label>Request Timeout (ms)</label><input id="f-timeout" type="number" value="${tb ? tb.request_timeout_ms || 5000 : 5000}" /></div>
    <div class="checkbox-inline"><input type="checkbox" id="f-enabled" ${!tb || tb.enabled ? 'checked' : ''} /> <label for="f-enabled">Bật</label></div>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Huỷ</button>
      <button class="btn btn-primary" id="save">Lưu</button>
    </div>
  `);
  $('#save').onclick = async () => {
    const body = {
      name: $('#f-name').value,
      host: $('#f-host').value,
      port: Number($('#f-port').value),
      access_token: $('#f-token').value,
      device_name: $('#f-device-name').value,
      protocol: $('#f-protocol').value,
      telemetry_interval_ms: Number($('#f-telemetry-interval').value),
      attributes_interval_ms: Number($('#f-attributes-interval').value),
      request_timeout_ms: Number($('#f-timeout').value),
      enabled: $('#f-enabled').checked,
    };
    try {
      if (isEdit) await api(`/api/thingsboard-devices/${tb.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/thingsboard-devices', { method: 'POST', body: JSON.stringify(body) });
      closeModal(); await loadTbDevices();
      if (state.currentDeviceId && String(state.currentDeviceId).startsWith('tb-')) {
        renderTbDeviceList(state.tbDevices);
      }
    } catch (e) { $('#err').textContent = e.message; }
  };
}

// ---------- TAGS TABLE ----------
let dataTypesCache = null;
async function getDataTypes() {
  if (!dataTypesCache) dataTypesCache = await api('/api/data-types');
  return dataTypesCache;
}

let _measureCanvas = null;
function measureTextWidth(text, font) {
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
  const ctx = _measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text || '').width;
}
function autoSizeCellInput(el) {
  if (!el) return;
  const style = getComputedStyle(el);
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const textWidth = measureTextWidth(el.value, font);
  const paddingBorder = 4 + 4 + 2 + 2; 
  el.style.width = Math.max(40, Math.ceil(textWidth) + paddingBorder + 8) + 'px';
  el.title = el.value || '';
}

async function loadTags() {
  const dataTypes = await getDataTypes();
  const q = new URLSearchParams({
    search: state.tagSearch, sort: state.sort, dir: state.dir,
    page: 1, pageSize: 999999, // Yêu cầu API trả toàn bộ
    realtime: state.realtimeFilter ? 1 : 0,
    tb: state.tbFilter ? 1 : 0,
  });
  const isTbDevice = state.currentDeviceId && String(state.currentDeviceId).startsWith('tb-');
  const endpoint = isTbDevice ? `/api/tb-devices/${state.currentDeviceId.replace('tb-', '')}/tags?${q}` : `/api/devices/${state.currentDeviceId}/tags?${q}`;
  const { total, page, pageSize, rows } = await api(endpoint);
  state.total = total;
  $('#tagCountLabel').textContent = `${total} tag`;
  $('#filterOnBtn').classList.toggle('btn-primary', state.realtimeFilter);
  $('#filterTbBtn').classList.toggle('btn-primary', state.tbFilter);
  $('#tagTable').style.display = 'table';

  const tbody = $('#tagTableBody');
  tbody.innerHTML = '';
  rows.forEach((tag, idx) => {
     const tr = document.createElement('tr');
     tr.dataset.id = tag.id;
     const stt = idx + 1;
     const scalingLabel = tag.scaling_type ? 'Linear' : 'None';
     const rtClass = tag.realtime_enabled ? 'on' : 'off';
     const tbTelemetryClass = tag.tb_telemetry_enabled ? 'on' : 'off';
     const tbAttributesClass = tag.tb_attributes_enabled ? 'on' : 'off';
     const tbNames = (tag.tb_devices || []).map((tb) => tb.inherited ? `${tb.name} (theo Device)` : tb.name).join(', ') || '—';
     tr.innerHTML = `
       <td><input type="checkbox" class="row-check" ${state.selected.has(tag.id) ? 'checked' : ''} /></td>
       <td class="muted">${stt}</td>
       <td><input type="text" class="cell-name" value="${escapeHtml(tag.name)}" title="${escapeHtml(tag.name)}" /></td>
       <td><input type="text" class="cell-address" value="${escapeHtml(tag.address || '')}" title="${escapeHtml(tag.address || '')}" /></td>
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
          <td class="muted col-scaling">${scalingLabel}</td>
       <td><button class="rt-toggle ${rtClass}" data-tag-id="${tag.id}">${tag.realtime_enabled ? 'ON' : 'OFF'}</button></td>
       <td class="cell-live"><span class="live-value"><span class="live-dot"></span><span class="live-text muted">—</span></span></td>
       <td><button class="rt-toggle ${tbTelemetryClass}" data-tb-telemetry-id="${tag.id}">${tag.tb_telemetry_enabled ? 'ON' : 'OFF'}</button></td>
       <td><button class="rt-toggle ${tbAttributesClass}" data-tb-attributes-id="${tag.id}">${tag.tb_attributes_enabled ? 'ON' : 'OFF'}</button></td>
       <td class="cell-tb-devices" data-tag-id="${tag.id}" style="cursor:pointer;color:var(--accent)" title="${escapeHtml(tbNames)}">${escapeHtml(tbNames)}</td>
       <td class="row-actions">
         <button class="icon-btn edit-btn" title="Sửa chi tiết (scaling)">⚙</button>
         <button class="icon-btn del-btn" title="Xoá">🗑</button>
       </td>
     `;
    tbody.appendChild(tr);
    autoSizeCellInput(tr.querySelector('.cell-name'));
    autoSizeCellInput(tr.querySelector('.cell-address'));

    tr.querySelector('.row-check').addEventListener('change', (e) => {
      if (e.target.checked) state.selected.add(tag.id); else state.selected.delete(tag.id);
      updateBulkButtons();
    });
    tr.querySelector('[data-tag-id]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const isOn = btn.classList.contains('on');
      const newState = isOn ? 0 : 1;
      try {
        await api(`/api/tags/${tag.id}`, { method: 'PUT', body: JSON.stringify({ realtime_enabled: newState }) });
        await loadTags();
        await loadTree();
      } catch (err) {
        alert(err.message);
        loadTags();
      }
    });
    tr.querySelector('[data-tb-telemetry-id]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const isOn = btn.classList.contains('on');
      const newState = isOn ? 0 : 1;
      try {
        await api(`/api/tags/${tag.id}`, { method: 'PUT', body: JSON.stringify({ tb_telemetry_enabled: newState }) });
        await loadTags();
        await loadTree();
      } catch (err) {
        alert(err.message);
        loadTags();
      }
    });
    tr.querySelector('[data-tb-attributes-id]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const isOn = btn.classList.contains('on');
      const newState = isOn ? 0 : 1;
      try {
        await api(`/api/tags/${tag.id}`, { method: 'PUT', body: JSON.stringify({ tb_attributes_enabled: newState }) });
        await loadTags();
        await loadTree();
      } catch (err) {
        alert(err.message);
        loadTags();
      }
    });
    tr.querySelector('.cell-tb-devices').addEventListener('click', async () => {
      await openTbDeviceSelect(tag);
    });
    tr.querySelector('.edit-btn').addEventListener('click', () => openTagForm(tag));
    tr.querySelector('.del-btn').addEventListener('click', async () => {
      if (!confirm(`Xoá tag "${tag.name}"?`)) return;
      await api(`/api/tags/${tag.id}`, { method: 'DELETE' });
      await loadTags(); await loadTree(); await loadDashboard();
    });
    ['cell-name', 'cell-address', 'cell-datatype', 'cell-rw'].forEach((cls) => {
      const el = tr.querySelector('.' + cls);
      if (el) {
        el.addEventListener('change', () => saveInlineEdit(tag.id, tr));
      }
    });
    ['cell-name', 'cell-address'].forEach((cls) => {
      const el = tr.querySelector('.' + cls);
      if (el) el.addEventListener('input', () => autoSizeCellInput(el));
    });
  });

  const anyOn = document.querySelectorAll('#tagTableBody .rt-toggle.on').length > 0;
  if (anyOn && !state.realtimeEnabled) startRealtime();
  else if (!anyOn && state.realtimeEnabled) stopRealtime();
}

async function openTbDeviceSelect(tag) {
  const tbDevices = await api('/api/thingsboard-devices');
  const mapped = await api(`/api/tags/${tag.id}/tb-devices`);
  const mappedIds = new Set(mapped.map((m) => m.id));
  const inherited = (tag.tb_devices || []).filter((tb) => tb.inherited);
  const html = `
    <h3>Thiết bị ThingsBoard cho tag: ${escapeHtml(tag.name)}</h3>
    ${inherited.length ? `<p class="muted">Tag này đã tự động gửi tới <b>${inherited.map((tb) => escapeHtml(tb.name)).join(', ')}</b> theo cấu hình mặc định của Device (không cần chọn lại bên dưới). Chỉ chọn thêm nếu muốn gửi tới thiết bị KHÁC nữa.</p>` : ''}
    <div id="tb-list">
      ${tbDevices.length === 0 ? '<p class="muted">Chưa có thiết bị ThingsBoard nào. <a href="#" id="addTbHere">Thêm mới</a></p>' : ''}
      ${tbDevices.map((tb) => `
        <div class="checkbox-inline">
          <input type="checkbox" id="tb-${tb.id}" value="${tb.id}" ${mappedIds.has(tb.id) ? 'checked' : ''} />
          <label for="tb-${tb.id}">${escapeHtml(tb.name)} (${escapeHtml(tb.host)}${tb.port !== 80 ? ':' + tb.port : ''})</label>
        </div>
      `).join('')}
    </div>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Đóng</button>
      <button class="btn btn-primary" id="saveTb">Lưu</button>
    </div>
  `;
  openModal(html);
  $('#addTbHere')?.addEventListener('click', (e) => { e.preventDefault(); closeModal(); openTbDeviceForm(); });
  $('#saveTb').onclick = async () => {
    const selected = [...document.querySelectorAll('#tb-list input[type=checkbox]:checked')].map((cb) => Number(cb.value));
    try {
      const current = await api(`/api/tags/${tag.id}/tb-devices`);
      const currentIds = new Set(current.map((m) => m.id));
      for (const id of selected) {
        if (!currentIds.has(id)) await api(`/api/tags/${tag.id}/tb-devices`, { method: 'POST', body: JSON.stringify({ tb_device_id: id }) });
      }
      for (const m of current) {
        if (!selected.includes(m.id)) await api(`/api/tags/${tag.id}/tb-devices/${m.id}`, { method: 'DELETE' });
      }
      closeModal(); await loadTags();
    } catch (e) { $('#err').textContent = e.message; }
  };
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
    text.title = result?.error || 'Không đọc được';
    return;
  }
  dot.className = 'live-dot good';
  text.className = 'live-text';
  text.title = '';
  if (typeof result.value === 'boolean') {
    text.textContent = result.value ? 'TRUE' : 'FALSE';
  } else if (result.scaledValue != null) {
    text.textContent = formatNum(result.scaledValue);
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
  state.realtimeTimer = setInterval(pollLiveValues, realtimePollMs);
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
  };
  try {
    await api(`/api/tags/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    await loadDashboard();
  } catch (e) { alert(e.message); await loadTags(); }
}

function updateBulkButtons() {
  const has = state.selected.size > 0;
  $('#bulkDeleteBtn').disabled = !has;
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
    state.page = 1;
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

$('#filterTbBtn').addEventListener('click', () => {
  state.tbFilter = !state.tbFilter;
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
    </div>
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
      scaling: scalingEnabled ? {
        rawLow: Number($('#f-rawlow').value), rawHigh: Number($('#f-rawhigh').value),
        scaledLow: Number($('#f-scaledlow').value), scaledHigh: Number($('#f-scaledhigh').value),
        scaledDataType: Number($('#f-scaleddatatype').value), units: $('#f-units').value,
      } : null,
    };
    try {
      if (isEdit) {
        await api(`/api/tags/${tag.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/api/tags', { method: 'POST', body: JSON.stringify({ ...body, device_id: state.currentDeviceId }) });
      }
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

let liveFetchTimer = null;
let liveFetchData = { cleanWater: [], rawWater: [], viwater: [] };
let currentLiveSource = null;
let apiTbMappings = {};
let apiFetchConfigs = {};

const liveFetchSources = [
  { key: 'cleanWater', label: 'Nước Sạch', icon: '💧' },
  { key: 'rawWater', label: 'Nước Thô', icon: '🌊' },
  { key: 'viwater', label: 'Viwater', icon: '🚰' },
];

async function loadApiTbMappings() {
  try {
    const mappings = await api('/api/api-tb-mappings');
    apiTbMappings = {};
    mappings.forEach(m => {
      if (!apiTbMappings[m.api_key]) apiTbMappings[m.api_key] = [];
      apiTbMappings[m.api_key].push({
        tb_device_id: m.tb_device_id,
        telemetry_enabled: !!m.telemetry_enabled,
        attributes_enabled: !!m.attributes_enabled,
        telemetry_interval_ms: m.telemetry_interval_ms || 5000,
        attributes_interval_ms: m.attributes_interval_ms || 5000,
      });
    });
  } catch (e) {
    console.error('Failed to load API TB mappings:', e);
  }
}

async function loadApiFetchConfigs() {
  try {
    apiFetchConfigs = await api('/api/api-fetch-configs');
  } catch (e) {
    console.error('Failed to load API fetch configs:', e);
    apiFetchConfigs = {};
  }
}

async function saveApiFetchConfig(channelKey, config) {
  try {
    await api(`/api/api-fetch-configs/${channelKey}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    apiFetchConfigs[channelKey] = { ...apiFetchConfigs[channelKey], ...config };
  } catch (e) {
    console.error('Failed to save API fetch config:', e);
    alert('Lưu cấu hình thất bại: ' + e.message);
  }
}

async function saveApiTbMappings(apiKey, mappings) {
  try {
    await api('/api/api-tb-mappings', {
      method: 'POST',
      body: JSON.stringify({ api_key: apiKey, mappings }),
    });
    apiTbMappings[apiKey] = mappings;
  } catch (e) {
    console.error('Failed to save API TB mappings:', e);
  }
}

async function loadLiveFetch() {
  try {
    const data = await api('/api/live-fetch');
    liveFetchData = data;
    renderLiveFetchTable();
    $('#liveFetchStatus').textContent = `Cập nhật lúc ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    $('#liveFetchStatus').textContent = 'Lỗi: ' + e.message;
  }
}

function getConfigKey(sourceKey) {
  const map = { cleanWater: 'clean_water', rawWater: 'raw_water', viwater: 'viwater' };
  return map[sourceKey] || sourceKey;
}

function renderLiveFetchTable() {
  const tbody = $('#liveFetchTableBody');
  tbody.innerHTML = '';
  if (!currentLiveSource) {
    $('#liveFetchConfigBar').style.display = 'none';
    $('#liveFetchTableWrap').style.display = 'none';
    return;
  }
  const sourceLabel = liveFetchSources.find(s => s.key === currentLiveSource)?.label || currentLiveSource;
  $('#liveFetchTitle').textContent = `Channel API Fetch - ${sourceLabel}`;
  
  const configKey = getConfigKey(currentLiveSource);
  const config = apiFetchConfigs[configKey] || {};
  const configEl = $('#apiFetchConfigs');
  configEl.innerHTML = `
    <div class="api-fetch-config-item">
      <label>Chu kỳ fetch (ms):</label>
      <input type="number" id="apiFetchInterval-${currentLiveSource}" value="${config.fetch_interval_ms || 10000}" min="1000" step="1000" />
      <button class="btn btn-small" id="saveApiFetchConfig-${currentLiveSource}">Lưu cấu hình</button>
      <span id="apiFetchSaveStatus-${currentLiveSource}" class="muted"></span>
    </div>
    <span id="liveFetchStatus" class="muted"></span>
  `;
  $('#saveApiFetchConfig-' + currentLiveSource)?.addEventListener('click', async () => {
    const interval = Number($('#apiFetchInterval-' + currentLiveSource).value) || 10000;
    $('#apiFetchSaveStatus-' + currentLiveSource).textContent = 'Đang lưu...';
    await saveApiFetchConfig(configKey, { fetch_interval_ms: interval });
    $('#apiFetchSaveStatus-' + currentLiveSource).textContent = 'Đã lưu';
    setTimeout(() => { $('#apiFetchSaveStatus-' + currentLiveSource).textContent = ''; }, 1500);
  });
  
  $('#liveFetchConfigBar').style.display = 'flex';
  const items = liveFetchData[currentLiveSource] || [];
  const allRows = [];
  let rowIdx = 0;
  items.forEach((item, idx) => {
    const key = item.tag_name;
    const metrics = item.rawData || {};
    Object.entries(metrics).forEach(([metric, value]) => {
      allRows.push({ rowIdx, idx, key, metric, value, fullKey: `${key}_${metric}` });
      rowIdx++;
    });
  });

  state.lfTotal = allRows.length;
  const pageRows = allRows; // Đã loại bỏ logic cắt trang

  pageRows.forEach((row) => {
    const tr = document.createElement('tr');
    const mappings = apiTbMappings[row.fullKey] || [];
    const tbNames = mappings.map(m => {
      const tb = state.tbDevices.find(t => t.id === m.tb_device_id);
      return tb ? tb.name : 'Unknown';
    }).join(', ') || '—';
    tr.innerHTML = `
      <td class="muted">${row.rowIdx + 1}</td>
      <td title="${escapeHtml(row.fullKey)}">${escapeHtml(row.fullKey)}</td>
      <td class="muted">${escapeHtml(String(row.value))}</td>
      <td><button class="rt-toggle ${mappings.some(m => m.telemetry_enabled) ? 'on' : 'off'}" data-lf-telemetry="${escapeHtml(row.fullKey)}" ${!mappings.length ? 'disabled' : ''}>${mappings.some(m => m.telemetry_enabled) ? 'ON' : 'OFF'}</button></td>
      <td><button class="rt-toggle ${mappings.some(m => m.attributes_enabled) ? 'on' : 'off'}" data-lf-attributes="${escapeHtml(row.fullKey)}" ${!mappings.length ? 'disabled' : ''}>${mappings.some(m => m.attributes_enabled) ? 'ON' : 'OFF'}</button></td>
      <td class="cell-tb-devices" data-lf-tb="${escapeHtml(row.fullKey)}" style="cursor:pointer;color:var(--accent)" title="${escapeHtml(tbNames)}">${escapeHtml(tbNames)}</td>
    `;
    tbody.appendChild(tr);
  });
  $('#liveFetchTableWrap').style.display = 'block';
}

async function openApiTbDeviceSelect(fullKey) {
  const tbDevices = await api('/api/thingsboard-devices');
  const mappings = apiTbMappings[fullKey] || [];
  const html = `
    <h3>Thiết bị ThingsBoard cho: ${escapeHtml(fullKey)}</h3>
    <div id="tb-list">
      ${tbDevices.length === 0 ? '<p class="muted">Chưa có thiết bị ThingsBoard nào.</p>' : ''}
      ${tbDevices.map(tb => {
        const mapped = mappings.find(m => m.tb_device_id === tb.id);
        const isChecked = mapped ? 'checked' : '';
        return `
          <div class="checkbox-inline">
            <input type="checkbox" id="tb-${tb.id}" value="${tb.id}" ${isChecked} />
            <label for="tb-${tb.id}">${escapeHtml(tb.name)} (${escapeHtml(tb.host)}${tb.port !== 80 ? ':' + tb.port : ''})</label>
          </div>
        `;
      }).join('')}
    </div>
    <div class="field">
      <label>Telemetry Interval (ms)</label>
      <input type="number" id="f-telemetry-interval" value="${mappings[0]?.telemetry_interval_ms || 5000}" />
    </div>
    <div class="field">
      <label>Attributes Interval (ms)</label>
      <input type="number" id="f-attributes-interval" value="${mappings[0]?.attributes_interval_ms || 5000}" />
    </div>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Đóng</button>
      <button class="btn btn-primary" id="saveTb">Lưu</button>
    </div>
  `;
  openModal(html);
  $('#saveTb').onclick = async () => {
    const selected = [...document.querySelectorAll('#tb-list input[type=checkbox]:checked')].map(cb => Number(cb.value));
    const telemetryInterval = Number($('#f-telemetry-interval').value) || 5000;
    const attributesInterval = Number($('#f-attributes-interval').value) || 5000;
    try {
      const newMappings = selected.map(tb_device_id => ({
        tb_device_id,
        telemetry_enabled: 1,
        attributes_enabled: 1,
        telemetry_interval_ms: telemetryInterval,
        attributes_interval_ms: attributesInterval,
      }));
      await saveApiTbMappings(fullKey, newMappings);
      closeModal();
      renderLiveFetchTable();
      await loadApiTbMappings();
    } catch (e) { $('#err').textContent = e.message; }
  };
}

async function selectLiveSource(key) {
  currentLiveSource = key;
  state.currentDeviceId = null;
  state.currentChannelId = '__api__';
  state.lfPage = 1;
  expandedChannels.clear();
  expandedChannels.add('__api__');
  $('#emptyState').style.display = 'none';
  $('#deviceHeader').style.display = 'none';
  $('#tagToolbar').style.display = 'none';
  $('#tagTableWrap').style.display = 'none';
  $('#tagPagination').style.display = 'none';
  $('#tbDeviceTableWrap').style.display = 'none';
  $('#tbDevicePagination').style.display = 'none';
  await loadTbDevices();
  renderLiveFetchTable();
  $('#liveFetchPagination').style.display = 'none';
  renderTree();
}

function startLiveFetchPolling() {
  if (liveFetchTimer) return;
  loadLiveFetch();
  liveFetchTimer = setInterval(loadLiveFetch, 10000);
}

function stopLiveFetchPolling() {
  if (liveFetchTimer) clearInterval(liveFetchTimer);
  liveFetchTimer = null;
}

$('#liveFetchTableBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.rt-toggle');
  if (btn) {
    const fullKey = btn.dataset.lfTelemetry || btn.dataset.lfAttributes;
    if (!fullKey) return;
    const isTelemetry = !!btn.dataset.lfTelemetry;
    const mappings = apiTbMappings[fullKey] || [];
    if (!mappings.length) return;
    const newState = btn.classList.contains('on') ? 0 : 1;
    const newMappings = mappings.map(m => ({
      ...m,
      [isTelemetry ? 'telemetry_enabled' : 'attributes_enabled']: newState,
    }));
    saveApiTbMappings(fullKey, newMappings).then(() => {
      renderLiveFetchTable();
      loadApiTbMappings();
    });
    return;
  }
  const tbCell = e.target.closest('.cell-tb-devices');
  if (tbCell) {
    const fullKey = tbCell.dataset.lfTb;
    if (fullKey) openApiTbDeviceSelect(fullKey);
  }
});

// ---------- INIT ----------
(async function init() {
  await loadDashboard();
  await loadTree();
  await loadTbDevices();
  await loadApiTbMappings();
  await loadApiFetchConfigs();
  startLiveFetchPolling();

  // --- THÊM PHẦN NÀY ĐỂ MẶC ĐỊNH CHỌN THINGSBOARD KHI LOAD TRANG ---
  state.currentChannelId = '__tb__';
  state.currentDeviceId = null;
  currentLiveSource = null; 
  expandedChannels.clear();
  
  // Ẩn các màn hình khác
  $('#emptyState').style.display = 'none';
  $('#deviceHeader').style.display = 'none';
  $('#tagToolbar').style.display = 'none';
  $('#tagTableWrap').style.display = 'none';
  $('#tagPagination').style.display = 'none';
  $('#liveFetchConfigBar').style.display = 'none'; 
  $('#liveFetchTableWrap').style.display = 'none';
  $('#liveFetchPagination').style.display = 'none'; 
  
  // Hiển thị bảng ThingsBoard
  $('#tbDeviceTableWrap').style.display = 'block';
  $('#tbDevicePagination').style.display = 'none'; 
  
  // Render dữ liệu bảng và làm đậm menu sidebar
  renderTbDeviceList(state.tbDevices);
  renderTree();
})();