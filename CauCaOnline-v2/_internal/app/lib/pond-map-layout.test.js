const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PondMaps = require('../public/js/pond-maps');
const PondActionsData = require('../public/js/pond-actions-data');

test('mỗi khu có đủ ghế và lối đi tới các đích hành động', () => {
  const window = { PondMaps, PondActionsData };
  class Path2D {
    moveTo() {}
    lineTo() {}
    quadraticCurveTo() {}
    ellipse() {}
    closePath() {}
  }
  const script = fs.readFileSync(path.join(__dirname, '../public/js/pond-map-layout.js'), 'utf8');
  vm.runInNewContext(script, { window, Path2D });
  const layouts = Object.values(window.PondMapLayouts);
  assert.equal(new Set(layouts.map(layout => layout.seats[1].x)).size, 3);
  for (const layout of layouts) {
    assert.equal(layout.seats.length, 30);
    assert(layout.seats.every(({ x }) => x >= 54 && x <= 1026));
    for (const target of layout.targets.values()) {
      const route = layout.route(layout.seats[0], { x: target.actorX, y: target.actorY });
      assert.equal(route(0).x, layout.seats[0].x);
      assert(Math.abs(route(1).x - target.actorX) < .001);
      assert(Math.abs(route(1).y - target.actorY) < .001);
      assert([.15, .5, .85].every(time => Number.isFinite(route(time).x)));
    }
  }
});
