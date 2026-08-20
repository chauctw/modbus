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

$('#exportBtn').addEventListener('click', async () => {
  try {
    const token = localStorage.getItem('kmt_token');
    const res = await fetch('/api/export', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.status === 401) {
      localStorage.removeItem('kmt_token');
      localStorage.removeItem('kmt_user');
      window.location.href = '/login.html';
      return;
    }
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kepware-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Export lỗi: ' + err.message);
  }
});

$('#resetBtn').addEventListener('click', async () => {
  if (!confirm('Xoá toàn bộ dữ liệu hiện tại trong DB? Hành động này không thể hoàn tác.')) return;
  await api('/api/reset', { method: 'POST' });
  state.currentDeviceId = null;
  showEmptyState();
  await loadTree(); await loadDashboard();
});
