#!/usr/bin/env node
// Import file JSON KEPServerEX trực tiếp vào DB, KHÔNG cần chạy server / mở trình duyệt.
//
// Cách dùng:
//   node import-cli.js /duong/dan/toi/file.json            (mặc định: THAY THẾ toàn bộ DB)
//   node import-cli.js /duong/dan/toi/file.json --merge     (GỘP THÊM, giữ lại dữ liệu cũ)

const fs = require('fs');
const path = require('path');
const { importProject, mergeProject } = require('./kepware-io');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const merge = args.includes('--merge');

if (!file) {
  console.error('Thiếu đường dẫn file. Cách dùng: node import-cli.js <file.json> [--merge]');
  process.exit(1);
}

const fullPath = path.resolve(file);
if (!fs.existsSync(fullPath)) {
  console.error(`Không tìm thấy file: ${fullPath}`);
  process.exit(1);
}

try {
  let raw = fs.readFileSync(fullPath, 'utf-8');
  // Loại bỏ BOM (Byte Order Mark) hay gặp khi file được lưu bằng Notepad/Windows
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const parsed = JSON.parse(raw);

  if (merge) {
    const stats = mergeProject(parsed);
    console.log('Gộp (merge) thành công vào DB (data/kepware.db):');
    console.log(`  Channel mới    : ${stats.channelsNew}`);
    console.log(`  Channel cập nhật: ${stats.channelsUpdated}`);
    console.log(`  Device mới     : ${stats.devicesNew}`);
    console.log(`  Device cập nhật: ${stats.devicesUpdated}`);
    console.log(`  Tags           : ${stats.tags}`);
  } else {
    const stats = importProject(parsed);
    console.log('Import (thay thế toàn bộ) thành công vào DB (data/kepware.db):');
    console.log(`  Channels: ${stats.channels}`);
    console.log(`  Devices : ${stats.devices}`);
    console.log(`  Tags    : ${stats.tags}`);
    console.log('  Lưu ý: mọi channel/device không có trong file này đã bị xoá. Dùng --merge để gộp thêm thay vì thay thế.');
  }
} catch (err) {
  console.error('Import thất bại:', err.message);
  process.exit(1);
}
