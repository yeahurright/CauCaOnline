// Tim link tai TikTok LIVE Studio bang Chrome DevTools Protocol
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const WS = require('D:/5 caucavancan/CauCaOnline/_internal/app/node_modules/ws');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9223;
const URL = 'https://www.tiktok.com/studio/download';
const PROFILE = path.join(require('os').tmpdir(), 'cdp-tt-' + Date.now());

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getJson(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--window-size=1400,1000',
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { targets = await getJson('/json/list'); if (targets && targets.length) break; } catch (_) {}
    await sleep(500);
  }
  if (!targets || !targets.length) { console.log('NO_CDP'); chrome.kill(); process.exit(1); }

  const page = targets.find(t => t.type === 'page');
  const ws = new WS(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
    }
  });

  await new Promise(r => ws.on('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: URL });
  await sleep(9000);

  // Cai hook bat window.open truoc khi click
  await send('Runtime.evaluate', {
    expression: `
      window.__caught = [];
      const o = window.open;
      window.open = function(u){ try{ window.__caught.push(String(u)); }catch(e){} return o ? o.apply(this, arguments) : null; };
      true;
    `
  });

  // Tim va click nut download
  const clicked = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const hits = [];
        const els = Array.from(document.querySelectorAll('a,button,div[role="button"],span[role="button"]'));
        for (const el of els) {
          const t = (el.innerText || el.textContent || '').trim();
          const h = el.getAttribute('href') || '';
          if (/download|tải xuống|下载/i.test(t) || /\\.(exe|msi)/i.test(h)) {
            hits.push({ tag: el.tagName, text: t.slice(0,60), href: h });
          }
        }
        let clickedText = '';
        for (const el of els) {
          const t = (el.innerText || el.textContent || '').trim();
          if (/^download/i.test(t) || /download for windows|tải xuống/i.test(t)) {
            try { el.click(); clickedText = t.slice(0,60); break; } catch(e) {}
          }
        }
        return JSON.stringify({ hits: hits.slice(0,10), clickedText });
      })()
    `,
    returnByValue: true
  });

  await sleep(6000);

  const after = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const urls = new Set();
        (window.__caught || []).forEach(u => urls.add(u));
        document.querySelectorAll('a[href]').forEach(a => {
          const h = a.href || '';
          if (/\\.(exe|msi)(\\?|$)/i.test(h) || /download.*studio|studio.*download/i.test(h)) urls.add(h);
        });
        const html = document.documentElement.outerHTML;
        const m = html.match(/https?:\\/\\/[^"'\\\\s]+\\.(exe|msi)/gi) || [];
        m.forEach(u => urls.add(u));
        return JSON.stringify({ urls: Array.from(urls).slice(0,20), loc: location.href });
      })()
    `,
    returnByValue: true
  });

  console.log('CLICK_RESULT:', clicked.result.value);
  console.log('AFTER:', after.result.value);

  ws.close();
  chrome.kill();
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
