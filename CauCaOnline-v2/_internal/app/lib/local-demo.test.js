const test = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');

test('hồ thử có nhân vật riêng và nhận lệnh mà không nối TikTok', { timeout: 15000 }, async t => {
  const app = path.join(__dirname, '..');
  const child = fork(path.join(app, 'server.js'), ['--demo'], {
    cwd: app, silent: true, env: { ...process.env, PORT: '0' }
  });
  t.after(() => { if (child.connected) child.disconnect(); });
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
  const state = () => fetch(`${root}/api/state`).then(res => res.json());
  const rpc = (method, params = {}) => fetch(`${root}/rpc`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  }).then(res => res.json());

  const initial = await state();
  assert.equal(initial.demo.playerId, initial.seatedAnglers[0].uniqueId);
  assert.equal(initial.totalCatches, 0);
  assert.equal(initial.tiktok.connected, false);
  assert((await rpc('live.connect', { username: 'local_test' })).error);
  assert((await rpc('demo.chat', { uniqueId: initial.demo.playerId, text: 'chat cay' })).result.accepted);
  assert.equal((await rpc('demo.guests')).result.demo.actors.length, 3);
  assert.equal((await rpc('demo.map', { id: 'lotus' })).result.scenery, 'lotus');
  assert.equal((await state()).pondScene.scenery, 'lotus');
  const catchResult = await rpc('fishing.hookFish', { user: 'Bạn', uniqueId: initial.demo.playerId, tierOverride: 1, readTts: false });
  assert.equal(catchResult.result.event.fish.mapId, 'lotus');
  assert((await rpc('demo.map', { id: 'unknown' })).error);
  const reset = (await rpc('demo.reset')).result;
  assert.equal(reset.demo.actors.length, 1);
  assert.equal(reset.pondActions.active, null);
  assert.equal(reset.pondActions.waiting, 0);
  assert.equal(reset.pondScene.scenery, 'still');
});
