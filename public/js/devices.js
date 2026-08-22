async function loadTbDevices() {
  state.tbPage = 1;
  state.tbDevices = await api('/api/thingsboard-devices');
}

function renderTbDeviceList(tbDevices) {
  const tbody = $('#tbDeviceTableBody');
  tbody.innerHTML = '';
  const start = 0;
  const pageItems = tbDevices;
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
      <td><button class="rt-toggle ${tb.enabled ? 'on' : 'off'}" data-tb-enabled-id="${tb.id}">${tb.enabled ? 'ON' : 'OFF'}</button></td>
      <td><div class="row-actions">
        <button class="icon-btn edit-btn" title="Sửa">⚙</button>
        <button class="icon-btn del-btn" title="Xoá">🗑</button>
      </div></td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('.edit-btn').addEventListener('click', () => openTbDeviceForm(tb));
    tr.querySelector('.del-btn').addEventListener('click', async () => {
      if (!confirm(`Xoá thiết bị ThingsBoard "${tb.name}"?`)) return;
      await api(`/api/thingsboard-devices/${tb.id}`, { method: 'DELETE' });
      await loadTbDevices();
      renderTree();
      if (state.currentDeviceId === `tb-${tb.id}`) {
        showEmptyState();
      } else if (state.currentChannelId === '__tb__' || (state.currentDeviceId && String(state.currentDeviceId).startsWith('tb-'))) {
        renderTbDeviceList(state.tbDevices);
      }
    });
    tr.querySelector('[data-tb-enabled-id]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const isOn = btn.classList.contains('on');
      const newState = isOn ? 0 : 1;
      try {
        await api(`/api/thingsboard-devices/${tb.id}`, { method: 'PUT', body: JSON.stringify({ enabled: newState }) });
        await loadTbDevices();
        renderTree();
        if (state.currentChannelId === '__tb__' || (state.currentDeviceId && String(state.currentDeviceId).startsWith('tb-'))) {
          renderTbDeviceList(state.tbDevices);
        }
      } catch (err) {
        alert(err.message);
        await loadTbDevices();
        renderTree();
        if (state.currentChannelId === '__tb__' || (state.currentDeviceId && String(state.currentDeviceId).startsWith('tb-'))) {
          renderTbDeviceList(state.tbDevices);
        }
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
      renderTree();
      if (state.currentChannelId === '__tb__' || (state.currentDeviceId && String(state.currentDeviceId).startsWith('tb-'))) {
        renderTbDeviceList(state.tbDevices);
      }
    } catch (e) { $('#err').textContent = e.message; }
  };
}

async function selectDevice(channelId, deviceId) {
  stopRealtime();
  stopCustomTagRealtime();
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
  renderTree();
  const dev = await api(`/api/devices/${deviceId}`);
  realtimePollMs = Number(dev.scan_rate_ms) > 0 ? Number(dev.scan_rate_ms) : 2000;
  $('#emptyState').style.display = 'none';
  $('#userHeader').style.display = 'none';
  $('#userTableWrap').style.display = 'none';
  $('#customTagToolbar').style.display = 'none';
  $('#customTagTableWrap').style.display = 'none';
  $('#deviceHeader').style.display = 'flex';
  $('#tagToolbar').style.display = 'flex';
  $('#tagTableWrap').style.display = 'block';
  $('#tagPagination').style.display = 'none';
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
  stopCustomTagRealtime();
  currentLiveSource = null;
  $('#emptyState').style.display = 'block';
  $('#userHeader').style.display = 'none';
  $('#userTableWrap').style.display = 'none';
  $('#deviceHeader').style.display = 'none';
  $('#tagToolbar').style.display = 'none';
  $('#tagTableWrap').style.display = 'none';
  $('#tagPagination').style.display = 'none';
  $('#customTagToolbar').style.display = 'none';
  $('#customTagTableWrap').style.display = 'none';
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

async function selectCustomTagChannel() {
  stopRealtime();
  stopCustomTagRealtime();
  state.currentChannelId = '__custom__';
  state.currentDeviceId = null;
  currentLiveSource = null;
  expandedChannels.clear();
  expandedChannels.add('__custom__');
  $('#emptyState').style.display = 'none';
  $('#userHeader').style.display = 'none';
  $('#userTableWrap').style.display = 'none';
  $('#deviceHeader').style.display = 'none';
  $('#tagToolbar').style.display = 'none';
  $('#tagTableWrap').style.display = 'none';
  $('#tagPagination').style.display = 'none';
  $('#customTagToolbar').style.display = 'flex';
  $('#customTagTableWrap').style.display = 'block';
  $('#liveFetchConfigBar').style.display = 'none';
  $('#liveFetchTableWrap').style.display = 'none';
  $('#liveFetchPagination').style.display = 'none';
  $('#tbDeviceTableWrap').style.display = 'none';
  $('#tbDevicePagination').style.display = 'none';
  renderTree();
  await loadCustomTags();
}

async function selectTbDevice(tb) {
  stopRealtime();
  stopCustomTagRealtime();
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
  $('#userHeader').style.display = 'none';
  $('#userTableWrap').style.display = 'none';
  $('#customTagToolbar').style.display = 'none';
  $('#customTagTableWrap').style.display = 'none';
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
