// Tat micro + kiem tra nguon hinh/dang ghi am trong OBS
const crypto = require('crypto');
const WS = require('D:/5 caucavancan/CauCaOnline/_internal/app/node_modules/ws');

const PASSWORD = 'VtpHgBLlDjeaZY6n';
const b64 = (s) => crypto.createHash('sha256').update(s).digest('base64');

const ws = new WS('ws://127.0.0.1:4455');
let id = 0;
const pending = new Map();

function call(requestType, requestData = {}) {
  return new Promise((resolve, reject) => {
    const rid = String(++id);
    pending.set(rid, { resolve, reject });
    ws.send(JSON.stringify({ op: 6, d: { requestType, requestId: rid, requestData } }));
    setTimeout(() => { if (pending.has(rid)) { pending.delete(rid); reject(new Error(requestType + ' timeout')); } }, 8000);
  });
}

ws.on('open', () => console.log('[ws] connected'));

ws.on('message', async (raw) => {
  const m = JSON.parse(raw.toString());

  if (m.op === 0) {
    const a = m.d.authentication;
    ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication: a ? b64(b64(PASSWORD + a.salt) + a.challenge) : undefined, eventSubscriptions: 0 } }));
    return;
  }

  if (m.op === 2) {
    console.log('[ws] identified');
    try {
      const list = await call('GetInputList');
      console.log('--- NGUON TRONG OBS ---');
      for (const inp of list.responseData.inputs) {
        console.log(`  ${inp.inputName}  [${inp.inputKind}]`);
      }

      // Tat micro
      try {
        await call('SetInputMute', { inputName: 'Mic/Aux', inputMuted: true });
        const mu = await call('GetInputMute', { inputName: 'Mic/Aux' });
        console.log('Mic/Aux muted =', mu.responseData.inputMuted);
      } catch (e) {
        console.log('Mic/Aux:', e.message);
      }

      // Kiem tra thiet bi camera that co bi dung khong
      const cams = list.responseData.inputs.filter(i => /v4l2|dshow_input|av_capture|video_capture/i.test(i.inputKind));
      console.log('So nguon camera that trong OBS:', cams.length);

      const rec = await call('GetRecordStatus');
      console.log('Dang ghi hinh:', rec.responseData.outputActive);
      const str = await call('GetStreamStatus');
      console.log('Dang stream   :', str.responseData.outputActive);
      console.log('DONE');
    } catch (e) {
      console.error('ERR', e.message);
    } finally {
      setTimeout(() => { ws.close(); process.exit(0); }, 500);
    }
    return;
  }

  if (m.op === 7) {
    const p = pending.get(m.d.requestId);
    if (!p) return;
    pending.delete(m.d.requestId);
    if (m.d.requestStatus && m.d.requestStatus.result === false) p.reject(new Error(m.d.requestStatus.comment || 'failed'));
    else p.resolve(m.d);
  }
});

ws.on('error', (e) => { console.error('WS ERROR', e.message); process.exit(1); });
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 20000);
