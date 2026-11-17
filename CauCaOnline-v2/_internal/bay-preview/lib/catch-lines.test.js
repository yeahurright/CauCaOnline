const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { CATCH_JOKES } = require('./catch-voice-bank');
const { fishEffectsForMap, isNonFishItem } = require('./fish-sale');
const { anomalyEffects } = require('./pond-anomalies');
const { createCatchLines, catchContext, formatCatchText, reserveCatchLine } = require('./catch-lines');
const { CommentFishing } = require('./comment-fishing');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const declarations = {
  catalog: 'FISH_CATALOG', speciesLines: 'FISH_LINES', tiny: 'TINY_FISH_SARCASM', nonFish: 'NONFISH_TEASE_LINES',
  fun: 'FUN_FISH_LINES', medium: 'CATCH_CONGRATS', adam: 'ADAM_BUA_LINES', mega: 'MEGA_FISH_LINES',
  rod: 'ROD_BREAK_LINES', effects: 'ROUND_EFFECT_LINES', aphorisms: 'APHORISMS',
  flavors: 'CATCH_FLAVORS', sales: 'CATCH_SALE_LINES'
};
const collections = Object.fromEntries(Object.entries(declarations).map(([key, name]) => {
  const start = source.indexOf(`const ${name} = `);
  assert.notEqual(start, -1, name);
  const stop = source.indexOf(['speciesLines', 'effects'].includes(key) ? '\n};' : '\n];', start);
  return [key, vm.runInNewContext(source.slice(start, stop + 3) + `\n${name}`)];
}));
const pool = createCatchLines({ ...collections, jokes: CATCH_JOKES });

test('each current and recovered line rotates into a context the game can produce', () => {
  const heard = new Set();
  for (const base of collections.catalog) {
    const item = isNonFishItem(base);
    const effects = item ? [null] : [null, ...(base.ocean ? fishEffectsForMap('bay')
      : ['still', 'spring', 'lotus'].flatMap(fishEffectsForMap))];
    const outcomes = effects.map(mutation => ({ mutation }));
    if (!item) outcomes.push({ rodBroken: true }, { escaped: true }, ...anomalyEffects.map(anomalyEffect => ({ anomalyEffect })));
    for (const weightKg of new Set([base.minWeight, (base.minWeight + base.maxWeight) / 2, base.maxWeight])) {
      for (const outcome of outcomes) {
        const context = catchContext('Minh Anh', { ...base, ...outcome, weightKg });
        const eligible = pool.filter(line => line.allows(context));
        assert.ok(eligible.length, `${base.name} ${weightKg} ${context.effect?.id || ''}`);
        if (!context.item && !context.healthy) assert.ok(eligible.every(line => !line.id.startsWith('old-dishes:')));
        if (eligible.every(line => heard.has(line.id))) continue;
        const played = {};
        const pending = new Map();
        for (let i = 0; i < eligible.length; i++) {
          const line = reserveCatchLine(pool, context, played, pending);
          assert.equal(played[line.id], undefined, line.id);
          const text = formatCatchText(context, line.text, 100);
          assert.ok(text.includes(context.fish.name) && text.includes(context.name), line.id);
          assert.doesNotMatch(text, /undefined/);
          line.finish(true);
          heard.add(line.id);
        }
      }
    }
  }
  const aphorisms = pool.filter(line => line.id.startsWith('pond:'));
  const spokenAphorisms = {};
  const pendingAphorisms = new Map();
  for (let i = 0; i < aphorisms.length; i++) {
    const line = reserveCatchLine(aphorisms, { aphorism: true }, spokenAphorisms, pendingAphorisms);
    assert.equal(spokenAphorisms[line.id], undefined);
    line.finish(true);
    heard.add(line.id);
  }
  assert.deepEqual(pool.filter(line => !heard.has(line.id)).map(line => line.id), []);
  assert.equal(heard.size, pool.length);
  console.log(`${heard.size}/${pool.length} narration entries selected`);
});

test('cancelled audio can be chosen again and a queued line cannot repeat concurrently', () => {
  const context = catchContext('Minh Anh', { ...collections.catalog[0], weightKg: .5 });
  const played = {};
  const pending = new Map();
  const first = reserveCatchLine(pool, context, played, pending);
  const second = reserveCatchLine(pool, context, played, pending);
  assert.notEqual(first.id, second.id);
  first.finish(false);
  assert.equal(reserveCatchLine(pool, context, played, pending).id, first.id);
  second.finish(true);
  second.finish(true);
  assert.equal(played[second.id], 1);
});

test('cá tuột chỉ được trêu, không chúc mừng hay thu tiền thay cần', () => {
  const context = catchContext('Minh Anh', { ...collections.catalog[0], weightKg: 90, escaped: true });
  const eligible = pool.filter(line => line.allows(context));
  assert.equal(eligible.length, 3);
  for (const line of eligible) {
    const text = formatCatchText(context, line.render(context), 100);
    assert.match(text, /câu hụt.*90 ký/);
    assert.doesNotMatch(text, /Chúc mừng|Gãy cần|xèng/);
  }
});

test('tên ngoài kho giữ nguyên âm tiết để giọng Việt đọc, không đánh vần', () => {
  const { nameParts } = require('./catch-voice-bank');
  assert.deepEqual(nameParts('ThanhPhong_Johnny'.replace(/_/g, ' '), {}), ['thanh', 'phong', 'johnny']);
  assert.deepEqual(nameParts('Nguyễn Phương', {}), ['nguyễn', 'phương']);
});

test('the draw gives viewers missed in the previous round first chance from 6 to 10', () => {
  for (let viewers = 6; viewers <= 10; viewers++) {
    const pool = new CommentFishing({ random: () => 0 });
    const ids = Array.from({ length: viewers }, (_, i) => `viewer-${i}`);
    for (const id of ids) {
      pool.comment({ uniqueId: id });
      pool.welcome(id);
    }
    const waiting = new Set(ids.slice(5));
    const previouslyCalled = new Set(ids.slice(0, 5));
    assert.ok(waiting.has(pool.round(previouslyCalled, waiting).uniqueId));
  }
});
