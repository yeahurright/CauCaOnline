const assert = require('node:assert/strict');
const test = require('node:test');
const { InteractiveCatches, clampWeight } = require('./interactive-catches');

test('tương tác tăng cả tỷ lệ trúng và phân bố cân nặng, hết hạn sau hai phút', () => {
  let now = 0;
  const game = new InteractiveCatches(() => now, () => .5);
  game.sync(['quiet', 'active']);
  for (let i = 0; i < 20; i++) game.interact('active');
  assert.equal(game.stats('quiet').chance, .35);
  assert.equal(game.stats('active').chance, .9);
  now = 10000;
  assert.equal(game.attempt('quiet'), null);
  assert.equal(game.attempt('active').weightKg, 50.1);
  now = 120001;
  assert.equal(game.stats('active').count, 0);
  game.sync(['quiet']);
  assert.equal(game.interact('active'), null);
  game.clear();
  assert.equal(game.attempt('quiet'), null);
});

test('cá ngẫu nhiên luôn trong 0,1–100 kg; mức tương tác cao làm cá lớn hơn trên cùng phép bốc', () => {
  let now = 0;
  for (const roll of [0, .1, .25, .5, .75, .999999]) {
    const results = [];
    for (const count of [0, 5, 10, 20]) {
      const draws = [0, 0, 0, roll];
      const game = new InteractiveCatches(() => now, () => draws.shift());
      game.sync(['one']);
      for (let i = 0; i < count; i++) game.interact('one');
      now += 10000;
      const catchResult = game.attempt('one');
      assert(catchResult.weightKg >= .1 && catchResult.weightKg <= 100);
      results.push(catchResult.weightKg);
      assert.equal(game.attempt('one'), null);
    }
    assert.deepEqual([...results].sort((a, b) => a - b), results);
  }
  assert.equal(clampWeight(999), 100);
  assert.equal(clampWeight(-1), .1);
});
