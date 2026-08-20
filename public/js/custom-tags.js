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
}

async function saveCustomTagInlineEdit(id, tr) {
  try {
    await api(`/api/custom-tags/${id}`, { method: 'PUT', body: JSON.stringify({ name: tr.querySelector('.cell-name').value }) });
    await loadDashboard();
  } catch (e) { alert(e.message); await loadCustomTags(); }
}

async function openCustomTagForm(ct = null) {
  const isEdit = !!ct;
  const sources = isEdit ? await api(`/api/custom-tags/${ct.id}/sources`) : [];
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
    <div class="checkbox-inline"><input type="checkbox" id="f-tb-attributes" ${ct && ct.tb_attributes_enabled ? 'checked' : ''} /> <label for="f-tb-attributes">Attributes</label></div>
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

  $('#insTag').onclick = async () => {
    const available = await api('/api/custom-tags/sources/available');
    const pick = prompt('Chọn tag (dán tên đầy đủ):\n' + available.tags.map(t => t.fullName).join('\n'));
    if (pick) insertAtCursor(pick.trim());
  };
  $('#insApi').onclick = async () => {
    const available = await api('/api/custom-tags/sources/available');
    const pick = prompt('Chọn API key (dán tên):\n' + available.apiKeys.join('\n'));
    if (pick) insertAtCursor(pick.trim());
  };
  $('#insCustom').onclick = async () => {
    const available = await api('/api/custom-tags/sources/available');
    const pick = prompt('Chọn CustomTag (dán tên):\n' + available.customTags.map(c => c.fullName).join('\n'));
    if (pick) insertAtCursor(pick.trim());
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
        await api(`/api/custom-tags/${ct.id}`, { method: 'PUT', body: JSON.stringify({ name, expression, decimals, tb_telemetry_enabled: tbTelemetry, tb_attributes_enabled: tbAttributes }) });
        customTagId = ct.id;
      } else {
        const r = await api('/api/custom-tags', { method: 'POST', body: JSON.stringify({ name, expression, decimals, tb_telemetry_enabled: tbTelemetry, tb_attributes_enabled: tbAttributes }) });
        customTagId = r.id;
      }
      const currentSources = isEdit ? sources : [];
      const currentSourceRefs = new Set(currentSources.map(s => {
        if (s.source_type === 'tag') return `tag:${s.source_tag_id}`;
        if (s.source_type === 'api_key') return `api:${s.source_api_key}`;
        if (s.source_type === 'custom_tag') return `custom:${s.source_custom_tag_id}`;
        return '';
      }).filter(Boolean));

      const desiredRefs = new Set();
      const tagNameToId = new Map(available.tags.map(t => [t.fullName, t.id]));
      const apiNameToKey = new Map(available.apiKeys.map(k => [k, k]));
      const customNameToId = new Map(available.customTags.map(c => [c.fullName, c.id]));

      const tokens = expression.split(/[+\-*/()]+/).map(t => t.trim()).filter(Boolean);
      tokens.forEach(token => {
        if (apiNameToKey.has(token)) {
          desiredRefs.add(`api:${apiNameToKey.get(token)}`);
        } else if (customNameToId.has(token)) {
          desiredRefs.add(`custom:${customNameToId.get(token)}`);
        } else if (tagNameToId.has(token)) {
          desiredRefs.add(`tag:${tagNameToId.get(token)}`);
        }
      });

      for (const ref of desiredRefs) {
        if (currentSourceRefs.has(ref)) continue;
        const [type, idStr] = ref.split(':');
        const id = Number(idStr);
        if (type === 'tag') await api(`/api/custom-tags/${customTagId}/sources`, { method: 'POST', body: JSON.stringify({ source_type: 'tag', source_tag_id: id }) });
        else if (type === 'api_key') await api(`/api/custom-tags/${customTagId}/sources`, { method: 'POST', body: JSON.stringify({ source_type: 'api_key', source_api_key: idStr }) });
        else if (type === 'custom_tag') await api(`/api/custom-tags/${customTagId}/sources`, { method: 'POST', body: JSON.stringify({ source_type: 'custom_tag', source_custom_tag_id: id }) });
      }

      if (isEdit) {
        for (const s of currentSources) {
          const ref = s.source_type === 'tag' ? `tag:${s.source_tag_id}` : s.source_type === 'api_key' ? `api:${s.source_api_key}` : `custom:${s.source_custom_tag_id}`;
          if (!desiredRefs.has(ref)) {
            await api(`/api/custom-tags/${customTagId}/sources/${s.id}`, { method: 'DELETE' });
          }
        }
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
