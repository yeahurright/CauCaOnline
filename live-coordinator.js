// Dieu phoi giong doc tu dong cho phong live
// Doc nhac nho moi INTERVAL_MS giay, xoay vong cac cau ngan
const http = require('http');
const fs = require('fs');

const INTERVAL_MS = Number(process.env.COORD_INTERVAL_MS || 10000);
const VOICE = process.env.COORD_VOICE || 'Hải Đăng';
const STOP_FILE = 'D:\\5 caucavancan\\STOP-DIEU-PHOI.txt';
const LOG_FILE = 'D:\\5 caucavancan\\coordinator.log';

// POLICY-SAFE: KHÔNG còn câu nào gắn comment/tim/follow/quà với cá hay phần thưởng.
// Chỉ nói về không khí hồ câu + luật chơi, để không bị coi là "kêu gọi tương tác/quà".
const MESSAGES = [
  'Hồ câu đang yên ả, cả nhà thư giãn cùng nhau nha.',
  'Ai đang xem cũng có thể được chọn câu, cứ ngồi chơi thôi nha.',
  'Cá to hay bé là do may mắn từng lượt, cả nhà đừng ngại.',
  'Bảng vàng bên cạnh cập nhật liên tục, ai nặng nhất đứng đầu.',
  'Thỉnh thoảng có cú lừa, con nhỏ nhất lại về đích sau cùng.',
  'Hồ câu tự chạy, cả nhà cứ xem và thư giãn nha.'
];

function log(line) {
  try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`); } catch (_) {}
}

function rpc(method, params) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params });
    const req = http.request({
      host: '127.0.0.1', port: 3001, path: '/rpc', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 40000
    }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', (e) => resolve('ERR ' + e.message));
    req.on('timeout', () => { req.destroy(); resolve('TIMEOUT'); });
    req.write(body);
    req.end();
  });
}

let index = 0;
let busy = false;

async function tick() {
  if (fs.existsSync(STOP_FILE)) {
    log('STOP file detected -> exiting');
    process.exit(0);
  }
  if (busy) { log('skip: previous still running'); return; }
  busy = true;
  const text = MESSAGES[index % MESSAGES.length];
  index++;
  const reply = await rpc('fishing.speak', { text, voice: VOICE });
  let ok = 'unknown';
  try { ok = JSON.parse(reply).result?.ok ? 'ok' : 'fail'; } catch (_) { ok = String(reply).slice(0, 60); }
  log(`${text} -> ${ok}`);
  busy = false;
}

log(`coordinator START interval=${INTERVAL_MS}ms voice=${VOICE}`);
tick();
setInterval(tick, INTERVAL_MS);
