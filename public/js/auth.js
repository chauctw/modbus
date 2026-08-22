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



function openUserForm(user = null) {
  const isEdit = !!user;
  openModal(`
    <h3>${isEdit ? 'Sửa' : 'Thêm'} Người dùng</h3>
    <div class="field"><label>Tên đăng nhập</label><input id="f-username" value="${user ? escapeHtml(user.username) : ''}" /></div>
    <div class="field"><label>Mật khẩu</label><input type="password" id="f-password" placeholder="${isEdit ? 'Để trống nếu không đổi' : ''}" /></div>
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
      <button class="btn" onclick="closeModal(); showUserManagement();">Huỷ</button>
      <button class="btn btn-primary" id="save">Lưu</button>
    </div>
  `);
  $('#save').onclick = async () => {
    const username = $('#f-username').value.trim();
    const role = $('#f-role').value;
    try {
      if (isEdit) {
        await api(`/api/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ username, password: $('#f-password').value || undefined, role }) });
      } else {
        const password = $('#f-password').value;
        if (!username || !password) { $('#err').textContent = 'Thiếu username hoặc password'; return; }
        if (password.length < 6) { $('#err').textContent = 'Password phải có ít nhất 6 ký tự'; return; }
        await api('/api/users', { method: 'POST', body: JSON.stringify({ username, password, role }) });
      }
      closeModal(); showUserManagement();
    } catch (e) { $('#err').textContent = e.message; }
  };

  // Override X close button to return to user management
  const _closeBtn = modalRoot.querySelector(".modal-close-btn");
  if (_closeBtn) _closeBtn.onclick = () => { closeModal(); showUserManagement(); };
}

async function showUserManagement() {
  try {
    const users = await api('/api/users');
    const rows = users.map((u, i) => `
      <tr data-id="${u.id}">
        <td>${i + 1}</td>
        <td>${escapeHtml(u.username)}</td>
        <td><span class="badge ${u.role === 'admin' ? 'on' : ''}">${u.role}</span></td>
        <td class="muted">${u.created_at || '-'}</td>
        <td class="muted">${u.updated_at || '-'}</td>
        <td><div class="row-actions">
          <button class="icon-btn edit-btn" data-uid="${u.id}" title="Sửa quyền">⚙</button>
          <button class="icon-btn del-btn" data-uid="${u.id}" title="Xoá">🗑</button>
        </div></td>
      </tr>`).join('');
    openModal(`
      <h3>Quản lý người dùng</h3>
      <div class="table-wrap user-mgmt-table-wrap">
        <table id="userMgmtTable">
          <thead>
            <tr><th>STT</th><th>Tên đăng nhập</th><th>Quyền</th><th>Tạo lúc</th><th>Cập nhật</th><th>Thao tác</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="addUserBtn">+ Thêm người dùng</button>
        <button class="btn" onclick="closeModal()">Đóng</button>
      </div>
    `, { className: "modal-wide" });
    document.querySelectorAll('#userMgmtTable .edit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.uid;
        const user = users.find(u => String(u.id) === String(uid));
        if (user) openUserForm(user);
      });
    });
    document.querySelectorAll('#userMgmtTable .del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.uid;
        const user = users.find(u => String(u.id) === String(uid));
        if (!confirm(`Xoá user "${user?.username}"?`)) return;
        try {
          await api(`/api/users/${uid}`, { method: 'DELETE' });
          showUserManagement();
        } catch (e) { alert(e.message); }
      });
    });
    modalRoot.querySelector('#addUserBtn').addEventListener('click', () => openUserForm());
  } catch (e) {
    console.error('Failed to load users:', e);
    alert('Không thể tải danh sách người dùng');
  }
}
