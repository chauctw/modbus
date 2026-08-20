$('#addChannelBtn').addEventListener('click', () => {
  openModal(`
    <h3>Thêm Channel</h3>
    <div class="field"><label>Tên</label><input id="f-name" placeholder="VD: HUNGPHU" /></div>
    <div class="field-row">
      <div class="field"><label>Driver</label><input id="f-driver" value="Modbus TCP/IP Ethernet" /></div>
      <div class="field"><label>Cổng TCP</label><input id="f-port" type="number" value="502" /></div>
    </div>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Huỷ</button>
      <button class="btn btn-primary" id="save">Tạo</button>
    </div>
  `);
  $('#save').onclick = async () => {
    try {
      await api('/api/channels', { method: 'POST', body: JSON.stringify({
        name: $('#f-name').value, driver: $('#f-driver').value, port: Number($('#f-port').value),
      }) });
      closeModal(); await loadTree(); await loadDashboard();
    } catch (e) { $('#err').textContent = e.message; }
  };
});

$('#addTbBtn').addEventListener('click', () => {
  openTbDeviceForm();
});

$('#treeSearch').addEventListener('input', renderTree);

$('#addCustomTagBtn').addEventListener('click', () => {
  openCustomTagForm();
});
