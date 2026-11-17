// Tu dong thu ket noi lai TikTok khi bi rate-limit
const http = require('http');
const fs = require('fs');

const LOG = 'D:\\5 caucavancan\\reconnect.log';
const STOP = 'D:\\5 caucavancan\\STOP-RECONNECT.txt';
const INTERVAL = 300000;
const MAX_TRY = 14;

function log(l) { try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${l}\n`); } catch (_) {} }

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
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}

let tries = 0;

async function attempt() {
  if (fs.existsSync(STOP)) { log('STOP -> thoat'); process.exit(0); }
  if (tries >= MAX_TRY) { log('het luot thu -> thoat'); process.exit(0); }
  tries++;

  const st = await rpc('fishing.getState', {});
  if (st && st.result && st.result.tiktok && st.result.tiktok.connected) {
    log('DA KET NOI roi -> thoat');
    process.exit(0);
  }

  const r = await rpc('fishing.connectTikTok', { username: '@eggvn2007' });
  if (r && r.result && r.result.connected) {
    log(`lan ${tries}: KET NOI THANH CONG room=${r.result.roomId}`);
    process.exit(0);
  }
  const err = r && r.error ? String(r.error.message).slice(0, 80) : 'khong ro';
  log(`lan ${tries}: that bai - ${err}`);
}

log('reconnect loop start');
attempt();
setInterval(attempt, INTERVAL);
