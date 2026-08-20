module.exports = function register(app, db) {
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thiếu username hoặc password' });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    if (!require('bcrypt').compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    const token = require('jsonwebtoken').sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET || 'kepware-tag-manager-secret-2026', { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    res.json({ user: req.user });
  });

  app.post('/api/auth/change-password', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Thiếu mật khẩu cũ hoặc mới' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    if (!require('bcrypt').compareSync(oldPassword, user.password_hash)) return res.status(400).json({ error: 'Mật khẩu cũ không đúng' });
    const newHash = require('bcrypt').hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, req.user.id);
    res.json({ ok: true });
  });
};
