async function loadCustomTags() {
  const rows = await api('/api/custom-tags');
  renderCustomTagTable(rows);
}

function renderCustomTagTable(tags) {
  const tbody = $('#customTagTableBody');
  tbody.innerHTML = '';
  $('#customTagCountLabel').textContent = `${tags.length} custom tag`;
  tags.forEach((ct, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.id = ct.id;
    const stt = idx + 1;
    const tbTelemetryClass = ct.tb_telemetry_enabled ? 'on' : 'off';
    const tbAttributesClass = ct.tb_attributes_enabled ? 'on' : 'off';
    tr.innerHTML = `
      <td class="muted">${stt}</td>
      <td><input type="text" class="cell-name" value="${escapeHtml(ct.name)}" title="${escapeHtml(ct.name)}" /></td>
      <td><span class="live-value"><span class="live-dot"></span><span class="live-text muted">—</span></span></td>
      <td><button class="rt-toggle ${tbAttributesClass}" data-ct-attributes-id="${ct.id}">${ct.tb_attributes_enabled ? 'ON' : 'OFF'}</button></td>
      <td><button class="rt-toggle ${tbTelemetryClass}" data-ct-telemetry-id="${ct.id}">${ct.tb_telemetry_enabled ? 'ON' : 'OFF'}</button></td>
      <td class="cell-tb-devices" data-ct-id="${ct.id}" style="cursor:pointer;color:var(--accent)" title="Thiết bị TB">—</td>
      <td><div class="row-actions">
        <button class="icon-btn edit-btn" title="Sửa">⚙</button>
        <button class="icon-btn del-btn" title="Xoá">🗑</button>
      </div></td>
    `;
    tbody.appendChild(tr);

    tr.querySelector('.cell-name').addEventListener('change', () => saveCustomTagInlineEdit(ct.id, tr));

    tr.querySelector('[data-ct-telemetry-id]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const isOn = btn.classList.contains('on');
      const newState = isOn ? 0 : 1;
      try {
        await api(`/api/custom-tags/${ct.id}`, { method: 'PUT', body: JSON.stringify({ tb_telemetry_enabled: newState }) });
        await loadCustomTags();
      } catch (err) {
        alert(err.message);
        await loadCustomTags();
      }
    });
    tr.querySelector('[data-ct-attributes-id]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const isOn = btn.classList.contains('on');
      const newState = isOn ? 0 : 1;
      try {
        await api(`/api/custom-tags/${ct.id}`, { method: 'PUT', body: JSON.stringify({ tb_attributes_enabled: newState }) });
        await loadCustomTags();
      } catch (err) {
        alert(err.message);
        await loadCustomTags();
      }
    });
    tr.querySelector('.cell-tb-devices').addEventListener('click', async () => {
      await openCustomTagTbSelect(ct);
    });
    tr.querySelector('.edit-btn').addEventListener('click', () => openCustomTagForm(ct));
    tr.querySelector('.del-btn').addEventListener('click', async () => {
      if (!confirm(`Xoá CustomTag "${ct.name}"?`)) return;
      await api(`/api/custom-tags/${ct.id}`, { method: 'DELETE' });
      await loadCustomTags(); await loadTree(); await loadDashboard();
    });
  });
  startCustomTagRealtime();
  renderCustomTagTbDevices();
}

async function renderCustomTagTbDevices() {
  const rows = document.querySelectorAll('#customTagTableBody tr');
  for (const tr of rows) {
    const ctId = Number(tr.dataset.id);
    try {
      const devices = await api(`/api/custom-tags/${ctId}/tb-devices`);
      const cell = tr.querySelector('.cell-tb-devices');
      if (cell) {
        if (devices.length) {
          cell.textContent = devices.map(d => d.name).join(', ');
        } else {
          cell.textContent = '—';
        }
      }
    } catch (e) { /* ignore */ }
  }
}

async function saveCustomTagInlineEdit(id, tr) {
  try {
    await api(`/api/custom-tags/${id}`, { method: 'PUT', body: JSON.stringify({ name: tr.querySelector('.cell-name').value }) });
    await loadDashboard();
  } catch (e) { alert(e.message); await loadCustomTags(); }
}

function showPickerFloating(triggerBtn, title, items, getLabel, getValue) {
  return new Promise((resolve) => {
    const existing = document.getElementById('picker-float');
    if (existing) existing.remove();
    if (!items.length) {
      alert('Không có mục nào để chọn');
      resolve(null);
      return;
    }
    if (!triggerBtn || typeof triggerBtn.getBoundingClientRect !== 'function') {
      resolve(null);
      return;
    }
    const valOf = getValue || getLabel;
    const rect = triggerBtn.getBoundingClientRect();
    const panel = document.createElement('div');
    panel.id = 'picker-float';
    panel.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 4}px;
      left: ${rect.left}px;
      width: 320px;
      max-height: 300px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-lg);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;
    panel.innerHTML = `
      <div style="padding: 8px 12px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 13px; background: var(--panel-2); color: var(--text);">${escapeHtml(title)}</div>
      <input type="text" id="picker-search" placeholder="Tìm kiếm..." style="width: 100%; padding: 6px 10px; border: none; border-bottom: 1px solid var(--border); background: var(--panel); color: var(--text); font-size: 13px; outline: none;" />
      <div id="picker-list" style="flex: 1; overflow-y: auto; max-height: 240px;">
        ${items.map(item => `<div class="picker-item" data-value="${escapeHtml(valOf(item))}" title="${escapeHtml(getLabel(item))}">${escapeHtml(getLabel(item))}</div>`).join('')}
      </div>
    `;
    document.body.appendChild(panel);
    const search = panel.querySelector('#picker-search');
    const list = panel.querySelector('#picker-list');
    const close = (value) => { panel.remove(); resolve(value); };
    list.querySelectorAll('.picker-item').forEach(el => {
      el.addEventListener('click', () => close(el.dataset.value));
    });
    if (search) {
      search.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        list.querySelectorAll('.picker-item').forEach(el => {
          el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    }
    setTimeout(() => {
      document.addEventListener('click', function outside(e) {
        if (panel.parentNode && !panel.contains(e.target) && e.target !== triggerBtn) {
          panel.remove();
          document.removeEventListener('click', outside);
          resolve(null);
        }
      });
    }, 0);
  });
}

async function openCustomTagForm(ct = null) {
  const isEdit = !!ct;
  const available = await api('/api/custom-tags/sources/available');
  const tbDevices = await api('/api/thingsboard-devices');
  const mapped = isEdit ? await api(`/api/custom-tags/${ct.id}/tb-devices`) : [];
  const mappedIds = new Set(mapped.map(m => m.id));

  openModal(`
    <h3>${isEdit ? 'Sửa' : 'Thêm'} Custom Tag</h3>
    <div class="field"><label>Tên tag</label><input id="f-name" value="${ct ? escapeHtml(ct.name) : ''}" /></div>
    <div class="field">
      <label>Biểu thức</label>
      <div style="display:flex;gap:8px;align-items:center">
        <textarea id="f-expression" rows="3" style="flex:1">${ct ? escapeHtml(ct.expression) : ''}</textarea>
        <div style="display:flex;flex-direction:column;gap:4px">
          <button class="btn" id="insTag" type="button" title="Chèn tag Modbus">+ Tag</button>
          <button class="btn" id="insApi" type="button" title="Chèn API key">+ API Key</button>
          <button class="btn" id="insCustom" type="button" title="Chèn CustomTag khác">+ CustomTag</button>
        </div>
      </div>
      <p class="muted">Ví dụ: <code>tagA + tagB * 2</code> hoặc <code>flow_rate / 1000</code>. Dùng <code>abs()</code>, <code>round()</code>, <code>min()</code>, <code>max()</code>.</p>
    </div>
    <div class="field"><label>Decimals</label><input id="f-decimals" type="number" value="${ct ? ct.decimals : 2}" /></div>
    <div class="checkbox-inline"><input type="checkbox" id="f-tb-telemetry" ${ct && ct.tb_telemetry_enabled ? 'checked' : ''} /> <label for="f-tb-telemetry">Telemetry</label></div>
    <div class="field"><label>Chu kỳ Telemetry (ms)<small> (0 = kế thừa từ TB Device)</small></label><input id="f-tb-telemetry-interval" type="number" value="${ct ? ct.tb_telemetry_interval_ms || 0 : 0}" min="0" /></div>
    <div class="checkbox-inline"><input type="checkbox" id="f-tb-attributes" ${ct && ct.tb_attributes_enabled ? 'checked' : ''} /> <label for="f-tb-attributes">Attributes</label></div>
    <div class="field"><label>Chu kỳ Attributes (ms)<small> (0 = kế thừa từ TB Device)</small></label><input id="f-tb-attributes-interval" type="number" value="${ct ? ct.tb_attributes_interval_ms || 0 : 0}" min="0" /></div>
    <div class="field">
      <label>Thiết bị ThingsBoard</label>
      <select id="f-tb" multiple size="4">
        ${tbDevices.map(tb => `<option value="${tb.id}" ${mappedIds.has(tb.id) ? 'selected' : ''}>${escapeHtml(tb.name)} (${escapeHtml(tb.host)}${tb.port !== 80 ? ':' + tb.port : ''})</option>`).join('')}
      </select>
    </div>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Huỷ</button>
      <button class="btn btn-primary" id="save">Lưu</button>
    </div>
  `);

  const insertAtCursor = (text) => {
    const ta = $('#f-expression');
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + text.length;
  };

  $('#insTag').onclick = async (e) => {
    const btn = e.currentTarget;
    const available = await api('/api/custom-tags/sources/available');
    const pick = await showPickerFloating(btn, 'Chọn tag (Kênh.Thiết bị.Tag)', available.tags, t => t.fullName, t => t.ref);
    if (pick) insertAtCursor(pick);
  };
  $('#insApi').onclick = async (e) => {
    const btn = e.currentTarget;
    const available = await api('/api/custom-tags/sources/available');
    const pick = await showPickerFloating(btn, 'Chọn API key', available.apiKeys, k => k, k => k);
    if (pick) insertAtCursor(pick);
  };
  $('#insCustom').onclick = async (e) => {
    const btn = e.currentTarget;
    const available = await api('/api/custom-tags/sources/available');
    const pick = await showPickerFloating(btn, 'Chọn CustomTag', available.customTags, c => c.fullName, c => c.ref);
    if (pick) insertAtCursor(pick);
  };

  $('#save').onclick = async () => {
    const name = $('#f-name').value.trim();
    const expression = $('#f-expression').value.trim();
    const decimals = Number($('#f-decimals').value);
    const tbTelemetry = $('#f-tb-telemetry').checked;
    const tbAttributes = $('#f-tb-attributes').checked;
    const selectedTb = [...document.querySelectorAll('#f-tb option:checked')].map(o => Number(o.value));
    if (!name || !expression) { $('#err').textContent = 'Thiếu tên hoặc biểu thức'; return; }
    try {
      let customTagId;
      if (isEdit) {
        await api(`/api/custom-tags/${ct.id}`, { method: 'PUT', body: JSON.stringify({ name, expression, decimals, tb_telemetry_enabled: tbTelemetry, tb_telemetry_interval_ms: Number($('#f-tb-telemetry-interval').value) || 0, tb_attributes_enabled: tbAttributes, tb_attributes_interval_ms: Number($('#f-tb-attributes-interval').value) || 0 }) });
        customTagId = ct.id;
      } else {
        const r = await api('/api/custom-tags', { method: 'POST', body: JSON.stringify({ name, expression, decimals, tb_telemetry_enabled: tbTelemetry, tb_telemetry_interval_ms: Number($('#f-tb-telemetry-interval').value) || 0, tb_attributes_enabled: tbAttributes, tb_attributes_interval_ms: Number($('#f-tb-attributes-interval').value) || 0 }) });
        customTagId = r.id;
      }

      const currentMapped = new Set(mapped.map(m => m.id));
      for (const tbId of selectedTb) {
        if (!currentMapped.has(tbId)) await api(`/api/custom-tags/${customTagId}/tb-devices`, { method: 'POST', body: JSON.stringify({ tb_device_id: tbId }) });
      }
      for (const m of mapped) {
        if (!selectedTb.includes(m.id)) await api(`/api/custom-tags/${customTagId}/tb-devices/${m.id}`, { method: 'DELETE' });
      }

      closeModal();
      await loadCustomTags(); await loadTree(); await loadDashboard();
    } catch (e) { $('#err').textContent = e.message; }
  };
}

async function openCustomTagTbSelect(ct) {
  const tbDevices = await api('/api/thingsboard-devices');
  const mapped = await api(`/api/custom-tags/${ct.id}/tb-devices`);
  const mappedIds = new Set(mapped.map(m => m.id));
  openModal(`
    <h3>Thiết bị ThingsBoard cho: ${escapeHtml(ct.name)}</h3>
    <div id="tb-list">
      ${tbDevices.map(tb => `
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
  `);
  $('#saveTb').onclick = async () => {
    const selected = [...document.querySelectorAll('#tb-list input[type=checkbox]:checked')].map(cb => Number(cb.value));
    try {
      const current = await api(`/api/custom-tags/${ct.id}/tb-devices`);
      const currentIds = new Set(current.map(m => m.id));
      for (const id of selected) {
        if (!currentIds.has(id)) await api(`/api/custom-tags/${ct.id}/tb-devices`, { method: 'POST', body: JSON.stringify({ tb_device_id: id }) });
      }
      for (const m of current) {
        if (!selected.includes(m.id)) await api(`/api/custom-tags/${ct.id}/tb-devices/${m.id}`, { method: 'DELETE' });
      }
      closeModal(); await loadCustomTags();
    } catch (e) { $('#err').textContent = e.message; }
  };
}
