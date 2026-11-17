(() => {
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  function pathThrough(points, closed = false) {
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
    // Tọa độ đường mép nước được đo trên ảnh gốc 941 × 1672.
    const rows = map.shore.map(([y, left, right]) => [y * 1920 / 1672, left * 1080 / 941, right * 1080 / 941]);
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
      return { x: clamp(row[left ? 1 : 2] + (left ? -23 : 23), 54, 1026), y };
    };
    const lowRows = rows.filter(([y]) => y > 420 && y < bottom - 15);
    const leftBank = lowRows.map(([y]) => bankPoint(true, y));
    const rightBank = lowRows.map(([y]) => bankPoint(false, y));
    const cap = { x: rows.at(-1)[1], y: bottom + 25 };
    const walkPoints = [...leftBank, cap, ...[...rightBank].reverse()];
    const walkway = measure(walkPoints);
    const bank = pathThrough(walkPoints);
    const bankDetail = new Path2D();
    for (let distance = 31; distance < walkway.length - 30; distance += map.id === 'lotus' ? 41 : 53) {
      const p = walkway.at(distance), next = walkway.at(distance + 5);
      const angle = Math.atan2(next.y - p.y, next.x - p.x);
      const dx = Math.sin(angle), dy = -Math.cos(angle);
      if (map.id === 'still') {
        const side = distance % 2 ? 1 : -1;
        const x = p.x + side * dx * 16, y = p.y + side * dy * 16;
        bankDetail.moveTo(x + Math.cos(angle) * 9, y + Math.sin(angle) * 9);
        bankDetail.ellipse(x, y, 9, 2.8, angle, 0, 6.29);
      } else {
        bankDetail.moveTo(p.x - dx * 21, p.y - dy * 21);
        bankDetail.quadraticCurveTo(p.x + 4, p.y - 5, p.x + dx * 21, p.y + dy * 21);
      }
    }
    const waterEdge = side => rows.map(([y, l, r]) => {
      const inset = Math.min(23, (r - l) * .33);
      return { x: side === 1 ? l + inset : r - inset, y };
    });
    const water = pathThrough([...waterEdge(1), ...waterEdge(2).reverse()], true);

    function seatsOn(points, count, side) {
      const track = measure(points);
      return Array.from({ length: count }, (_, i) => {
        const position = track.at(track.length * (i + .5) / count);
        const float = waterPoint(side ? .15 : .85, position.y);
        return { ...position, waterX: float.x, waterY: float.y, champion: false };
      });
    }
    const frontFloat = waterPoint(.5, bottom - 117);
    const seats = [{ x: 540, y: 1640, waterX: frontFloat.x, waterY: frontFloat.y, champion: true },
      ...seatsOn([...leftBank].reverse(), 14, true), ...seatsOn(rightBank, 15, false)];

    const targets = new Map();
    for (const [type, action] of Object.entries(window.PondActionsData.actions)) {
      for (const target of action.targets) {
        const left = target.x < 540;
        const y = clamp(target.y, 478, bottom - 90);
        const actor = bankPoint(left, y);
        const point = type === 'feed' || type === 'clean' ? waterPoint(left ? .12 : .88, y)
          : { x: clamp(actor.x + (left ? -24 : 24), 42, 1038), y };
        targets.set(target.id, { ...target, ...point, actorX: actor.x, actorY: actor.y });
      }
    }
    return { map, bank, bankDetail, water, waterPoint, top, bottom, seats, targets, route(from, to) {
      const start = walkway.nearest(from), end = walkway.nearest(to);
      return progress => {
        if (progress < .12) return mix(from, walkway.at(start), progress / .12);
        if (progress > .88) return mix(walkway.at(end), to, (progress - .88) / .12);
        return walkway.at(start + (end - start) * (progress - .12) / .76);
      };
    } };
  }

  window.PondMapLayouts = Object.fromEntries(window.PondMaps.map(map => [map.id, makeLayout(map)]));
})();
