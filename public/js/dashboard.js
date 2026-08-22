async function loadDashboard() {
  const [stats, apiStatus] = await Promise.all([api('/api/stats'), api('/api/api-status')]);
  state.dataTypes = state.dataTypes;
  state.disconnectedDevices = stats.totals.disconnectedDevices;
  state.disconnectedDeviceIds = new Set(stats.totals.disconnectedDeviceIds || []);
  state.apiStatus = apiStatus;
  const el = $('#dashboard');

  // API status cards
  const apiLabels = { clean_water: 'NƯỚC SẠCH', raw_water: 'NƯỚC THÔ', viwater: 'VIWATER' };
  const apiCards = Object.entries(apiStatus).map(([key, s]) => {
    const cls = s.connected ? 'ok' : (s.hasData ? 'warn' : 'danger');
    const icon = s.connected ? '🟢' : (s.hasData ? '🟡' : '🔴');
    return `<div class="stat-card ${cls}"><div class="num">${icon}</div><div class="label">${apiLabels[key] || s.label}</div></div>`;
  }).join('');

  el.innerHTML = `
    <div class="stat-card"><div class="num">${stats.totals.channels}</div><div class="label">CHANNELS</div></div>
    <div class="stat-card"><div class="num">${stats.totals.devices}</div><div class="label">DEVICES</div></div>
    <div class="stat-card"><div class="num">${stats.totals.tags}</div><div class="label">TAGS</div></div>
    <div class="stat-card"><div class="num">${stats.totals.tagsTelemetry}</div><div class="label">📡 TELEMETRY</div></div>
    <div class="stat-card"><div class="num">${stats.totals.tagsAttributes}</div><div class="label">📋 ATTRIBUTES</div></div>
    <div class="stat-card"><div class="num">${stats.totals.tagsRealtime}</div><div class="label">🟢 REALTIME</div></div>
    <div id="modbusStatusCard" class="stat-card ${stats.totals.disconnectedDevices > 0 ? 'danger' : ''}"><div class="num" id="modbusStatusCount">${stats.totals.disconnectedDevices}</div><div class="label">🔴 MODBUS</div></div>
    ${apiCards}
  `;
}

// Cập nhật nhanh chỉ card MODBUS mà không need loadDashboard toàn bộ
function updateModbusCard(count) {
  state.disconnectedDevices = count;
  const card = $('#modbusStatusCard');
  const numEl = $('#modbusStatusCount');
  if (!card || !numEl) return;
  numEl.textContent = count;
  if (count > 0) {
    card.classList.add('danger');
  } else {
    card.classList.remove('danger');
  }
}
