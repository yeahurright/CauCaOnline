const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

function edgePath() {
  const choices = [
    process.env.CAUCA_ROSTER_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean);
  return choices.find(file => fs.existsSync(file)) || '';
}

async function ensureLoginBrowser(profileDir) {
  fs.mkdirSync(profileDir, { recursive: true });
  const activePort = path.join(profileDir, 'DevToolsActivePort');
  if (fs.existsSync(activePort)) {
    try {
      const port = Number((await fs.promises.readFile(activePort, 'utf8')).split(/\r?\n/)[0]);
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch (_) {}
    try { await fs.promises.unlink(activePort); } catch (_) {}
  }
  const browser = edgePath();
  if (!browser) throw new Error('Không tìm thấy Edge/Chrome để đăng nhập roster');
  const child = spawn(browser, [
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'https://www.tiktok.com/'
  ], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
}

function cdpRequest(ws, id, method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); ws.off('message', onMessage); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('CDP timeout')); }, 5000);
    const onMessage = raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch (_) { return; }
      if (message.id !== id) return;
      cleanup();
      if (message.error) reject(new Error(message.error.message || 'CDP error'));
      else resolve(message.result || {});
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }), error => {
      if (error) { cleanup(); reject(error); }
    });
  });
}

async function readTikTokSession(profileDir) {
  const activePort = path.join(profileDir, 'DevToolsActivePort');
  if (!fs.existsSync(activePort)) throw new Error('TikTok login window is starting');
  const port = Number((await fs.promises.readFile(activePort, 'utf8')).split(/\r?\n/)[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local browser port');
  const versionResponse = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(4000) });
  if (!versionResponse.ok) throw new Error('TikTok login window is not ready');
  const version = await versionResponse.json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
    setTimeout(() => reject(new Error('Local browser connection timeout')), 5000).unref();
  });
  try {
    let id = 0;
    const targets = await cdpRequest(ws, ++id, 'Target.getTargets');
    let page = (targets.targetInfos || []).find(target => target.type === 'page' && /tiktok\.com/i.test(target.url || ''));
    if (!page) {
      const created = await cdpRequest(ws, ++id, 'Target.createTarget', { url: 'https://www.tiktok.com/' });
      page = { targetId: created.targetId };
    }
    const attached = await cdpRequest(ws, ++id, 'Target.attachToTarget', { targetId: page.targetId, flatten: true });
    await cdpRequest(ws, ++id, 'Network.enable', {}, attached.sessionId);
    const result = await cdpRequest(ws, ++id, 'Network.getAllCookies', {}, attached.sessionId);
    const cookies = (result.cookies || []).filter(cookie => /(^|\.)tiktok\.com$/i.test(String(cookie.domain || '').replace(/^\./, '')));
    const sessionId = cookies.find(cookie => cookie.name === 'sessionid')?.value;
    if (!sessionId) throw new Error('TikTok login is not complete');
    const sid = cookies.find(cookie => cookie.name === 'sid_tt')?.value;
    return {
      cookie: `sessionid=${sessionId}${sid ? `; sid_tt=${sid}` : ''}`,
      userAgent: version.userAgent || 'Mozilla/5.0'
    };
  } finally {
    ws.close();
  }
}

async function fetchRoomAudience(roomId, anchorId, session) {
  const url = new URL('https://webcast.tiktok.com/webcast/ranklist/online_audience/');
  url.search = new URLSearchParams({
    aid: '1988', app_name: 'tiktok_web', device_platform: 'web_pc',
    app_language: 'vi-VN', browser_language: 'vi-VN', channel: 'tiktok_web',
    room_id: String(roomId), anchor_id: String(anchorId)
  }).toString();
  const response = await fetch(url, {
    headers: { cookie: session.cookie, referer: 'https://www.tiktok.com/', 'user-agent': session.userAgent },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`TikTok audience request returned HTTP ${response.status}`);
  const body = await response.json();
  if (Number(body.status_code) === 20003) throw new Error('TikTok roster login required');
  if (Number(body.status_code) !== 0 || !Array.isArray(body.data?.ranks)) throw new Error('TikTok audience roster unavailable');
  const viewers = body.data.ranks.flatMap(entry => {
    const user = entry?.user;
    if (!user) return [];
    const uniqueId = String(user.display_id || user.unique_id || user.id_str || user.id || '').trim().replace(/^@/, '');
    if (!uniqueId) return [];
    return [{ uniqueId: uniqueId.toLowerCase(), name: String(user.nickname || user.display_id || uniqueId), avatar: user.avatar_thumb?.url_list?.[0] || '' }];
  });
  return { viewers, total: Number(body.data.total) || 0, anonymous: Number(body.data.anonymous) || 0 };
}

module.exports = { ensureLoginBrowser, readTikTokSession, fetchRoomAudience };
