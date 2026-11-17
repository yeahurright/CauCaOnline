const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { WebSocket } = require('ws');

test('cá cắn: đúng người mới giật được, hết giờ và đổi hồ không cộng cá', { timeout: 40000 }, async t => {
  const app = path.join(__dirname, '..');
  const temp = await mkdtemp(path.join(tmpdir(), 'cauca-bite-preview-'));
  const child = fork(path.join(app, 'server.js'), ['--demo'], {
    cwd: app, silent: true,
    env: { ...process.env, PORT: '0', TEMP: temp, TMP: temp, TMPDIR: temp, CAUCA_PREVIEW_MAP: '' }
  });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await rm(temp, { recursive: true, force: true });
  });
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Hồ thử thoát (${code})`)));
    let output = '';
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) resolve(match[1]);
    });
  });
  const root = `http://127.0.0.1:${port}`;
  const rpc = (method, params = {}) => fetch(`${root}/rpc`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  }).then(res => res.json());
  const state = () => fetch(`${root}/api/state`).then(res => res.json());
  await rpc('demo.autoRounds', { enabled: false });
  await rpc('fishing.setSettings', { ttsEnabled: false });
  await rpc('demo.guests');
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => socket.terminate());
  await once(socket, 'open');
  const events = [];
  socket.on('message', data => events.push(JSON.parse(data)));
  const nextBite = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Không nhận được thông báo cá cắn'));
    }, 3000);
    function onMessage(data) {
      const message = JSON.parse(data);
      if (message.method !== 'fishing.bite' || message.params.phase !== 'waiting') return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message.params);
    }
    socket.on('message', onMessage);
  });
  const choice = { uniqueId: 'demo:player', fishId: 'bong_cat', weightKg: 70 };
  const chat = uniqueId => rpc('demo.chat', { uniqueId, text: 'GIẬT' });

  assert.equal((await chat(choice.uniqueId)).result.kind, 'boost');
  let waiting = nextBite();
  let result = rpc('demo.catch', choice);
  const bite = await waiting;
  assert.equal(bite.endsAt - bite.startedAt, 20000);
  assert.equal(bite.bigFish, true);
  assert.equal(bite.chancePercent, 0);
  assert.equal((await state()).totalCatches, 0);
  assert.equal((await state()).bite.id, bite.id);
  assert.equal((await chat('demo:mai')).result.accepted, false);
  assert((await rpc('demo.bite', choice)).error);
  assert((await rpc('demo.like', { count: -1 })).error);
  assert((await rpc('demo.like', { count: 1.5 })).error);
  assert.equal((await rpc('demo.like', { count: 1 })).result.weightKg, 70.7);
  assert.equal((await rpc('demo.like', { count: 99 })).result.weightKg, 140);
  assert.equal((await state()).bite.chancePercent, 0);
  assert.equal((await rpc('demo.like', { count: 150 })).result.weightKg, 210);
  assert.equal((await rpc('demo.like', { count: 100 })).result.likeBonusPercent, 200);
  const commands = ['giật', 'kéo', 'lên', 'câu', 'GIAT', 'KEO', 'LEN', 'CAU'];
  for (let i = 0; i < 100; i++) {
    const response = await rpc('demo.chat', { uniqueId: choice.uniqueId, text: commands[i % commands.length] });
    assert.equal(response.result.chancePercent, i + 1);
    if (i === 0 || i === 98) assert.equal((await state()).totalCatches, 0);
  }
  const landed = (await result).result.event;
  assert.equal(landed.type, 'hookFish');
  assert.equal(landed.zoomResult, true);
  assert.equal(landed.weightKg, 210);
  assert.equal((await state()).totalWeightKg, 210);
  assert.equal((await rpc('demo.like', { count: 10 })).result.accepted, false);
  assert.equal((await state()).totalCatches, 1);
  const success = events.find(message => message.method === 'fishing.bite' && message.params.phase === 'hooked');
  assert.match(success.params.resultText, /kéo thành công cá 210 ký/);
  assert.equal(events.filter(message => message.method === 'fishing.bite' && message.params.phase === 'hooked').length, 1);

  // Chờ hết đúng cửa sổ 20 giây để kiểm tra không nhận cá ngoài ý muốn.
  waiting = nextBite();
  result = rpc('demo.catch', choice);
  const next = await waiting;
  assert.equal(next.chancePercent, 0);
  assert.equal(next.likeBonusPercent, 0);
  assert.equal(next.weightKg, 70);
  await rpc('demo.like', { count: 100 });
  assert.equal((await result).result.phase, 'timeout');
  assert.equal((await chat(choice.uniqueId)).result.kind, 'boost');
  assert.equal((await state()).totalCatches, 1);
  assert(events.some(message => message.method === 'fishing.bite' && message.params.phase === 'timeout'));
  const failure = events.find(message => message.method === 'fishing.bite' && message.params.phase === 'timeout');
  assert.match(failure.params.resultText, /kéo hụt cá 140 ký, cá tuột/);
  const missed = events.find(message => message.method === 'fishing.event' && message.params.event.type === 'catchMiss');
  assert.equal(missed.params.event.zoomResult, true);
  assert.equal(missed.params.event.fish.escaped, true);
  assert.equal(missed.params.event.weightKg, 140);
  assert.equal(missed.params.event.rodCostXu, undefined);
  assert.equal((await state()).totalWeightKg, 210);

  waiting = nextBite();
  result = rpc('demo.catch', choice);
  await waiting;
  await rpc('demo.map', { id: 'bay' });
  assert.equal((await result).result.phase, 'cancelled');
  assert.equal((await state()).totalCatches, 1);
  assert.equal((await state()).bite, null);
  assert(events.filter(message => message.method === 'fishing.bite' && message.params.phase === 'cancelled')
    .every(message => message.params.resultText === ''));

  // Đổi hồ và hủy lượt xong vẫn có thể bắt đầu lượt mới.
  waiting = nextBite();
  result = rpc('demo.catch', { ...choice, fishId: 'ca_ngu_bien', weightKg: 42.5 });
  await waiting;
  await rpc('demo.reset');
  assert.equal((await result).result.phase, 'cancelled');
  assert.equal((await state()).totalCatches, 0);
  assert.equal((await state()).bite, null);
});
