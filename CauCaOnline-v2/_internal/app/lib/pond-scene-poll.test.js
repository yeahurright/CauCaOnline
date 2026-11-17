const test = require('node:test');
const assert = require('node:assert/strict');
const { PondScenePoll } = require('./pond-scene-poll');

test('phiếu thời tiết riêng, chỉ mở phiếu khu trong 30 giây cuối', () => {
  let time = 0;
  const poll = new PondScenePoll({ now: () => time, random: () => 0 });
  assert.equal(poll.handleChat('mưa rồi', 'an'), null);
  assert.equal(poll.handleChat(' MUA ', 'An'), true);
  assert.equal(poll.handleChat('nắng', 'an'), false);
  assert.equal(poll.handleChat('suoi', 'binh'), false);
  assert.equal(poll.handleChat('sương', ''), false);
  assert.deepEqual(poll.snapshot(true).poll.options.map(option => option.count), [0, 1, 0]);
  time = 45_000;
  assert.equal(poll.update(), true);
  assert.equal(poll.snapshot(true).weather, 'rain');
  assert.equal(poll.snapshot(true).poll.kind, 'weather');
  time = 149_999;
  assert.equal(poll.handleChat('suối', 'an'), false);
  assert.equal(poll.snapshot(true).poll, null);
  time = 150_000;
  assert.equal(poll.handleChat('SUỐI TIÊN', 'an'), true);
  assert.equal(poll.snapshot(true).poll.kind, 'scenery');
  assert.equal(poll.snapshot(true).poll.endsAt, 180_000);
  assert.equal(poll.handleChat('Sen', 'an'), false);
  time = 180_000;
  poll.update();
  assert.equal(poll.snapshot(true).scenery, 'spring');
  assert.equal(poll.snapshot(true).mapEndsAt, 360_000);
  assert.equal(poll.handleChat('sen', 'an'), false);
  assert.equal(poll.snapshot(false).poll, null);
});

test('hòa chỉ bốc giữa các khu dẫn đầu, vắng phiếu thì đổi sang khu khác', () => {
  let time = 0;
  const poll = new PondScenePoll({ now: () => time, random: () => .99 });
  time = 150_000;
  poll.handleChat('Hồ tù', 'a');
  poll.handleChat('Suối', 'b');
  time = 180_000;
  poll.update();
  assert.equal(poll.snapshot(true).scenery, 'spring');
  time = 360_000;
  poll.update();
  assert.equal(poll.snapshot(true).scenery, 'lotus');
});

test('ngắt kết nối làm mất phiếu cũ và mở lại đủ thời gian', () => {
  let time = 0;
  const poll = new PondScenePoll({ now: () => time, random: () => 0 });
  poll.handleChat('nắng', 'an');
  time = 5_000;
  poll.reset();
  assert.equal(poll.update(), true);
  assert.equal(poll.update(), false);
  assert.equal(poll.snapshot(true).mapEndsAt, 185_000);
  time = 50_000;
  poll.update();
  assert.equal(poll.snapshot(false).weather, 'rain');
});
