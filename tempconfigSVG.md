const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// --- CẤU HÌNH ---
const CONFIG = {
  HOST: "https://iot.ctn-cantho.com.vn",
  USERNAME: "admin@canthowassco.vn",
  PASSWORD: "Z]yPpa'%@er;YZ[M",
  SVG_URL: "/api/images/public/RpWUmDMoMh4l3NzbAzH7zkdU2vgDN57P",
  PORT: 3000,
};

const SVG_LOCAL_PATH = path.join(__dirname, "downloaded.svg");

// Helper: Request HTTPS
function httpRequest(urlStr, options = {}, bodyData = null) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(urlStr);
      const reqOpts = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || "GET",
        headers: options.headers || {},
      };

      const req = https.request(reqOpts, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf-8") })
        );
      });

      req.on("error", (err) => reject(err));
      if (bodyData) req.write(bodyData);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Helper: Đăng nhập, trả về JWT token
async function loginThingsboard() {
  const loginRes = await httpRequest(
    `${CONFIG.HOST}/api/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({
      username: CONFIG.USERNAME,
      password: CONFIG.PASSWORD,
    })
  );

  if (loginRes.status !== 200) {
    throw new Error(`Đăng nhập thất bại (HTTP ${loginRes.status})`);
  }
  return JSON.parse(loginRes.body).token;
}

// Helper: Lấy key public từ SVG_URL
function getPublicResourceKey() {
  const parts = CONFIG.SVG_URL.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

// Helper: Dò tìm resource thật (type + key) tương ứng với ảnh public
async function findImageResource(token) {
  const publicKey = getPublicResourceKey();

  const listRes = await httpRequest(`${CONFIG.HOST}/api/images?pageSize=100&page=0`, {
    method: "GET",
    headers: { "X-Authorization": `Bearer ${token}` },
  });

  if (listRes.status !== 200) {
    throw new Error(`Không lấy được danh sách ảnh (HTTP ${listRes.status})`);
  }

  const data = JSON.parse(listRes.body);
  const items = data.data || [];

  const match = items.find((item) => JSON.stringify(item).includes(publicKey));

  if (!match) {
    throw new Error("Không tìm thấy ảnh tương ứng trong danh sách /api/images.");
  }

  if (!match.link) {
    throw new Error("Ảnh không có field 'link', không xác định được type/key để cập nhật.");
  }

  const linkParts = match.link.split("/").filter(Boolean);
  const type = linkParts[2];
  const resourceKey = linkParts.slice(3).join("/");

  if (!resourceKey || !type) {
    throw new Error("Không xác định được resourceKey/type của ảnh từ field 'link'.");
  }

  return { type, resourceKey };
}

// Helper: Build multipart/form-data body thủ công
function buildMultipartBody(fileBuffer, fileName, mimeType) {
  const boundary = "----NodeFormBoundary" + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    "utf-8"
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");
  const buffer = Buffer.concat([head, fileBuffer, tail]);
  return { boundary, buffer };
}

// Đẩy nội dung SVG đã sửa ngược lại ThingsBoard Image Gallery
async function pushSvgToThingsboard(svgContent) {
  const token = await loginThingsboard();
  const { type, resourceKey } = await findImageResource(token);

  const { boundary, buffer } = buildMultipartBody(
    Buffer.from(svgContent, "utf-8"),
    "downloaded.svg",
    "image/svg+xml"
  );

  const updateRes = await httpRequest(
    `${CONFIG.HOST}/api/images/${type}/${encodeURIComponent(resourceKey)}`,
    {
      method: "PUT",
      headers: {
        "X-Authorization": `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": buffer.length,
      },
    },
    buffer
  );

  if (updateRes.status !== 200) {
    throw new Error(`Cập nhật ảnh trên Thingsboard thất bại (HTTP ${updateRes.status}): ${updateRes.body}`);
  }

  return true;
}

// Đồng bộ SVG từ Thingsboard lúc khởi động
async function syncSvgFromThingsboard() {
  try {
    console.log("🔑 Đang đăng nhập Thingsboard...");
    const token = await loginThingsboard();
    console.log("✅ Lấy Token thành công! Đang tải SVG...");

    const svgRes = await httpRequest(`${CONFIG.HOST}${CONFIG.SVG_URL}`, {
      method: "GET",
      headers: { "X-Authorization": `Bearer ${token}` },
    });

    if (svgRes.status !== 200) throw new Error(`Tải SVG thất bại (HTTP ${svgRes.status})`);

    fs.writeFileSync(SVG_LOCAL_PATH, svgRes.body, "utf-8");
    console.log("💾 Đã lưu SVG thành công!");
  } catch (err) {
    console.warn("⚠️ Không tải được SVG từ server:", err.message);
    if (!fs.existsSync(SVG_LOCAL_PATH)) {
      const defaultSvg = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <g id="group-pump-01">
          <rect x="20" y="20" width="100" height="100" fill="#007bff" />
          <path id="path-inside" d="M30 30 L90 90" stroke="white" stroke-width="5"/>
        </g>
        <text id="text-label-01" x="20" y="150" font-size="20" fill="black">
          <tspan id="tspan-child">Nội dung TSpan (Bị bỏ qua)</tspan>
        </text>
      </svg>`;
      fs.writeFileSync(SVG_LOCAL_PATH, defaultSvg, "utf-8");
    }
  }
}

// Helper gửi JSON Response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

// --- SERVER HTTP ---
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  // 1. API trả về file SVG local
  if (parsedUrl.pathname === "/api/svg" && req.method === "GET") {
    if (fs.existsSync(SVG_LOCAL_PATH)) {
      res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8" });
      res.end(fs.readFileSync(SVG_LOCAL_PATH, "utf-8"));
    } else {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("File không tồn tại");
    }
    return;
  }

  // 2. API Lưu tạm thời SVG xuống file local
  if (parsedUrl.pathname === "/api/save-local" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { svgContent } = JSON.parse(body || "{}");

        if (!svgContent) {
          return sendJSON(res, 400, { success: false, message: "Dữ liệu SVG không hợp lệ!" });
        }

        fs.writeFileSync(SVG_LOCAL_PATH, svgContent, "utf-8");
        return sendJSON(res, 200, { success: true, message: "Lưu tạm thời thành công!" });
      } catch (err) {
        return sendJSON(res, 500, { success: false, message: err.message });
      }
    });
    return;
  }

  // 3. API Đồng bộ SVG lên ThingsBoard
  if (parsedUrl.pathname === "/api/sync-thingsboard" && req.method === "POST") {
    try {
      if (!fs.existsSync(SVG_LOCAL_PATH)) {
        return sendJSON(res, 400, { success: false, message: "File SVG local chưa tồn tại!" });
      }

      const svgContent = fs.readFileSync(SVG_LOCAL_PATH, "utf-8");
      pushSvgToThingsboard(svgContent)
        .then(() => {
          return sendJSON(res, 200, { success: true, message: "Đồng bộ lên ThingsBoard thành công!" });
        })
        .catch((pushErr) => {
          return sendJSON(res, 500, { success: false, message: pushErr.message });
        });
    } catch (err) {
      return sendJSON(res, 500, { success: false, message: err.message });
    }
    return;
  }

  // 4. Giao diện Frontend Single Page App
  if (parsedUrl.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Thingsboard SVG Editor</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f4f6f9; }
    
    .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .toolbar h2 { margin: 0; }

    #svg-container { border: 2px dashed #999; background: #fff; padding: 15px; display: inline-block; min-width: 300px; min-height: 200px; }
    #svg-container svg { cursor: default; }
    #svg-container svg g[id]:not(#TB_Group),
    #svg-container svg text[id] { cursor: pointer; }

    .svg-highlighted { outline: 3px dashed #ff3b30 !important; filter: drop-shadow(0 0 4px #ff3b30); }

    /* POPUP MODAL */
    .modal { 
      display: none; 
      position: fixed; 
      width: 280px; 
      background: white; 
      border-radius: 8px; 
      box-shadow: 0 4px 20px rgba(0,0,0,0.3); 
      z-index: 1000; 
      transition: top 0.05s ease, left 0.05s ease;
    }
    .modal-content { padding: 15px; }
    .modal-content h3 { margin-top: 0; margin-bottom: 12px; font-size: 16px; color: #333; }
    .form-group { margin-bottom: 10px; }
    .form-group label { display: block; margin-bottom: 4px; font-weight: bold; font-size: 13px; color: #555; }
    .form-group input { width: 92%; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
    
    .btn-group { text-align: right; margin-top: 12px; }
    button { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; transition: all 0.2s; }
    .btn-save { background: #28a745; color: white; }
    .btn-save:hover { background: #218838; }
    .btn-close { background: #6c757d; color: white; margin-right: 5px; }
    .btn-close:hover { background: #5a6268; }
    .btn-sync { background: #007bff; color: white; padding: 10px 20px; font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.15); }
    .btn-sync:hover { background: #0069d9; }

    /* Toast Notification */
    #toast {
      visibility: hidden;
      min-width: 250px;
      background-color: #333;
      color: #fff;
      text-align: center;
      border-radius: 6px;
      padding: 12px 20px;
      position: fixed;
      z-index: 2000;
      right: 20px;
      bottom: 30px;
      font-size: 14px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      opacity: 0;
      transition: opacity 0.3s, bottom 0.3s;
    }
    #toast.show {
      visibility: visible;
      opacity: 1;
      bottom: 40px;
    }
    #toast.error { background-color: #dc3545; }
    #toast.success { background-color: #28a745; }

    /* Loading Overlay */
    #loadingOverlay {
      display: none;
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 3000;
      justify-content: center;
      align-items: center;
      flex-direction: column;
      color: white;
      font-weight: bold;
    }
    .spinner {
      border: 5px solid #f3f3f3;
      border-top: 5px solid #007bff;
      border-radius: 50%;
      width: 45px;
      height: 45px;
      animation: spin 1s linear infinite;
      margin-bottom: 12px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>

  <div class="toolbar">
    <h2>SVG Viewer (Chỉ nhận ID của thẻ &lt;g&gt; và &lt;text&gt;)</h2>
    <button class="btn-sync" onclick="syncToThingsBoard()">☁️ Đồng bộ lên ThingsBoard</button>
  </div>

  <div id="svg-container">Đang tải SVG...</div>

  <!-- POPUP MODAL -->
  <div id="popupModal" class="modal">
    <div class="modal-content">
      <h3>Sửa ID Element</h3>
      <div class="form-group">
        <label>ID Hiện Tại:</label>
        <input type="text" id="oldIdInput" readonly style="background: #e9ecef;">
      </div>
      <div class="form-group">
        <label>ID Mới:</label>
        <input type="text" id="newIdInput">
      </div>
      <div class="btn-group">
        <button class="btn-close" onclick="closeModal()">Hủy</button>
        <button class="btn-save" onclick="saveNewId()">Lưu ID</button>
      </div>
    </div>
  </div>

  <!-- TOAST NOTIFICATION -->
  <div id="toast"></div>

  <!-- LOADING OVERLAY -->
  <div id="loadingOverlay">
    <div class="spinner"></div>
    <div id="loadingText">Đang xử lý...</div>
  </div>

  <script>
    let activeElement = null;
    let lastMousePos = { x: 0, y: 0 };

    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      toast.innerText = message;
      toast.className = 'show ' + type;
      setTimeout(() => {
        toast.className = toast.className.replace('show', '');
      }, 3000);
    }

    function showLoading(text = 'Đang đồng bộ lên ThingsBoard...') {
      document.getElementById('loadingText').innerText = text;
      document.getElementById('loadingOverlay').style.display = 'flex';
    }

    function hideLoading() {
      document.getElementById('loadingOverlay').style.display = 'none';
    }

    function getIdChain(el) {
      const chain = [];
      let node = el.closest('g[id]:not(#TB_Group), text[id]');
      while (node) {
        chain.unshift(node);
        const parent = node.parentElement;
        node = parent && parent.closest('g[id]:not(#TB_Group), text[id]');
      }
      return chain;
    }

    function sameChain(a, b) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }

    let lastClickChain = [];
    let drillIndex = 0;

    function resolveTarget(el) {
      const chain = getIdChain(el);
      if (chain.length === 0) return null;

      if (sameChain(chain, lastClickChain)) {
        drillIndex = (drillIndex + 1) % chain.length;
      } else {
        lastClickChain = chain;
        drillIndex = 0;
      }

      return chain[drillIndex];
    }

    function selectElement(el, event) {
      if (activeElement) {
        activeElement.classList.remove('svg-highlighted');
      }
      el.classList.add('svg-highlighted');
      openModal(el, event);
    }

    async function fetchSVG() {
      lastClickChain = [];
      drillIndex = 0;

      const res = await fetch('/api/svg?t=' + Date.now());
      const text = await res.text();
      const container = document.getElementById('svg-container');
      container.innerHTML = text;

      const svg = container.querySelector('svg');
      if (svg) {
        svg.addEventListener('click', (e) => {
          lastMousePos = { x: e.clientX, y: e.clientY };
          const target = resolveTarget(e.target);

          if (target && target.id) {
            e.stopPropagation();
            selectElement(target, e);
          } else {
            const debugChain = [];
            let node = e.target;
            while (node && node !== svg.parentElement) {
              debugChain.push(node.tagName + (node.id ? '#' + node.id : ''));
              node = node.parentElement;
            }
            console.warn('🔎 [DEBUG] Click không khớp id nào. Chuỗi thẻ cha:', debugChain.join(' > '));
          }
        });
      }
    }

    function openModal(el, event) {
      activeElement = el;
      document.getElementById('oldIdInput').value = el.id;
      document.getElementById('newIdInput').value = el.id;

      const modal = document.getElementById('popupModal');
      modal.style.display = 'block';

      let x = event ? event.clientX : lastMousePos.x;
      let y = event ? event.clientY : lastMousePos.y;

      const modalWidth = modal.offsetWidth || 280;
      const modalHeight = modal.offsetHeight || 220;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      x += 10;
      y += 10;

      if (x + modalWidth > windowWidth) {
        x = windowWidth - modalWidth - 15;
      }

      if (y + modalHeight > windowHeight) {
        y = windowHeight - modalHeight - 15;
      }

      modal.style.left = x + 'px';
      modal.style.top = y + 'px';

      setTimeout(() => {
        const input = document.getElementById('newIdInput');
        input.focus();
        input.select();
      }, 50);
    }

    function closeModal() {
      document.getElementById('popupModal').style.display = 'none';
      if (activeElement) {
        activeElement.classList.remove('svg-highlighted');
      }
      activeElement = null;
    }

    async function saveNewId() {
      const oldId = document.getElementById('oldIdInput').value;
      const newId = document.getElementById('newIdInput').value.trim();

      if (!newId) return showToast('ID mới không được để trống!', 'error');
      
      if (oldId === newId) {
        closeModal();
        return;
      }

      if (activeElement) {
        activeElement.id = newId;
        activeElement.classList.remove('svg-highlighted');
      }

      const container = document.getElementById('svg-container');
      const svgElement = container.querySelector('svg');
      
      if (!svgElement) return showToast('Không tìm thấy SVG!', 'error');

      const highlighted = svgElement.querySelectorAll('.svg-highlighted');
      highlighted.forEach(el => el.classList.remove('svg-highlighted'));

      const updatedSvgContent = svgElement.outerHTML;

      const res = await fetch('/api/save-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ svgContent: updatedSvgContent })
      });

      const result = await res.json();
      if (result.success) {
        showToast('Đã lưu tạm ID mới!', 'success');
        closeModal();
        await fetchSVG(); 
      } else {
        showToast('Lỗi: ' + result.message, 'error');
      }
    }

    async function syncToThingsBoard() {
      showLoading('Đang tải ảnh lên ThingsBoard...');
      try {
        const res = await fetch('/api/sync-thingsboard', { method: 'POST' });
        const result = await res.json();

        if (result.success) {
          showToast(result.message, 'success');
        } else {
          showToast('Đồng bộ thất bại: ' + result.message, 'error');
        }
      } catch (err) {
        showToast('Lỗi kết nối server!', 'error');
      } finally {
        hideLoading();
      }
    }

    fetchSVG();
  </script>
</body>
</html>`);
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// Chạy server
server.listen(CONFIG.PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${CONFIG.PORT}`);
  syncSvgFromThingsboard();
});