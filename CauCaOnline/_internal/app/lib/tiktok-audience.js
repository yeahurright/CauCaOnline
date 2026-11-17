const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

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
  if (!fs.existsSync(activePort)) throw new Error('TikTok roster login required');
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
    const page = (targets.targetInfos || []).find(target => target.type === 'page' && /tiktok\.com/i.test(target.url || ''));
    if (!page) throw new Error('TikTok roster login required');
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

function parseAudienceRoster(data = {}) {
  const count = value => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  const total = count(data.total);
  const anonymous = count(data.anonymous) ?? 0;
  const ranks = data.ranks ?? data.topViewers;
  const viewers = new Map();
  if (Array.isArray(ranks)) {
    for (const { user } of ranks.filter(Boolean)) {
      if (!user) continue;
      const rawId = String(user.id_str || user.id || user.userId || '');
      const accountId = rawId === '0' ? '' : rawId;
      const handle = String(user.display_id || user.displayId || user.unique_id || user.uniqueId || '').trim().replace(/^@/, '');
      const uniqueId = handle.toLowerCase() || accountId;
      if (!uniqueId) continue;
      viewers.set(accountId || uniqueId, {
        uniqueId, accountId, user: String(user.nickname || handle || uniqueId),
        avatar: user.avatar_thumb?.url_list?.[0] || user.avatarThumb?.urlList?.[0] || user.profilePictureUrl || ''
      });
    }
  }
  return { viewers: [...viewers.values()], anonymous,
    complete: Array.isArray(ranks) && total === viewers.size && anonymous === 0 };
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
  return parseAudienceRoster(body.data);
}

module.exports = { readTikTokSession, fetchRoomAudience, parseAudienceRoster };
