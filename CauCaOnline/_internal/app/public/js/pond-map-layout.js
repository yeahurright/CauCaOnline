(() => {
  const isNode = typeof module === 'object' && module.exports;
  const maps = isNode ? require('./pond-maps') : window.PondMaps;
  const { actions } = isNode ? require('./pond-actions-data') : window.PondActionsData;
  const drawPaths = typeof Path2D === 'function';
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  function pathThrough(points, closed = false) {
    if (!drawPaths) return null;
    const path = new Path2D();
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const middle = mix(points[i], points[i + 1], .5);
      path.quadraticCurveTo(points[i].x, points[i].y, middle.x, middle.y);
    }
    path.lineTo(points.at(-1).x, points.at(-1).y);
    if (closed) path.closePath();
    return path;
  }

  function measure(points) {
    let length = 0;
    const nodes = points.map((point, i) => {
      if (i) length += Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y);
      return { ...point, length };
    });
    return {
      length,
      at(distance) {
        if (distance <= 0) return nodes[0];
        const i = nodes.findIndex(node => node.length >= distance);
        if (i < 1) return nodes.at(-1);
        return mix(nodes[i - 1], nodes[i], (distance - nodes[i - 1].length) / (nodes[i].length - nodes[i - 1].length));
      },
      nearest(point) {
        let best = Infinity;
        let distance = 0;
        for (let i = 1; i < nodes.length; i++) {
          const a = nodes[i - 1], b = nodes[i];
          const dx = b.x - a.x, dy = b.y - a.y;
          const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
          const delta = Math.hypot(a.x + dx * t - point.x, a.y + dy * t - point.y);
          if (delta < best) { best = delta; distance = a.length + (b.length - a.length) * t; }
        }
        return distance;
      }
    };
  }

  function makeLayout(map) {
    const [width, height] = map.imageSize || [941, 1672];
    const pointAt = (x, y) => ({ x: x * 1080 / width, y: y * 1920 / height });
    const rows = map.shore.map(([y, left, right]) => [pointAt(0, y).y, pointAt(left, 0).x, pointAt(right, 0).x]);
    const top = rows[0][0], bottom = rows.at(-1)[0];
    function bounds(y) {
      const i = rows.findIndex(row => row[0] >= y);
      if (i < 1) return i === 0 ? rows[0] : rows.at(-1);
      const [ay, al, ar] = rows[i - 1], [by, bl, br] = rows[i];
      const t = (y - ay) / (by - ay);
      return [y, al + (bl - al) * t, ar + (br - ar) * t];
    }
    const waterPoint = (fraction, y) => {
      y = clamp(y, top + 48, bottom - 50);
      const [, l, r] = bounds(y);
      const inset = Math.min(26, (r - l) * .25);
      return { x: l + inset + (r - l - 2 * inset) * fraction, y };
    };
    const bankPoint = (left, y) => {
      const row = bounds(y);
      return { x: clamp(row[left ? 1 : 2] + (left ? -23 : 23), 14, 1066), y };
    };
    const lowRows = rows.filter(([y]) => y > 420 && y < bottom - 15);
    const leftBank = lowRows.map(([y]) => bankPoint(true, y));
    const rightBank = lowRows.map(([y]) => bankPoint(false, y));
    const cap = { x: rows.at(-1)[1], y: bottom + 25 };
    const walkPoints = map.walk ? map.walk.map(([x, y]) => pointAt(x, y)) : [...leftBank, cap, ...[...rightBank].reverse()];
    const walkway = measure(walkPoints);
    const waterEdge = side => rows.map(([y, l, r]) => {
      const inset = Math.min(23, (r - l) * .33);
      return { x: side === 1 ? l + inset : r - inset, y };
    });
    const water = pathThrough([...waterEdge(1), ...waterEdge(2).reverse()], true);

    const seats = map.seats.map(([x, y, wx, wy], index) => {
      const float = pointAt(wx, wy);
      const originalNumber = map.seatNumbers?.[index] ?? index + 1;
      const seatNumber = index === 0 ? 1 : originalNumber === 1 ? map.seatNumbers[0] : originalNumber;
      return { ...pointAt(x, y), waterX: float.x, waterY: float.y, champion: index === 0, facesLeft: wx < x, seatNumber };
    });
    const king = seats[0];
    const distance = index => Math.hypot(seats[index].x - king.x, seats[index].y - king.y);
    const byDistance = seats.map((_, index) => index).slice(1).sort((a, b) => distance(a) - distance(b));
    const left = byDistance.filter(index => seats[index].x < king.x);
    const right = byDistance.filter(index => seats[index].x >= king.x);
    const seatOrder = [0];
    while (left.length || right.length) {
      if (left.length) seatOrder.push(left.shift());
      if (right.length) seatOrder.push(right.shift());
    }

    const targets = new Map();
    for (const [type, action] of Object.entries(actions)) {
      if (action.map && action.map !== map.id) continue;
      for (const target of action.targets) {
        const custom = map.actionPositions?.[target.id];
        if (custom) {
          const [x, y, ax, ay, wx, wy] = custom;
          const actor = pointAt(ax, ay), water = pointAt(wx, wy);
          targets.set(target.id, { ...target, ...pointAt(x, y), actorX: actor.x, actorY: actor.y, waterX: water.x, waterY: water.y });
          continue;
        }
        const left = target.x < 540;
        const y = clamp(target.y, 478, bottom - 90);
        const actor = bankPoint(left, y);
        const zone = waterPoint(type === 'feed' ? .5 : left ? .12 : .88, y);
        const point = type === 'feed' || type === 'clean' ? zone
          : { x: clamp(actor.x + (left ? -24 : 24), 14, 1066), y };
        targets.set(target.id, { ...target, ...point, actorX: actor.x, actorY: actor.y, waterX: zone.x, waterY: zone.y });
      }
    }
    return { map, water, waterPoint, top, bottom, seats, seatOrder, targets, route(from, to) {
      const start = walkway.nearest(from), end = walkway.nearest(to);
      return progress => {
        if (progress < .12) return mix(from, walkway.at(start), progress / .12);
        if (progress > .88) return mix(walkway.at(end), to, (progress - .88) / .12);
        return walkway.at(start + (end - start) * (progress - .12) / .76);
      };
    } };
  }

  const layouts = Object.fromEntries(maps.map(map => [map.id, makeLayout(map)]));
  if (isNode) module.exports = layouts;
  else window.PondMapLayouts = layouts;
})();
