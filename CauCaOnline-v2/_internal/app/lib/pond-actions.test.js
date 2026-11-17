const test = require('node:test');
const assert = require('node:assert/strict');
const { PondActions, parsePondAction } = require('./pond-actions');
const { actions, walkMs, workMs } = require('../public/js/pond-actions-data');
const { CommentFishing } = require('./comment-fishing');

test('lệnh dùng một hàng chờ, người đang làm việc tạm rời vòng câu', () => {
  let time = 0;
  const world = new PondActions([], () => time);
  const anglers = new CommentFishing({ canFish: id => !world.isAway(id) });
  const users = ['Mai', 'An', 'Bình', 'Lan'].map(user => ({ user, uniqueId: user }));
  const commands = [' CHAT  CAY ', 'nhặt rác', 'tưới hoa', 'cho cá ăn'];
  for (const [index, person] of users.entries()) {
    anglers.comment(person);
    assert(world.enqueue(parsePondAction(commands[index]), person));
  }
  assert.equal(parsePondAction('nói chuyện chặt cây'), undefined);
  assert.equal(world.enqueue('feed', users[0]), false);
  const expected = ['chop', 'clean', 'water', 'feed'];
  for (const [index, type] of expected.entries()) {
    world.update(() => true);
    assert.equal(world.active.type, type);
    assert.equal(world.active.uniqueId, users[index].uniqueId);
    assert(!anglers.eligible().some(person => person.uniqueId === users[index].uniqueId));
    time += walkMs + workMs;
    const result = world.update(() => true);
    assert.equal(result.cut, type === 'chop');
    if (type === 'clean' || type === 'water') assert(world.effects.has(world.active.target));
    time += walkMs;
  }
  world.update(() => true);
  assert.equal(world.active, null);
  assert.equal(anglers.eligible().length, 4);
  assert.deepEqual([...new PondActions(world.snapshot().cutTrees).cutTrees], ['tre-1']);
});

test('chỉ giữ đủ chỗ cho cây còn lại, bỏ lượt người đã rời', () => {
  let time = 0;
  const world = new PondActions(actions.chop.targets.slice(1).map(target => target.id), () => time);
  assert(world.enqueue('chop', { uniqueId: 'a', user: 'A' }));
  assert(!world.enqueue('chop', { uniqueId: 'b', user: 'B' }));
  world.update(() => false);
  assert.equal(world.active, null);
  assert(world.enqueue('chop', { uniqueId: 'b', user: 'B' }));
  world.update(() => true);
  world.clearQueue();
  time += walkMs + workMs;
  assert.equal(world.update(() => true).cut, false);
});
