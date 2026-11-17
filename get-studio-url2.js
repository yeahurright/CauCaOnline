// Bat request mang khi bam Download tren trang TikTok LIVE Studio
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const WS = require('D:/5 caucavancan/CauCaOnline/_internal/app/node_modules/ws');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9224;
const URL = 'https://www.tiktok.com/studio/download';
const PROFILE = path.join(os.tmpdir(), 'cdp-tt2-' + Date.now());
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getJson(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { targets = await getJson('/json/list'); if (targets && targets.length) break; } catch (_) {}
    await sleep(500);
  }
  if (!targets || !targets.length) { console.log('NO_CDP'); chrome.kill(); process.exit(1); }

  const page = targets.find(t => t.type === 'page');
  const ws = new WS(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const reqs = [];

  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id; pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
      return;
    }
    if (m.method === 'Network.requestWillBeSent') {
      reqs.push(m.params.request.url);
    }
    if (m.method === 'Page.downloadWillBegin') {
      console.log('DOWNLOAD_WILL_BEGIN:', m.params.url);
    }
  });

  await new Promise(r => ws.on('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  await send('Page.navigate', { url: URL });
  await sleep(10000);

  const before = reqs.length;
  console.log('requests before click:', before);

  const clicked = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const els = Array.from(document.querySelectorAll('a,button,div[role="button"]'));
        let done = '';
        for (const el of els) {
          const t = (el.innerText || el.textContent || '').trim();
          if (/download for windows/i.test(t)) { el.click(); done = t; break; }
        }
        if (!done) {
          for (const el of els) {
            const t = (el.innerText || el.textContent || '').trim();
            if (/^download$/i.test(t)) { el.click(); done = t; break; }
          }
        }
        return done;
      })()
    `, returnByValue: true
  });
  console.log('clicked:', JSON.stringify(clicked.result.value));

  await sleep(9000);

  const after = reqs.slice(before);
  const interesting = after.filter(u =>
    /\.(exe|msi)/i.test(u) || /studio/i.test(u) || /download/i.test(u) || /api\//i.test(u)
  );
  console.log('--- requests after click ---');
  console.log(JSON.stringify(interesting.slice(0, 25), null, 1));

  ws.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
