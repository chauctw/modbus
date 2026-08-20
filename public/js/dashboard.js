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
    <div class="stat-card ${problems ? 'danger' : ''}" id="dupCard"><div class="num">${problems}</div><div class="label">TAG TRÙNG LẶP</div></div>
  `;
  $('#dupCard')?.addEventListener('click', async () => {
    const v = await api('/api/validate');
    let html = `<h3>Danh sách Tag trùng lặp</h3>`;
    const hasDupTags = v.dupTagNames.length + v.dupTagAddress.length > 0;
    if (!hasDupTags) {
      html += `<p class="muted">Không có tag trùng lặp.</p><div class="modal-actions"><button class="btn" onclick="closeModal()">Đóng</button></div>`;
      openModal(html);
      return;
    }
    html += `<div class="table-wrap" style="max-height:60vh;margin-bottom:16px"><table><colgroup><col style="width:50px" /><col style="width:auto" /><col style="width:140px" /><col style="width:150px" /><col style="width:120px" /><col style="width:100px" /></colgroup><thead><tr><th>#</th><th>Channel</th><th>Device</th><th>Tag Name</th><th>Tag Address</th><th>Số lượng trùng</th></tr></thead><tbody>`;
    let idx = 1;
    (v.dupTagNames || []).forEach(r => {
      html += `<tr><td>${idx++}</td><td>${escapeHtml(r.channel_name || '')}</td><td>${escapeHtml(r.device_name || 'Device #${r.device_id}')}</td><td style="color:var(--danger);font-weight:600">${escapeHtml(r.name)}</td><td class="muted">-</td><td>${r.count}</td></tr>`;
    });
    (v.dupTagAddress || []).forEach(r => {
      html += `<tr><td>${idx++}</td><td>${escapeHtml(r.channel_name || '')}</td><td>${escapeHtml(r.device_name || 'Device #${r.device_id}')}</td><td class="muted">-</td><td style="color:var(--danger);font-weight:600">${escapeHtml(r.address)}</td><td>${r.count}</td></tr>`;
    });
    html += `</tbody></table></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Đóng</button></div>`;
    openModal(html);
  });
}
