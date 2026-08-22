async function loadTree() {
  state.tree = await api('/api/tree');
  renderTree();
}

function renderTree() {
  const filter = $('#treeSearch').value.trim().toLowerCase();
  const treeEl = $('#tree');
  treeEl.innerHTML = '';

  const tbSection = document.createElement('div');
  tbSection.className = 'tree-channel';
  const tbDevices = state.tbDevices.filter((tb) => !filter || tb.name.toLowerCase().includes(filter));
  tbSection.innerHTML = `
    <div class="tree-channel-row" data-channel="__tb__">
      <span class="tree-channel-toggle">▶</span>
      <span class="tree-channel-name">THINGSBOARD DEVICES</span>      
      <button class="tree-channel-actions" title="Thêm thiết bị TB">+</button>
    </div>
  `;

  tbSection.querySelector('.tree-channel-name').addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.currentChannelId === '__tb__') return;
    state.currentChannelId = '__tb__';
    state.currentDeviceId = null;
    currentLiveSource = null;
    stopRealtime();
    stopCustomTagRealtime();
    expandedChannels.clear();
    $('#emptyState').style.display = 'none';
    $('#deviceHeader').style.display = 'none';
    $('#userHeader').style.display = 'none';
    $('#userTableWrap').style.display = 'none';
    $('#tagToolbar').style.display = 'none';
    $('#tagTableWrap').style.display = 'none';
    $('#tagPagination').style.display = 'none';
    $('#liveFetchConfigBar').style.display = 'none';
    $('#liveFetchTableWrap').style.display = 'none';
    $('#liveFetchPagination').style.display = 'none';
    $('#customTagToolbar').style.display = 'none';
    $('#customTagTableWrap').style.display = 'none';
    $('#tbDeviceTableWrap').style.display = 'block';
    $('#tbDevicePagination').style.display = 'none';
    renderTbDeviceList(state.tbDevices);
    renderTree();
  });

  tbSection.querySelector('.tree-channel-actions').addEventListener('click', (e) => {
    e.stopPropagation();
    openTbDeviceForm();
  });

  treeEl.appendChild(tbSection);

  const apiSection = document.createElement('div');
  apiSection.className = 'tree-channel';
  const isApiExpanded = expandedChannels.has('__api__');
  apiSection.innerHTML = `
    <div class="tree-channel-row ${isApiExpanded ? 'expanded' : ''}" data-channel="__api__">
      <span class="tree-channel-toggle">▶</span>
      <span class="tree-channel-name">CHANNEL API FETCH</span>
      <button class="tree-channel-actions" title="Tùy chọn">⋯</button>
    </div>
    <div class="tree-devices ${isApiExpanded ? '' : 'collapsed'}"></div>
  `;

  const apiDevicesEl = apiSection.querySelector('.tree-devices');
  liveFetchSources.forEach((src) => {
    const row = document.createElement('div');
    row.className = 'tree-device-row' + (currentLiveSource === src.key ? ' active' : '');
    row.dataset.device = src.key;
    row.dataset.channel = '__api__';
    row.dataset.type = 'api';
    row.innerHTML = `<span>${escapeHtml(src.label).toUpperCase()}</span>`;
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      selectLiveSource(src.key);
    });
    apiDevicesEl.appendChild(row);
  });

  apiSection.querySelector('.tree-channel-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    if (expandedChannels.has('__api__')) {
      expandedChannels.delete('__api__');
    } else {
      expandedChannels.add('__api__');
    }
    renderTree();
  });

  apiSection.querySelector('.tree-channel-name').addEventListener('click', (e) => {
    e.stopPropagation();
    if (expandedChannels.has('__api__')) {
      expandedChannels.delete('__api__');
    } else {
      expandedChannels.add('__api__');
    }
    renderTree();
  });

  apiSection.querySelector('.tree-channel-actions').addEventListener('click', (e) => {
    e.stopPropagation();
    currentLiveSource = null;
    renderLiveFetchTable();
    renderTree();
  });

  treeEl.appendChild(apiSection);

  const customSection = document.createElement('div');
  customSection.className = 'tree-channel';
  const isCustomExpanded = expandedChannels.has('__custom__');
  customSection.innerHTML = `
    <div class="tree-channel-row ${isCustomExpanded ? 'expanded' : ''}" data-channel="__custom__">
      <span class="tree-channel-toggle">▶</span>
      <span class="tree-channel-name">CUSTOM TAG CHANNEL</span>
      <button class="tree-channel-actions" title="Thêm Custom Tag">+</button>
    </div>
    <div class="tree-devices ${isCustomExpanded ? '' : 'collapsed'}"></div>
  `;

  customSection.querySelector('.tree-channel-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    if (expandedChannels.has('__custom__')) {
      expandedChannels.delete('__custom__');
    } else {
      expandedChannels.add('__custom__');
    }
    renderTree();
  });

  customSection.querySelector('.tree-channel-name').addEventListener('click', (e) => {
    e.stopPropagation();
    selectCustomTagChannel();
  });

  customSection.querySelector('.tree-channel-actions').addEventListener('click', (e) => {
    e.stopPropagation();
    selectCustomTagChannel();
    openCustomTagForm();
  });

  treeEl.appendChild(customSection);

  state.tree.forEach((ch) => {
    if (ch.name === '__REALTIME__') return;
    const devices = ch.devices.filter((d) => !filter || d.name.toLowerCase().includes(filter) || ch.name.toLowerCase().includes(filter));
    if (filter && !ch.name.toLowerCase().includes(filter) && !devices.length) return;

    const isExpanded = expandedChannels.has(String(ch.id));

    const chDiv = document.createElement('div');
    chDiv.className = 'tree-channel';
    chDiv.innerHTML = `
      <div class="tree-channel-row ${isExpanded ? 'expanded' : ''}" data-channel="${ch.id}">
        <span class="tree-channel-toggle">▶</span>
        <span class="tree-channel-name">${escapeHtml(ch.name).toUpperCase()}</span>
        <button class="tree-channel-actions" title="Tùy chọn">⋯</button>
      </div>
      <div class="tree-devices ${isExpanded ? '' : 'collapsed'}"></div>
    `;
    const devicesEl = chDiv.querySelector('.tree-devices');
    (filter ? devices : ch.devices).forEach((d) => {
      const row = document.createElement('div');
      row.className = 'tree-device-row' + (d.id === state.currentDeviceId ? ' active' : '');
      row.dataset.device = d.id;
      row.dataset.channel = ch.id;
      row.dataset.type = 'modbus';
      row.innerHTML = `<span>${escapeHtml(d.name)}</span>`;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        selectDevice(ch.id, d.id);
      });
      devicesEl.appendChild(row);
    });

    chDiv.querySelector('.tree-channel-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      if (expandedChannels.has(String(ch.id))) {
        expandedChannels.delete(String(ch.id));
      } else {
        expandedChannels.add(String(ch.id));
      }
      renderTree();
    });

    chDiv.querySelector('.tree-channel-name').addEventListener('click', (e) => {
      e.stopPropagation();
      if (expandedChannels.has(String(ch.id))) {
        expandedChannels.delete(String(ch.id));
      } else {
        expandedChannels.add(String(ch.id));
      }
      renderTree();
    });

    chDiv.querySelector('.tree-channel-actions').addEventListener('click', (e) => {
      e.stopPropagation();
      openChannelMenu(ch);
    });

    treeEl.appendChild(chDiv);
  });
}

function openChannelMenu(ch) {
  openModal(`
    <h3>Channel: ${escapeHtml(ch.name)}</h3>
    <div class="field"><label>Tên</label><input id="f-name" value="${escapeHtml(ch.name)}" /></div>
    <div class="field-row">
      <div class="field"><label>Driver</label><input id="f-driver" value="${escapeHtml(ch.driver || '')}" /></div>
      <div class="field"><label>Cổng TCP</label><input id="f-port" type="number" value="${ch.port || 502}" /></div>
    </div>
    <div class="field">
      <button class="btn btn-block" id="addDeviceInChannel">+ Thêm Device vào channel này</button>
    </div>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn btn-danger" id="delCh">Xoá</button>
      <button class="btn" onclick="closeModal()">Đóng</button>
      <button class="btn btn-primary" id="saveCh">Lưu</button>
    </div>
  `);
  $('#saveCh').onclick = async () => {
    try {
      await api(`/api/channels/${ch.id}`, { method: 'PUT', body: JSON.stringify({
        name: $('#f-name').value, driver: $('#f-driver').value, port: Number($('#f-port').value),
      }) });
      closeModal(); await loadTree();
    } catch (e) { $('#err').textContent = e.message; }
  };
  $('#delCh').onclick = async () => {
    if (!confirm(`Xoá channel "${ch.name}" sẽ xoá ${ch.deviceCount} device và ${ch.tagCount} tag. Chắc chắn?`)) return;
    await api(`/api/channels/${ch.id}`, { method: 'DELETE' });
    closeModal(); state.currentDeviceId = null; showEmptyState(); await loadTree(); await loadDashboard();
  };
  $('#addDeviceInChannel').onclick = () => { closeModal(); openDeviceForm(ch.id); };
}
