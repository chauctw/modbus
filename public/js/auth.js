function openChangePasswordModal() {
  openModal(`
    <h3>Đổi mật khẩu</h3>
    <div class="field"><label>Mật khẩu cũ</label><input type="password" id="f-old" /></div>
    <div class="field"><label>Mật khẩu mới</label><input type="password" id="f-new" /></div>
    <div class="field"><label>Nhập lại mật khẩu mới</label><input type="password" id="f-new2" /></div>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Huỷ</button>
      <button class="btn btn-primary" id="save">Lưu</button>
    </div>
  `);
  $('#save').onclick = async () => {
    const oldPw = $('#f-old').value;
    const newPw = $('#f-new').value;
    const newPw2 = $('#f-new2').value;
    if (!oldPw || !newPw) { $('#err').textContent = 'Thiếu mật khẩu'; return; }
    if (newPw.length < 6) { $('#err').textContent = 'Mật khẩu mới phải có ít nhất 6 ký tự'; return; }
    if (newPw !== newPw2) { $('#err').textContent = 'Mật khẩu nhập lại không khớp'; return; }
    try {
      await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }) });
      closeModal();
      alert('Đổi mật khẩu thành công');
    } catch (e) { $('#err').textContent = e.message; }
  };
}

let userManagementVisible = false;

async function loadUsers() {
  if (!userManagementVisible) return;
  try {
    const users = await api('/api/users');
    renderUserList(users);
  } catch (e) {
    console.error('Failed to load users:', e);
  }
}

function renderUserList(users) {
  const tbody = $('#userTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  users.forEach((u) => {
    const tr = document.createElement('tr');
    tr.dataset.id = u.id;
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${escapeHtml(u.username)}</td>
      <td><span class="badge ${u.role === 'admin' ? 'on' : ''}">${u.role}</span></td>
      <td class="muted">${u.created_at || '-'}</td>
      <td class="muted">${u.updated_at || '-'}</td>
      <td class="row-actions">
        <button class="icon-btn edit-btn" title="Sửa quyền">⚙</button>
        <button class="icon-btn del-btn" title="Xoá">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('.edit-btn').addEventListener('click', () => openUserForm(u));
    tr.querySelector('.del-btn').addEventListener('click', async () => {
      if (!confirm(`Xoá user "${u.username}"?`)) return;
      try {
        await api(`/api/users/${u.id}`, { method: 'DELETE' });
        loadUsers();
      } catch (e) { alert(e.message); }
    });
  });
}

function openUserForm(user = null) {
  const isEdit = !!user;
  openModal(`
    <h3>${isEdit ? 'Sửa' : 'Thêm'} Người dùng</h3>
    <div class="field"><label>Tên đăng nhập</label><input id="f-username" value="${user ? escapeHtml(user.username) : ''}" ${isEdit ? 'disabled' : ''} /></div>
    ${!isEdit ? `<div class="field"><label>Mật khẩu</label><input type="password" id="f-password" /></div>` : ''}
    <div class="field">
      <label>Quyền</label>
      <select id="f-role">
        <option value="admin" ${user && user.role === 'admin' ? 'selected' : ''}>Admin</option>
        <option value="editor" ${user && user.role === 'editor' ? 'selected' : ''}>Editor</option>
        <option value="viewer" ${user && user.role === 'viewer' ? 'selected' : ''}>Viewer</option>
      </select>
    </div>
    <div id="err" class="error-text"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Huỷ</button>
      <button class="btn btn-primary" id="save">Lưu</button>
    </div>
  `);
  $('#save').onclick = async () => {
    const username = $('#f-username').value.trim();
    const role = $('#f-role').value;
    try {
      if (isEdit) {
        await api(`/api/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ role }) });
      } else {
        const password = $('#f-password').value;
        if (!username || !password) { $('#err').textContent = 'Thiếu username hoặc password'; return; }
        if (password.length < 6) { $('#err').textContent = 'Password phải có ít nhất 6 ký tự'; return; }
        await api('/api/users', { method: 'POST', body: JSON.stringify({ username, password, role }) });
      }
      closeModal(); loadUsers();
    } catch (e) { $('#err').textContent = e.message; }
  };
}

function showUserManagement() {
  userManagementVisible = true;
  state.currentChannelId = '__users__';
  state.currentDeviceId = null;
  currentLiveSource = null;
  expandedChannels.clear();
  $('#emptyState').style.display = 'none';
  $('#deviceHeader').style.display = 'none';
  $('#userHeader').style.display = 'flex';
  $('#tagToolbar').style.display = 'none';
  $('#tagTableWrap').style.display = 'none';
  $('#tagPagination').style.display = 'none';
  $('#liveFetchConfigBar').style.display = 'none';
  $('#liveFetchTableWrap').style.display = 'none';
  $('#liveFetchPagination').style.display = 'none';
  $('#tbDeviceTableWrap').style.display = 'none';
  $('#tbDevicePagination').style.display = 'none';
  $('#userTableWrap').style.display = 'block';
  $('#userTitle').textContent = 'Quản lý người dùng';
  $('#userMeta').textContent = `Đăng nhập: ${escapeHtml(getCurrentUser()?.username || '')} (${getCurrentUser()?.role || ''})`;
  loadUsers();
  renderTree();
}
