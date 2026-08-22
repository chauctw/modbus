const API = '';
let state = {
  tree: [],
  currentDeviceId: null,
  currentChannelId: null,
  currentUser: null,
  tagSearch: '',
  sort: 'sort_order',
  dir: 'asc',
  page: 1,
  pageSize: 999999,
  total: 0,
  selected: new Set(),
  dataTypes: {},
  realtimeEnabled: false,
  realtimeTimer: null,
  realtimeFilter: false,
  tbDevices: [],
  tbFilter: false,
  tbPage: 1,
  tbPageSize: 999999,
  tbTotal: 0,
  lfPage: 1,
  lfPageSize: 999999,
  lfTotal: 0,
};

let _pageSizeDebounce;
function updatePageSize() {
  return;
}
updatePageSize();
window.addEventListener('resize', updatePageSize);
window.addEventListener('orientationchange', updatePageSize);

let realtimePollMs = 2000;

const $ = (sel) => document.querySelector(sel);
const modalRoot = $('#modalRoot');
let expandedChannels = new Set();

async function api(path, opts = {}) {
  const token = localStorage.getItem('kmt_token');
  const headers = { ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API + path, { headers, ...opts });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (res.status === 401) {
    localStorage.removeItem('kmt_token');
    localStorage.removeItem('kmt_user');
    window.location.href = '/login.html';
    throw new Error('Chưa đăng nhập');
  }
  if (!res.ok) throw new Error((data && data.error) || 'Lỗi không xác định');
  return data;
}

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('kmt_user')); } catch { return null; }
}

function isAdmin() {
  const u = getCurrentUser();
  return u && u.role === 'admin';
}

function logout() {
  localStorage.removeItem('kmt_token');
  localStorage.removeItem('kmt_user');
  window.location.href = '/login.html';
}

function closeModal() { modalRoot.innerHTML = ''; const picker = document.getElementById('picker-float'); if (picker) picker.remove(); }
function openModal(html, opts = {}) {
  const closeOnBackdrop = opts.closeOnBackdrop === true;
  const closeBtn = '<button class="modal-close-btn" onclick="closeModal()" title="Đóng">&times;</button>';
  let header = '';
  let body = html;
  const h3Match = html.match(/<h3[^>]*>.*?<\/h3>/i);
  if (h3Match) {
    header = `<div class="modal-header">${h3Match[0]}${closeBtn}</div>`;
    body = html.replace(h3Match[0], '');
  } else {
    header = `<div class="modal-header">${closeBtn}</div>`;
  }
  modalRoot.innerHTML = `<div class="modal-backdrop" id="backdrop"><div class="modal${opts.className ? " " + opts.className : ""}">${header}${body}</div></div>`;
  if (closeOnBackdrop) {
    $('#backdrop').addEventListener('click', (e) => { if (e.target.id === 'backdrop') closeModal(); });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatNum(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v);
}

window.addEventListener('beforeunload', () => {
  if (state.currentDeviceId) {
    navigator.sendBeacon(`/api/devices/${state.currentDeviceId}/live-disconnect`, JSON.stringify({}));
  }
});

// ---------- INIT ----------
(async function init() {
  const token = localStorage.getItem('kmt_token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }
  try {
    const me = await api('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    state.currentUser = me.user;
    localStorage.setItem('kmt_user', JSON.stringify(me.user));
    const userToggle = $('#userDropdownToggle');
    if (userToggle) userToggle.textContent = escapeHtml(me.user.username) + ' ▾';
  } catch (e) {
    localStorage.removeItem('kmt_token');
    localStorage.removeItem('kmt_user');
    window.location.href = '/login.html';
    return;
  }

  await loadDashboard();
  await loadTree();
  await loadTbDevices();
  await loadApiTbMappings();
  await loadApiFetchConfigs();
  startLiveFetchPolling();

  state.currentChannelId = '__tb__';
  state.currentDeviceId = null;
  currentLiveSource = null;
  expandedChannels.clear();

  $('#emptyState').style.display = 'none';
  $('#deviceHeader').style.display = 'none';
  $('#tagToolbar').style.display = 'none';
  $('#tagTableWrap').style.display = 'none';
  $('#tagPagination').style.display = 'none';
  $('#liveFetchConfigBar').style.display = 'none';
  $('#liveFetchTableWrap').style.display = 'none';
  $('#liveFetchPagination').style.display = 'none';
  $('#userTableWrap').style.display = 'none';

  $('#tbDeviceTableWrap').style.display = 'block';
  $('#tbDevicePagination').style.display = 'none';

  renderTbDeviceList(state.tbDevices);
  renderTree();

  const dropdownToggle = $('#dropdownToggle');
  const dropdownMenu = $('#dropdownMenu');
  const userDropdownToggle = $('#userDropdownToggle');
  const userDropdownMenu = $('#userDropdownMenu');

  function closeAllDropdowns() {
    if (dropdownMenu) dropdownMenu.classList.remove('show');
    if (userDropdownMenu) userDropdownMenu.classList.remove('show');
  }

  if (dropdownToggle && dropdownMenu) {
    dropdownToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = !dropdownMenu.classList.contains('show');
      closeAllDropdowns();
      if (opening) dropdownMenu.classList.add('show');
    });
  }

  if (userDropdownToggle && userDropdownMenu) {
    userDropdownToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = !userDropdownMenu.classList.contains('show');
      closeAllDropdowns();
      if (opening) userDropdownMenu.classList.add('show');
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#actionsDropdown') && !e.target.closest('#userDropdown')) {
      closeAllDropdowns();
    }
  });

  const userMgmtItem = $('.user-mgmt-item');
  const changePwItem = $('.change-pw-item');
  const logoutItem = $('.logout-item');

  if (userMgmtItem) {
    userMgmtItem.addEventListener('click', () => {
      userDropdownMenu && userDropdownMenu.classList.remove('show');
      showUserManagement();
    });
  }

  if (changePwItem) {
    changePwItem.addEventListener('click', () => {
      userDropdownMenu && userDropdownMenu.classList.remove('show');
      openChangePasswordModal();
    });
  }

  if (logoutItem) {
    logoutItem.addEventListener('click', () => {
      userDropdownMenu && userDropdownMenu.classList.remove('show');
      logout();
    });
  }
})();
