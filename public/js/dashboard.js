async function loadDashboard() {
  const stats = await api('/api/stats');
  state.dataTypes = state.dataTypes;
  const el = $('#dashboard');
  el.innerHTML = `
    <div class="stat-card"><div class="num">${stats.totals.channels}</div><div class="label">CHANNELS</div></div>
    <div class="stat-card"><div class="num">${stats.totals.devices}</div><div class="label">DEVICES</div></div>
    <div class="stat-card"><div class="num">${stats.totals.tags}</div><div class="label">TAGS</div></div>
    <div class="stat-card"><div class="num">${stats.totals.tagsTelemetry}</div><div class="label">📡 TELEMETRY</div></div>
    <div class="stat-card"><div class="num">${stats.totals.tagsAttributes}</div><div class="label">📋 ATTRIBUTES</div></div>
    <div class="stat-card"><div class="num">${stats.totals.tagsRealtime}</div><div class="label">🟢 REALTIME</div></div>
    <div class="stat-card ${stats.totals.disconnectedDevices > 0 ? 'danger' : ''}"><div class="num">${stats.totals.disconnectedDevices}</div><div class="label">🔴 MẤT KẾT NỐI</div></div>
  `;
}
