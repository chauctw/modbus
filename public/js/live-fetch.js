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
  const pageRows = allRows;

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
  stopRealtime();
  stopCustomTagRealtime();
  currentLiveSource = key;
  state.currentDeviceId = null;
  state.currentChannelId = '__api__';
  state.lfPage = 1;
  expandedChannels.clear();
  expandedChannels.add('__api__');
  $('#emptyState').style.display = 'none';
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
