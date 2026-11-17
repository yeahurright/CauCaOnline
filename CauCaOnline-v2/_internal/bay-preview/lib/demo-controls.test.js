const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { setTimeout: sleep } = require('node:timers/promises');
const { WebSocket } = require('ws');

test('menu hồ thử thêm người, chọn cá theo khu và tạo đúng kết quả', { timeout: 15000 }, async t => {
  const app = path.join(__dirname, '..');
  const temp = await mkdtemp(path.join(tmpdir(), 'cauca-demo-controls-'));
  const child = fork(path.join(app, 'server.js'), ['--demo'], {
    cwd: app, silent: true, env: { ...process.env, PORT: '0', TEMP: temp, TMP: temp, TMPDIR: temp, CAUCA_PREVIEW_MAP: '' }
  });
  t.after(async () => {
    if (child.connected) {
      const exited = once(child, 'exit');
      child.disconnect();
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
  const json = resource => fetch(root + resource).then(res => res.json());
  const rpc = (method, params = {}) => fetch(`${root}/rpc`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  }).then(res => res.json());

  assert.equal((await rpc('demo.autoRounds', { enabled: false })).result.demo.autoRounds, false);
  await rpc('fishing.setSettings', { ttsEnabled: false });
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => socket.terminate());
  const events = [];
  socket.on('message', data => events.push(JSON.parse(data)));
  await once(socket, 'open');

  assert.equal((await rpc('demo.guests')).result.demo.actors.length, 3);
  assert.equal((await rpc('demo.guests')).result.demo.actors.length, 3);
  const crowded = (await rpc('demo.guests', { count: 57 })).result;
  assert.equal(crowded.demo.actors.length, crowded.demo.capacity);
  assert.equal(crowded.seating.occupied, 30);
  assert.equal(crowded.seating.waiting, 30);
  assert((await rpc('demo.guests', { count: 1 })).error);
  const person = crowded.demo.actors.at(-1);

  assert.equal((await rpc('demo.map', { id: 'bay' })).result.scenery, 'bay');
  const { catalog } = await json('/api/fish-catalog?map=bay');
  assert(catalog.some(fish => fish.id === 'ca_ngu_bien'));
  assert(catalog.some(fish => fish.id === 'rubber_boot'));
  assert(!catalog.some(fish => fish.id === 'bong_cat'));
   const choice = { uniqueId: person.uniqueId, fishId: 'ca_ngu_bien', weightKg: 29.9 };
  assert((await rpc('demo.catch', { ...choice, fishId: 'bong_cat' })).error);
  assert((await rpc('demo.catch', { ...choice, weightKg: 0 })).error);
  assert((await rpc('demo.catch', { ...choice, weightKg: 4.23 })).error);
  assert((await rpc('demo.catch', { ...choice, weightKg: 121 })).error);
  assert((await rpc('demo.catch', { ...choice, uniqueId: 'demo:unknown' })).error);

  const { event, state } = (await rpc('demo.catch', choice)).result;
  assert.equal(event.type, 'hookFish');
  assert.equal(event.zoomResult, false);
  assert.equal(event.fish.id, choice.fishId);
  assert.equal(event.fish.mapId, 'bay');
   assert.equal(event.weightKg, 29.9);
  assert.equal(event.uniqueId, person.uniqueId);
   assert.equal(state.leaderboard[0].totalWeightKg, 29.9);
  const broken = (await rpc('demo.catch', { ...choice, outcome: 'break' })).result;
  assert.equal(broken.event.type, 'rodBreak');
  assert.equal(broken.event.zoomResult, false);
  assert.equal(broken.state.totalCatches, 1);
  const automaticWeight = (await rpc('demo.catch', { uniqueId: person.uniqueId, fishId: 'rubber_boot' })).result.event.fish;
  assert(automaticWeight.weightKg >= automaticWeight.minWeight && automaticWeight.weightKg <= automaticWeight.maxWeight);

  await sleep(3500);
  assert(events.some(message => message.method === 'fishing.event' && message.params.event.id === event.id));
  assert(!events.some(message => ['fishing.round', 'fishing.roundReveal'].includes(message.method)));

  assert.equal((await rpc('demo.anomaly', { id: 'blood-moon' })).result.queued, true);
  const { anomaly } = (await json('/api/state')).pondScene;
  assert.equal(anomaly.id, 'blood-moon');
  assert.equal(anomaly.endsAt - anomaly.startedAt, 30_000);
  assert.deepEqual((await rpc('demo.map', { id: 'lotus' })).result.anomaly, anomaly);
  assert(events.some(message => message.method === 'fishing.pondScene' && message.params.anomaly?.id === anomaly.id));

  const reset = (await rpc('demo.reset')).result;
  assert.equal(reset.demo.actors.length, 1);
  assert.equal(reset.totalCatches, 0);
  assert.equal(reset.pondScene.scenery, 'still');
  assert.equal(reset.demo.autoRounds, false);
});
