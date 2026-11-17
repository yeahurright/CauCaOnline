// Cau hinh OBS tu dong: them nguon Browser tro vao ho cau (1080x1920)
const path = require('path');
const crypto = require('crypto');
const WS = require('D:/5 caucavancan/CauCaOnline/_internal/app/node_modules/ws');

const HOST = 'ws://127.0.0.1:4455';
const PASSWORD = 'VtpHgBLlDjeaZY6n';
const LAKE_URL = 'http://localhost:3001/?obs=1';
const SOURCE_NAME = 'Ho Ca Cau';

const b64 = (s) => crypto.createHash('sha256').update(s).digest('base64');

const ws = new WS(HOST);
let reqId = 0;
const pending = new Map();

function call(requestType, requestData = {}) {
  return new Promise((resolve, reject) => {
    const id = String(++reqId);
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ op: 6, d: { requestType, requestId: id, requestData } }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`${requestType} timeout`)); }
    }, 8000);
  });
}

ws.on('open', () => console.log('[ws] connected'));

ws.on('message', async (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch (_) { return; }

  if (msg.op === 0) {
    const auth = msg.d.authentication;
    let authentication;
    if (auth) {
      authentication = b64(b64(PASSWORD + auth.salt) + auth.challenge);
    }
    ws.send(JSON.stringify({
      op: 1,
      d: { rpcVersion: 1, authentication, eventSubscriptions: 0 }
    }));
    return;
  }

  if (msg.op === 2) {
    console.log('[ws] identified');
    try {
      // 1. Khung hinh doc 1080x1920
      await call('SetVideoSettings', {
        baseWidth: 1080, baseHeight: 1920,
        outputWidth: 1080, outputHeight: 1920,
        fpsNumerator: 30, fpsDenominator: 1
      });
      console.log('[ok] video 1080x1920 @30fps');

      // 2. Tim scene dang co
      const scenes = await call('GetSceneList');
      const sceneName = scenes.responseData.currentProgramSceneName
        || (scenes.responseData.scenes?.[0]?.sceneName) || 'Scene';
      console.log('[ok] scene:', sceneName);

      // 3. Xoa nguon cu neu da co
      try {
        await call('RemoveInput', { inputName: SOURCE_NAME });
        console.log('[ok] removed old source');
      } catch (_) {}

      // 4. Them nguon Browser
      await call('CreateInput', {
        sceneName,
        inputName: SOURCE_NAME,
        inputKind: 'browser_source',
        inputSettings: {
          url: LAKE_URL,
          width: 1080,
          height: 1920,
          fps_custom: true,
          fps: 30,
          shutdown: false,
          restart_when_active: true
        },
        sceneItemEnabled: true
      });
      console.log('[ok] browser source added:', LAKE_URL);

      // 5. Dat nguon vao dung goc 0,0
      const items = await call('GetSceneItemList', { sceneName });
      const item = (items.responseData.sceneItems || []).find(i => i.sourceName === SOURCE_NAME);
      if (item) {
        await call('SetSceneItemTransform', {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemTransform: {
            positionX: 0, positionY: 0,
            alignment: 5,
            boundsType: 'OBS_BOUNDS_SCALE_INNER',
            boundsAlignment: 5,
            boundsWidth: 1080, boundsHeight: 1920
          }
        });
        console.log('[ok] source positioned 0,0 full frame');
      }

      console.log('DONE');
    } catch (err) {
      console.error('SETUP ERROR:', err.message);
    } finally {
      setTimeout(() => { ws.close(); process.exit(0); }, 800);
    }
    return;
  }

  if (msg.op === 7) {
    const p = pending.get(msg.d.requestId);
    if (!p) return;
    pending.delete(msg.d.requestId);
    if (msg.d.requestStatus && msg.d.requestStatus.result === false) {
      p.reject(new Error(msg.d.requestStatus.comment || 'request failed'));
    } else {
      p.resolve(msg.d);
    }
  }
});

ws.on('error', (err) => { console.error('[ws error]', err.message); process.exit(1); });
setTimeout(() => { console.error('TIMEOUT: khong ket noi duoc OBS'); process.exit(1); }, 20000);
