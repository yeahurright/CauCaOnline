(() => {
  const actions = {
    chop: { label: 'Chặt cây', icon: '🪓', targets: [
      { id: 'tre-1', x: 175, y: 1520, size: 184 }, { id: 'tre-2', x: 961, y: 1510, size: 169 },
      { id: 'tre-3', x: 70, y: 1087, size: 132 }, { id: 'tre-4', x: 974, y: 665, size: 132 },
      { id: 'tre-5', x: 97, y: 402, size: 152 }, { id: 'tre-6', x: 990, y: 1340, size: 133 },
      { id: 'tre-7', x: 68, y: 718, size: 118 }, { id: 'tre-8', x: 995, y: 980, size: 147 }
    ] },
    clean: { label: 'Nhặt rác', icon: '🧺', targets: [
      { id: 'rac-1', x: 317, y: 1371, actorX: 228, actorY: 1400, sprite: 0 },
      { id: 'rac-2', x: 862, y: 1194, actorX: 918, actorY: 1220, sprite: 1 },
      { id: 'rac-3', x: 195, y: 753, actorX: 98, actorY: 753, sprite: 1 },
      { id: 'rac-4', x: 807, y: 460, actorX: 924, actorY: 448, sprite: 0 }
    ] },
    water: { label: 'Tưới hoa', icon: '💧', targets: [
      { id: 'hoa-1', x: 305, y: 1550 }, { id: 'hoa-2', x: 935, y: 1139 }, { id: 'hoa-3', x: 80, y: 558 }
    ] },
    feed: { label: 'Cho cá ăn', icon: '🥣', targets: [{ id: 'bo-ho', x: 635, y: 1444, actorX: 655, actorY: 1540 }] }
  };
  const data = { actions, walkMs: 2300, workMs: 1250 };
  if (typeof module === 'object' && module.exports) module.exports = data;
  else window.PondActionsData = data;
})();
