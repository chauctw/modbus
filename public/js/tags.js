let dataTypesCache = null;
async function getDataTypes() {
  if (!dataTypesCache) dataTypesCache = await api('/api/data-types');
  return dataTypesCache;
}

async function loadTags() {
  const dataTypes = await getDataTypes();
  const q = new URLSearchParams({
    search: state.tagSearch, sort: state.sort, dir: state.dir,
    page: 1, pageSize: 999999,
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
      if (state.selected.has(tag.id)) tr.classList.add('row-selected');
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
        <td><div class="row-actions">
          <button class="icon-btn edit-btn" title="Sửa chi tiết (scaling)">⚙</button>
          <button class="icon-btn del-btn" title="Xoá">🗑</button>
        </div></td>
     `;
     tbody.appendChild(tr);

      tr.querySelector('.row-check').addEventListener('change', (e) => {
       tr.classList.toggle('row-selected', e.target.checked);
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
    cb.closest('tr').classList.toggle('row-selected', e.target.checked);
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
