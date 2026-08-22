// ---------- SVG Editor ----------

var svgActiveElement = null;
var svgLastMousePos = { x: 0, y: 0 };
var svgLastClickChain = [];
var svgDrillIndex = 0;
var svgGalleryImages = [];

// Zoom & Pan state
var svgZoom = 1;
var svgPanX = 0;
var svgPanY = 0;
var svgIsPanning = false;
var svgPanStart = { x: 0, y: 0 };
var svgPanStartOffset = { x: 0, y: 0 };

function loadSvgEditor() {
  fetchSvgContent();
  loadSvgImageGallery();
}

function showToast(message, type) {
  var existing = document.querySelector('.svg-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.className = 'svg-toast svg-toast-' + (type || 'success');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() { toast.classList.add('show'); }, 10);
  setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }, 3000);
}

function showSvgLoading(text) {
  var overlay = document.getElementById('svgLoadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'svgLoadingOverlay';
    overlay.className = 'svg-loading-overlay';
    overlay.innerHTML = '<div class="svg-spinner"></div><div class="svg-loading-text"></div>';
    document.body.appendChild(overlay);
  }
  overlay.querySelector('.svg-loading-text').textContent = text || 'Dang xu ly...';
  overlay.style.display = 'flex';
}

function hideSvgLoading() {
  var overlay = document.getElementById('svgLoadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function fetchSvgContent() {
  svgLastClickChain = [];
  svgDrillIndex = 0;
  try {
    var res = await api('/api/svg-editor/svg');
    var container = document.getElementById('svgContainer');
    if (!res.svgContent) {
      container.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px">Chua co SVG. Hay tai tu ThingsBoard hoac cau hinh ThingsBoard truoc.</p>';
      resetSvgZoomPan();
      return;
    }
    container.innerHTML = res.svgContent;
    var svg = container.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.addEventListener('click', svgClickHandler);
    }
    resetSvgZoomPan();
    updateSvgTransform();
  } catch (e) {
    showToast('Loi tai SVG: ' + e.message, 'error');
  }
}

// ---- Zoom & Pan ----
function resetSvgZoomPan() {
  svgZoom = 1;
  svgPanX = 0;
  svgPanY = 0;
}

function updateSvgTransform() {
  var container = document.getElementById('svgContainer');
  if (!container) return;
  var svg = container.querySelector('svg');
  if (!svg) return;
  svg.style.transformOrigin = '0 0';
  svg.style.transform = 'translate(' + svgPanX + 'px, ' + svgPanY + 'px) scale(' + svgZoom + ')';
}

function svgZoomIn() {
  svgZoom = Math.min(svgZoom * 1.2, 10);
  updateSvgTransform();
}

function svgZoomOut() {
  svgZoom = Math.max(svgZoom / 1.2, 0.1);
  updateSvgTransform();
}

function svgZoomReset() {
  resetSvgZoomPan();
  updateSvgTransform();
}

// ---- Image Gallery in Toolbar Dropdown ----
async function loadSvgImageGallery() {
  var listDiv = document.getElementById('svgGalleryList');
  if (!listDiv) return;
  listDiv.innerHTML = '<p style="padding:12px;text-align:center;color:var(--muted)">Đang tải danh sách ảnh...</p>';
  try {
    var res = await api('/api/svg-editor/images');
    svgGalleryImages = res.images || [];
    renderSvgGalleryList('');
  } catch (e) {
    listDiv.innerHTML = '<p style="padding:12px;text-align:center;color:var(--danger)">Lỗi: ' + e.message + '</p>';
  }
}

function renderSvgGalleryList(filter) {
  var listDiv = document.getElementById('svgGalleryList');
  var cfg = null;
  api('/api/svg-editor/config').then(function(c) {
    cfg = c;
    doRender();
  }).catch(function() {
    doRender();
  });

  function doRender() {
    var currentUrl = (cfg && cfg.svg_url) || '';
    var lowerFilter = (filter || '').toLowerCase();
    var filtered = svgGalleryImages;
    if (lowerFilter) {
      filtered = svgGalleryImages.filter(function(img) {
        return (img.name || img.title || '').toLowerCase().indexOf(lowerFilter) !== -1;
      });
    }
    if (filtered.length === 0) {
      listDiv.innerHTML = '<p style="padding:12px;text-align:center;color:var(--muted)">' + (svgGalleryImages.length === 0 ? 'Không tìm thấy ảnh nào.' : 'Không khớp bộ lọc.') + '</p>';
      return;
    }
    var html = '';
    filtered.forEach(function(img) {
      var name = img.name || img.title || 'unnamed';
      var link = img.link || '';
      var isSelected = currentUrl && link && currentUrl === link;
      var svgTag = name.toLowerCase().endsWith('.svg') ? ' <span class="svg-gallery-svg-tag">SVG</span>' : '';
      html += '<div class="svg-gallery-item' + (isSelected ? ' svg-gallery-selected' : '') + '" data-url="' + (link || '').replace(/"/g, '&quot;') + '" data-name="' + (name || '').replace(/"/g, '&quot;') + '">' +
        '<span class="svg-gallery-item-name">' + (name || 'unnamed') + svgTag + '</span>' +
        '</div>';
    });
    listDiv.innerHTML = html;
    listDiv.querySelectorAll('.svg-gallery-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var url = el.getAttribute('data-url');
        var name = el.getAttribute('data-name');
        selectSvgImage(url, name);
      });
    });
  }
}

async function selectSvgImage(url, name) {
  try {
    await api('/api/svg-editor/config', { method: 'PUT', body: JSON.stringify({ svg_url: url }) });
  } catch (e) { /* ignore */ }
  var menu = document.getElementById('svgGalleryMenu');
  if (menu) menu.classList.remove('show');
  showSvgLoading('Đang tải "' + name + '" từ ThingsBoard...');
  try {
    var res = await api('/api/svg-editor/sync-from-tb', { method: 'POST' });
    showToast('Đã tải "' + name + '" thành công!', 'success');
    await fetchSvgContent();
  } catch (e) {
    showToast('Lỗi tải SVG: ' + e.message, 'error');
  } finally {
    hideSvgLoading();
  }
  renderSvgGalleryList(document.getElementById('svgGallerySearch') ? document.getElementById('svgGallerySearch').value : '');
}

function svgClickHandler(e) {
  if (svgIsPanning) return;
  svgLastMousePos = { x: e.clientX, y: e.clientY };
  var target = svgResolveTarget(e.target);
  if (target && target.id) {
    e.stopPropagation();
    svgSelectElement(target, e);
  }
}

function svgGetIdChain(el) {
  var chain = [];
  var node = el.closest('g[id]:not(#TB_Group), text[id]');
  while (node) {
    chain.unshift(node);
    var parent = node.parentElement;
    node = parent ? parent.closest('g[id]:not(#TB_Group), text[id]') : null;
  }
  return chain;
}

function svgSameChain(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function svgResolveTarget(el) {
  var chain = svgGetIdChain(el);
  if (chain.length === 0) return null;
  if (svgSameChain(chain, svgLastClickChain)) {
    svgDrillIndex = (svgDrillIndex + 1) % chain.length;
  } else {
    svgLastClickChain = chain;
    svgDrillIndex = 0;
  }
  return chain[svgDrillIndex];
}

function svgSelectElement(el, event) {
  if (svgActiveElement) svgActiveElement.classList.remove('svg-highlighted');
  el.classList.add('svg-highlighted');
  svgActiveElement = el;
  svgOpenModal(el, event);
}

function svgOpenModal(el, event) {
  var existing = document.getElementById('svgIdModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'svgIdModal';
  modal.className = 'svg-id-modal';
  modal.innerHTML =
    '<h3>Sửa ID Element</h3>' +
    '<div class="svg-form-group">' +
    '<label>ID Hiện Tại:</label>' +
    '<input type="text" id="svgOldIdInput" value="' + (el.id || '') + '" readonly style="background:#e9ecef">' +
    '</div>' +
    '<div class="svg-form-group">' +
    '<label>ID Mới:</label>' +
    '<input type="text" id="svgNewIdInput" value="' + (el.id || '') + '">' +
    '</div>' +
    '<div class="svg-btn-group">' +
    '<button class="btn" id="svgModalClose">Hủy</button>' +
    '<button class="btn btn-primary" id="svgModalSave">Lưu ID</button>' +
    '</div>';

  document.body.appendChild(modal);

  var x = (event ? event.clientX : svgLastMousePos.x) + 10;
  var y = (event ? event.clientY : svgLastMousePos.y) + 10;
  if (x + 280 > window.innerWidth) x = window.innerWidth - 295;
  if (y + 220 > window.innerHeight) y = window.innerHeight - 235;
  modal.style.left = x + 'px';
  modal.style.top = y + 'px';

  document.getElementById('svgModalClose').addEventListener('click', svgCloseModal);
  document.getElementById('svgModalSave').addEventListener('click', svgSaveNewId);

  setTimeout(function() {
    var input = document.getElementById('svgNewIdInput');
    input.focus();
    input.select();
  }, 50);
}

function svgCloseModal() {
  var modal = document.getElementById('svgIdModal');
  if (modal) modal.remove();
  if (svgActiveElement) {
    svgActiveElement.classList.remove('svg-highlighted');
    svgActiveElement = null;
  }
}

async function svgSaveNewId() {
  var oldId = document.getElementById('svgOldIdInput').value;
  var newId = document.getElementById('svgNewIdInput').value.trim();
  if (!newId) return showToast('ID mới không được để trống!', 'error');
  if (oldId === newId) { svgCloseModal(); return; }

  if (svgActiveElement) {
    svgActiveElement.id = newId;
    svgActiveElement.classList.remove('svg-highlighted');
  }

  var container = document.getElementById('svgContainer');
  var svgEl = container.querySelector('svg');
  if (!svgEl) return showToast('Không tìm thấy SVG!', 'error');

  var highlighted = svgEl.querySelectorAll('.svg-highlighted');
  highlighted.forEach(function(el) { el.classList.remove('svg-highlighted'); });

  var updatedSvg = svgEl.outerHTML;
  try {
    await api('/api/svg-editor/save-local', { method: 'POST', body: JSON.stringify({ svgContent: updatedSvg }) });
    showToast('Đã lưu tạm ID mới!', 'success');
    svgCloseModal();
    await fetchSvgContent();
  } catch (e) {
    showToast('Lỗi: ' + e.message, 'error');
  }
}

// ---- Config Modal ----
async function openSvgConfigModal() {
  var cfg = { thingsboard_host: '', thingsboard_username: '', thingsboard_password: '', svg_url: '' };
  try {
    cfg = await api('/api/svg-editor/config');
  } catch (e) { /* use defaults */ }

  var modal = document.createElement('div');
  modal.id = 'svgConfigModal';
  modal.className = 'svg-id-modal';
  modal.style.width = '380px';
  modal.innerHTML =
    '<h3>Cấu hình ThingsBoard</h3>' +
    '<div class="svg-form-group"><label>Host:</label><input type="text" id="svgCfgHost" value="' + (cfg.thingsboard_host || '') + '"></div>' +
    '<div class="svg-form-group"><label>Username:</label><input type="text" id="svgCfgUser" value="' + (cfg.thingsboard_username || '') + '"></div>' +
    '<div class="svg-form-group"><label>Password:</label><input type="password" id="svgCfgPass" value="' + (cfg.thingsboard_password || '') + '"></div>' +
    '<div class="svg-form-group"><label>SVG URL:</label><input type="text" id="svgCfgUrl" value="' + (cfg.svg_url || '') + '"></div>' +
    '<div class="svg-btn-group">' +
    '<button class="btn" id="svgCfgClose">Hủy</button>' +
    '<button class="btn btn-primary" id="svgCfgSave">Lưu</button>' +
    '</div>';

  document.body.appendChild(modal);
  modal.style.left = '50%';
  modal.style.top = '50%';
  modal.style.transform = 'translate(-50%, -50%)';

  document.getElementById('svgCfgClose').addEventListener('click', function() { modal.remove(); });
  document.getElementById('svgCfgSave').addEventListener('click', async function() {
    var body = {
      thingsboard_host: document.getElementById('svgCfgHost').value,
      thingsboard_username: document.getElementById('svgCfgUser').value,
      thingsboard_password: document.getElementById('svgCfgPass').value,
      svg_url: document.getElementById('svgCfgUrl').value,
    };
    try {
      await api('/api/svg-editor/config', { method: 'PUT', body: JSON.stringify(body) });
      showToast('Đã lưu cấu hình!', 'success');
      modal.remove();
      loadSvgImageGallery();
    } catch (e) {
      showToast('Lỗi: ' + e.message, 'error');
    }
  });
}

// ---- Sync ----
async function syncFromThingsBoard() {
  showSvgLoading('Đang tải SVG từ ThingsBoard...');
  try {
    var res = await api('/api/svg-editor/sync-from-tb', { method: 'POST' });
    showToast(res.message || 'Tải SVG thành công!', 'success');
    await fetchSvgContent();
  } catch (e) {
    showToast('Lỗi: ' + e.message, 'error');
  } finally {
    hideSvgLoading();
  }
}

async function syncToThingsBoard() {
  showSvgLoading('Đang đồng bộ lên ThingsBoard...');
  try {
    var res = await api('/api/svg-editor/sync-to-tb', { method: 'POST' });
    showToast(res.message || 'Đồng bộ thành công!', 'success');
  } catch (e) {
    showToast('Lỗi: ' + e.message, 'error');
  } finally {
    hideSvgLoading();
  }
}

// ---- Init listeners ----
document.addEventListener('DOMContentLoaded', function() {
  var svgConfigBtn = document.getElementById('svgConfigBtn');
  var svgSyncFromTbBtn = document.getElementById('svgSyncFromTbBtn');
  var svgSyncToTbBtn = document.getElementById('svgSyncToTbBtn');
  var svgGalleryBtn = document.getElementById('svgGalleryBtn');
  var svgGallerySearch = document.getElementById('svgGallerySearch');

  var svgZoomInBtn = document.getElementById('svgZoomInBtn');
  var svgZoomOutBtn = document.getElementById('svgZoomOutBtn');
  var svgZoomResetBtn = document.getElementById('svgZoomResetBtn');

  if (svgConfigBtn) svgConfigBtn.addEventListener('click', openSvgConfigModal);
  if (svgSyncFromTbBtn) svgSyncFromTbBtn.addEventListener('click', syncFromThingsBoard);
  if (svgSyncToTbBtn) svgSyncToTbBtn.addEventListener('click', syncToThingsBoard);
  if (svgZoomInBtn) svgZoomInBtn.addEventListener('click', svgZoomIn);
  if (svgZoomOutBtn) svgZoomOutBtn.addEventListener('click', svgZoomOut);
  if (svgZoomResetBtn) svgZoomResetBtn.addEventListener('click', svgZoomReset);

  // Gallery dropdown toggle
  if (svgGalleryBtn) {
    svgGalleryBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var menu = document.getElementById('svgGalleryMenu');
      if (menu) menu.classList.toggle('show');
    });
  }

  // Gallery search filter
  if (svgGallerySearch) {
    svgGallerySearch.addEventListener('input', function() {
      renderSvgGalleryList(this.value);
    });
    svgGallerySearch.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', function(e) {
    var dropdown = document.getElementById('svgImageGalleryDropdown');
    var menu = document.getElementById('svgGalleryMenu');
    if (dropdown && menu && !dropdown.contains(e.target)) {
      menu.classList.remove('show');
    }
  });

  // ESC key to close modal
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var idModal = document.getElementById('svgIdModal');
      var cfgModal = document.getElementById('svgConfigModal');
      if (idModal) {
        svgCloseModal();
        e.preventDefault();
      } else if (cfgModal) {
        cfgModal.remove();
        e.preventDefault();
      }
      // Also close gallery dropdown
      var galleryMenu = document.getElementById('svgGalleryMenu');
      if (galleryMenu) galleryMenu.classList.remove('show');
    }
  });

  // Zoom & Pan on SVG container
  var svgContainer = document.getElementById('svgContainer');
  if (svgContainer) {
    // Mouse wheel zoom
    svgContainer.addEventListener('wheel', function(e) {
      if (!svgContainer.querySelector('svg')) return;
      e.preventDefault();
      var rect = svgContainer.getBoundingClientRect();
      var mouseX = e.clientX - rect.left;
      var mouseY = e.clientY - rect.top;

      var oldZoom = svgZoom;
      if (e.deltaY < 0) {
        svgZoom = Math.min(svgZoom * 1.1, 10);
      } else {
        svgZoom = Math.max(svgZoom / 1.1, 0.1);
      }

      // Zoom towards mouse position
      svgPanX = mouseX - (mouseX - svgPanX) * (svgZoom / oldZoom);
      svgPanY = mouseY - (mouseY - svgPanY) * (svgZoom / oldZoom);

      updateSvgTransform();
    }, { passive: false });

    // Pan with middle mouse or Alt+left click
    svgContainer.addEventListener('mousedown', function(e) {
      // Middle mouse button or Alt+left
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        svgIsPanning = true;
        svgPanStart = { x: e.clientX, y: e.clientY };
        svgPanStartOffset = { x: svgPanX, y: svgPanY };
        svgContainer.style.cursor = 'grabbing';
      }
    });

    document.addEventListener('mousemove', function(e) {
      if (!svgIsPanning) return;
      svgPanX = svgPanStartOffset.x + (e.clientX - svgPanStart.x);
      svgPanY = svgPanStartOffset.y + (e.clientY - svgPanStart.y);
      updateSvgTransform();
    });

    document.addEventListener('mouseup', function() {
      if (svgIsPanning) {
        svgIsPanning = false;
        svgContainer.style.cursor = '';
      }
    });
  }
});
