const test = require('node:test');
const assert = require('node:assert/strict');
const { fishSaleXu, rollFishMutation, pickFishForMap } = require('./fish-sale');

test('hệ số 0 bán được 0 xu và giá cá cũ vẫn đúng', () => {
  const fish = { id: 'ro_dong', weightKg: 2.5 };
  assert.equal(fishSaleXu(fish), 6);
  assert.equal(fishSaleXu({ ...fish, mutation: { multiplier: 0.1 } }), 1);
  assert.equal(fishSaleXu({ ...fish, mutation: { multiplier: 0 } }), 0);
  assert.equal(fishSaleXu({ ...fish, mutation: { multiplier: null } }), 6);
  assert.equal(fishSaleXu({ id: 'plastic_bottle', weightKg: 0.5 }), null);
});

test('tỉ lệ và hệ số cá đặc trưng tính theo khu câu', () => {
  const fish = { id: 'ro_dong', weightKg: 10 };
  const expected = [
    ['still', 55, 'infected', 15, 0], ['spring', 12, 'pure', 18, 36], ['lotus', 18, 'lotus', 18, 43]
  ];
  for (const [mapId, dead, special, percent, sale] of expected) {
    const rolls = Array.from({ length: 100 }, (_, index) => rollFishMutation(fish, mapId, () => (index + .5) / 100));
    assert.equal(rolls.filter(item => item.mutation?.id === 'dead').length, dead);
    const specialFish = rolls.filter(item => item.mutation?.id === special);
    assert.equal(specialFish.length, percent);
    assert.equal(fishSaleXu(specialFish[0]), sale);
  }
  const trash = { id: 'plastic_bottle', isTrash: true };
  assert.equal(rollFishMutation(trash, 'still', () => .55), trash);
});

test('cá thường gặp có trọng số cao hơn nhưng các loài vẫn có thể xuất hiện ở mọi khu', () => {
  const fish = [{ id: 'ro_dong' }, { id: 'bong_cat' }, { id: 'me_hoa' }];
  assert.equal(pickFishForMap(fish, 'still', () => .39).id, 'ro_dong');
  assert.equal(pickFishForMap(fish, 'spring', () => .39).id, 'bong_cat');
  assert.equal(pickFishForMap(fish, 'lotus', () => .49).id, 'me_hoa');
  assert.equal(pickFishForMap(fish, 'lotus', () => 0).id, 'ro_dong');
});
