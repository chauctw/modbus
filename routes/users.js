module.exports = function register(app, db) {
  app.get('/api/users', (req, res) => {
    const users = db.prepare('SELECT id, username, role, created_at, updated_at FROM users ORDER BY id').all();
    res.json(users);
  });

  app.post('/api/users', (req, res) => {
    const { username, password, role = 'viewer' } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thiếu username hoặc password' });
    if (password.length < 6) return res.status(400).json({ error: 'Password phải có ít nhất 6 ký tự' });
    if (!['admin', 'editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Role không hợp lệ' });
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(400).json({ error: 'Username đã tồn tại' });
    const hash = require('bcrypt').hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role);
    res.json({ id: info.lastInsertRowid });
  });

  app.put('/api/users/:id', (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'Không thể sửa chính mình qua đây' });
    const { username, password, role } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    const updates = [];
    const params = [];
    if (role !== undefined) {
      if (!['admin', 'editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Role không hợp lệ' });
      updates.push('role = ?');
      params.push(role);
    }
    if (username !== undefined && username.trim() && username.trim() !== user.username) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim(), id);
      if (existing) return res.status(400).json({ error: 'Username đã tồn tại' });
      updates.push('username = ?');
      params.push(username.trim());
    }
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password phải có ít nhất 6 ký tự' });
      updates.push('password_hash = ?');
      params.push(require('bcrypt').hashSync(password, 10));
    }
    if (updates.length === 0) return res.json({ ok: true });
    params.push(id);
    db.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  app.delete('/api/users/:id', (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'Không thể xóa chính mình' });
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    db.prepare('DELETE FROM users WHERE id=?').run(id);
    res.json({ ok: true });
  });
};
