const axios = require('axios');
const https = require('https');

module.exports = function register(app, db) {

  // ---- Helpers ----

  function getSvgConfig() {
    const row = db.prepare('SELECT * FROM svg_config WHERE id=1').get();
    return row || {};
  }

  async function loginThingsboard(host, username, password) {
    const res = await axios.post(`${host}/api/auth/login`, { username, password }, { timeout: 10000 });
    if (res.status !== 200) throw new Error(`Đăng nhập ThingsBoard thất bại (HTTP ${res.status})`);
    return res.data.token;
  }

  function getPublicResourceKey(svgUrl) {
    const parts = svgUrl.split('/').filter(Boolean);
    return parts[parts.length - 1];
  }

  async function findImageResource(token, svgUrl, tbHost) {
    const publicKey = getPublicResourceKey(svgUrl);
    const res = await axios.get(`${tbHost}/api/images?pageSize=100&page=0`, {
      headers: { 'X-Authorization': `Bearer ${token}` },
      timeout: 10000,
    });
    const items = res.data?.data || [];
    const match = items.find(item => JSON.stringify(item).includes(publicKey));
    if (!match) throw new Error('Không tìm thấy ảnh trong ThingsBoard Image Gallery');
    if (!match.link) throw new Error('Ảnh không có field link');
    const linkParts = match.link.split('/').filter(Boolean);
    const type = linkParts[2];
    const resourceKey = linkParts.slice(3).join('/');
    if (!resourceKey || !type) throw new Error('Không xác định được type/resourceKey');
    return { type, resourceKey };
  }

  function buildMultipartBody(fileBuffer, fileName, mimeType) {
    const boundary = '----NodeFormBoundary' + Math.random().toString(16).slice(2);
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf-8'
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    return { boundary, buffer: Buffer.concat([head, fileBuffer, tail]) };
  }

  // ---- API Endpoints ----

  // GET config (password masked)
  app.get('/api/svg-editor/config', (req, res) => {
    const cfg = getSvgConfig();
    res.json({
      thingsboard_host: cfg.thingsboard_host || '',
      thingsboard_username: cfg.thingsboard_username || '',
      thingsboard_password: cfg.thingsboard_password ? '***' : '',
      svg_url: cfg.svg_url || '',
    });
  });

  // Save/update config
  app.put('/api/svg-editor/config', (req, res) => {
    const { thingsboard_host, thingsboard_username, thingsboard_password, svg_url } = req.body;
    const cfg = getSvgConfig();
    const host = thingsboard_host || cfg.thingsboard_host;
    const user = thingsboard_username || cfg.thingsboard_username;
    const pass = thingsboard_password !== undefined && thingsboard_password !== '***' ? thingsboard_password : cfg.thingsboard_password;
    const url = svg_url || cfg.svg_url;

    db.prepare(`UPDATE svg_config SET thingsboard_host=?, thingsboard_username=?, thingsboard_password=?, svg_url=? WHERE id=1`)
      .run(host, user, pass, url);
    res.json({ ok: true });
  });

  // Get SVG content from DB
  app.get('/api/svg-editor/svg', (req, res) => {
    const cfg = getSvgConfig();
    res.json({ svgContent: cfg.svg_local_content || '' });
  });

  // Save SVG content to DB
  app.post('/api/svg-editor/save-local', (req, res) => {
    const { svgContent } = req.body;
    if (!svgContent) return res.status(400).json({ error: 'Thiếu svgContent' });
    db.prepare('UPDATE svg_config SET svg_local_content=? WHERE id=1').run(svgContent);
    res.json({ ok: true });
  });

  // List all images from ThingsBoard Image Gallery
  app.get('/api/svg-editor/images', async (req, res) => {
    try {
      const cfg = getSvgConfig();
      if (!cfg.thingsboard_host || !cfg.thingsboard_username || !cfg.thingsboard_password) {
        return res.status(400).json({ error: 'Chưa cấu hình ThingsBoard (host/username/password)' });
      }
      const token = await loginThingsboard(cfg.thingsboard_host, cfg.thingsboard_username, cfg.thingsboard_password);
      let allItems = [];
      let page = 0;
      let totalPages = 1;
      while (page < totalPages) {
        const listRes = await axios.get(`${cfg.thingsboard_host}/api/images?pageSize=100&page=${page}`, {
          headers: { 'X-Authorization': `Bearer ${token}` },
          timeout: 15000,
        });
        const items = listRes.data?.data || [];
        allItems = allItems.concat(items);
        totalPages = listRes.data?.totalPages || 1;
        page++;
        if (items.length === 0) break;
      }
      res.json({ images: allItems });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download SVG from ThingsBoard
  app.post('/api/svg-editor/sync-from-tb', async (req, res) => {
    try {
      const cfg = getSvgConfig();
      if (!cfg.thingsboard_host || !cfg.thingsboard_username || !cfg.thingsboard_password || !cfg.svg_url) {
        return res.status(400).json({ error: 'Chưa cấu hình ThingsBoard (host/username/password/svg_url)' });
      }
      const token = await loginThingsboard(cfg.thingsboard_host, cfg.thingsboard_username, cfg.thingsboard_password);
      const svgRes = await axios.get(`${cfg.thingsboard_host}${cfg.svg_url}`, {
        headers: { 'X-Authorization': `Bearer ${token}` },
        timeout: 15000,
        responseType: 'text',
      });
      if (svgRes.status !== 200) throw new Error(`Tải SVG thất bại (HTTP ${svgRes.status})`);
      db.prepare('UPDATE svg_config SET svg_local_content=? WHERE id=1').run(svgRes.data);
      res.json({ ok: true, message: 'Tải SVG từ ThingsBoard thành công' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload SVG to ThingsBoard
  app.post('/api/svg-editor/sync-to-tb', async (req, res) => {
    try {
      const cfg = getSvgConfig();
      if (!cfg.thingsboard_host || !cfg.thingsboard_username || !cfg.thingsboard_password || !cfg.svg_url) {
        return res.status(400).json({ error: 'Chưa cấu hình ThingsBoard' });
      }
      if (!cfg.svg_local_content) {
        return res.status(400).json({ error: 'Chưa có nội dung SVG để upload' });
      }
      const token = await loginThingsboard(cfg.thingsboard_host, cfg.thingsboard_username, cfg.thingsboard_password);
      const { type, resourceKey } = await findImageResource(token, cfg.svg_url, cfg.thingsboard_host);
      const { boundary, buffer } = buildMultipartBody(Buffer.from(cfg.svg_local_content, 'utf-8'), 'downloaded.svg', 'image/svg+xml');

      await axios.put(`${cfg.thingsboard_host}/api/images/${type}/${encodeURIComponent(resourceKey)}`, buffer, {
        headers: {
          'X-Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        timeout: 15000,
      });
      res.json({ ok: true, message: 'Đồng bộ SVG lên ThingsBoard thành công' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};
