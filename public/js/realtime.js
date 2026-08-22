function setLiveCell(id, res) {
  const tr = document.querySelector(`#tagTableBody tr[data-id="${id}"]`);
  if (!tr) return;
  const dot = tr.querySelector('.live-dot');
  const text = tr.querySelector('.live-text');
  if (!dot || !text) return;
  const displayValue = (res.scaledValue != null) ? res.scaledValue : res.value;
  if (displayValue === null || displayValue === undefined || res.quality === 'bad') {
    dot.className = 'live-dot bad';
    text.className = 'live-text muted';
    text.textContent = '—';
  } else {
    dot.className = 'live-dot good';
    text.className = 'live-text';
    text.textContent = formatNum(displayValue);
  }
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
  // Refresh dashboard mỗi 10s để cập nhật số liệu realtime / mất kết nối
  if (typeof loadDashboard === 'function') {
    state.dashboardRefreshTimer = setInterval(loadDashboard, 10000);
  }
}

function stopRealtime() {
  state.realtimeEnabled = false;
  if (state.realtimeTimer) clearInterval(state.realtimeTimer);
  state.realtimeTimer = null;
  if (state.dashboardRefreshTimer) clearInterval(state.dashboardRefreshTimer);
  state.dashboardRefreshTimer = null;
  const status = $('#realtimeStatus');
  if (status) status.textContent = '';
}

function startCustomTagRealtime() {
  if (state.customTagRealtime) return;
  state.customTagRealtime = true;
  pollCustomTagValues();
  state.customTagTimer = setInterval(pollCustomTagValues, 2000);
}

function stopCustomTagRealtime() {
  state.customTagRealtime = false;
  if (state.customTagTimer) clearInterval(state.customTagTimer);
  state.customTagTimer = null;
}

async function pollCustomTagValues() {
  if (!state.customTagRealtime) return;
  try {
    const values = await api('/api/custom-tags/live-values');
    const map = new Map(values.map(v => [v.id, v]));
    document.querySelectorAll('#customTagTableBody tr').forEach(tr => {
      const id = Number(tr.dataset.id);
      const v = map.get(id);
      if (!v) return;
      const dot = tr.querySelector('.live-dot');
      const text = tr.querySelector('.live-text');
      if (!dot || !text) return;
      if (v.value === null || v.value === undefined) {
        dot.className = 'live-dot bad';
        text.className = 'live-text muted';
        text.textContent = '—';
      } else {
        dot.className = 'live-dot good';
        text.className = 'live-text';
        text.textContent = formatNum(v.value);
      }
    });
  } catch (e) {
    console.error('pollCustomTagValues error', e);
  }
}
