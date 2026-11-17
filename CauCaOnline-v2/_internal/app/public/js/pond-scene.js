/* Twenty places: 19 anglers around the bank and a central champion. */
(() => {
  const CAPACITY = 30;
  const SKINS = 16;
  const keyOf = person => String(person.uniqueId || person.name);
  const { actions, walkMs, workMs } = window.PondActionsData;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  class FishingPondScene {
    constructor(layer) {
      this.layer = layer;
      this.seats = [];
      this.skins = new Map();
      this.layout = window.PondMapLayouts.still;
      try {
        const saved = JSON.parse(sessionStorage.getItem('fishing_angler_skins_v3') || '{}');
        for (const [key, skin] of Object.entries(saved)) if (Number.isInteger(skin) && skin >= 0 && skin < SKINS) this.skins.set(key, skin);
      } catch (_) {}
      if (!layer) return;
      this.walker = document.createElement('div');
      this.walker.className = 'pond-walker';
      this.walker.hidden = true;
      this.walker.innerHTML = '<div class="walker-body"><div class="walker-legs"></div><div class="walker-portrait"></div><span class="walker-tool" aria-hidden="true"></span></div><div class="walker-label"></div>';
      this.portrait = this.walker.querySelector('.walker-portrait');
      this.tool = this.walker.querySelector('.walker-tool');
      this.walkerLabel = this.walker.querySelector('.walker-label');
      this.actionPanel = document.getElementById('pondActionsPanel');
      this.actionStatus = document.getElementById('pondActionStatus');
      layer.append(this.walker);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 1080 1920');
      svg.setAttribute('class', 'pond-lines');
      svg.setAttribute('aria-hidden', 'true');
      layer.appendChild(svg);
      const layout = this.layout.seats;
      layout.forEach((spot, index) => {
        const size = spot.champion ? 210 : 100;
        const seat = document.createElement('div');
        seat.className = `pond-seat ${index > 14 ? 'right' : 'left'} ${spot.champion ? 'is-champion' : ''} is-empty`;
        seat.style.left = `${spot.x}px`;
        seat.style.top = `${spot.y}px`;
        seat.style.setProperty('--sprite-size', `${size}px`);
        const stool = document.createElement('span');
        stool.className = 'pond-empty-stool';
        const sprite = document.createElement('div');
        sprite.className = 'pond-angler-sprite';
        sprite.setAttribute('role', 'img');
        sprite.setAttribute('aria-label', 'Người câu ngồi bên bờ hồ');
        const badge = document.createElement('div');
        const crown = document.createElement('span');
        crown.className = 'pond-rank-crown';
        crown.hidden = true;
        crown.innerHTML = '<svg viewBox="0 0 64 44" aria-hidden="true"><path d="M6 12 20 23 32 4 44 23 58 12 52 37H12Z" fill="currentColor" stroke="#fff5cf" stroke-width="2"/><path d="M13 39h38" stroke="currentColor" stroke-width="5"/><circle cx="6" cy="10" r="4" fill="currentColor"/><circle cx="32" cy="4" r="4" fill="currentColor"/><circle cx="58" cy="10" r="4" fill="currentColor"/></svg>';
        badge.className = 'pond-seat-badge';
        const name = document.createElement('strong');
        const weight = document.createElement('span');
        const botIcon = document.createElement('span');
        botIcon.className = 'pond-bot-icon';
        botIcon.textContent = '🤖';
        botIcon.setAttribute('aria-label', 'Người câu giả lập');
        badge.append(botIcon, name, weight);
        const bubble = document.createElement('div');
        bubble.className = 'pond-comment';
        bubble.hidden = true;
        bubble.style.bottom = `${Math.min(size + 8, spot.y - 100)}px`;
        seat.append(stool, sprite, crown, badge, bubble);
        const hand = { x: spot.x + (index > 14 ? -1 : 1) * size * .16, y: spot.y - size * .38 };
        const dx = spot.waterX - hand.x;
        const dy = spot.waterY - hand.y;
        const distance = Math.hypot(dx, dy);
        const tip = { x: hand.x + dx / distance * size * .65, y: hand.y + dy / distance * size * .65 };
        const rod = document.createElementNS(svg.namespaceURI, 'path');
        rod.setAttribute('d', `M ${hand.x} ${hand.y} L ${tip.x} ${tip.y}`);
        rod.setAttribute('class', `pond-rod ${spot.champion ? 'champion-line' : ''}`);
        const line = document.createElementNS(svg.namespaceURI, 'path');
        line.setAttribute('d', `M ${tip.x} ${tip.y} Q ${spot.waterX} ${tip.y} ${spot.waterX} ${spot.waterY}`);
        line.setAttribute('class', `pond-fishing-line ${spot.champion ? 'champion-line' : ''}`);
        svg.append(rod, line);
        const float = document.createElement('div');
        float.className = `pond-float ${spot.champion ? 'champion-float' : ''}`;
        float.style.left = `${spot.waterX}px`;
        float.style.top = `${spot.waterY}px`;
        layer.append(seat, float);
        this.seats.push({ ...spot, seat, sprite, crown, stool, name, weight, botIcon, bubble, line, rod, float, key: null, timer: null, commentTimer: null });
      });
      this.render([]);
    }

    setMap(layout) {
      if (layout === this.layout) return;
      this.layout = layout;
      this.seats.forEach((spot, index) => {
        Object.assign(spot, layout.seats[index]);
        spot.seat.style.left = `${spot.x}px`;
        spot.seat.style.top = `${spot.y}px`;
        spot.seat.classList.toggle('right', index > 14);
        spot.seat.classList.toggle('left', index <= 14);
        spot.float.style.left = `${spot.waterX}px`;
        spot.float.style.top = `${spot.waterY}px`;
      });
      this.render(this.board);
      if (this.job) {
        this.job = null;
        this.updateActions(this.world, this.live);
      }
    }

    skinFor(key) {
      if (!this.skins.has(key)) {
        this.skins.set(key, Math.floor(Math.random() * SKINS));
        try { sessionStorage.setItem('fishing_angler_skins_v3', JSON.stringify(Object.fromEntries(this.skins))); } catch (_) {}
      }
      return this.skins.get(key);
    }

    render(board = []) {
      this.board = board;
      const entries = [...board].sort((a, b) => a.rank - b.rank).slice(0, CAPACITY);
      const byKey = new Map(entries.map(person => [keyOf(person), person]));
      const serverLayout = entries.some(person => Number.isInteger(person.seatIndex));
      const champion = serverLayout ? entries.find(person => person.rank === 1) || entries.find(person => person.seatIndex === 0) : entries[0];
      const championKey = champion ? keyOf(champion) : null;
      // Podium places: champion in front, silver at the left end, bronze at the right end.
      const fixed = new Map([[0, championKey]]);
      for (const [rank, index] of [[2,1],[3,CAPACITY-1]]) {
        const person = entries.find(person => person.rank === rank);
        if (person) fixed.set(index, keyOf(person));
      }
      const retained = new Set([...fixed.values()].filter(Boolean));
      this.seats.forEach((spot, index) => {
        if (fixed.has(index)) { spot.key = fixed.get(index); return; }
        if (spot.key && byKey.has(spot.key) && !retained.has(spot.key)) retained.add(spot.key);
        else spot.key = null;
      });
      entries.forEach(person => {
        const key = keyOf(person);
        if (!retained.has(key)) {
          const preferred = Number.isInteger(person.seatIndex) && person.seatIndex > 0 && !fixed.has(person.seatIndex) ? this.seats[person.seatIndex] : null;
          const spot = preferred && !preferred.key ? preferred : this.seats.find((seat,index) => !fixed.has(index) && !seat.key);
          if (spot) { spot.key = key; retained.add(key); }
        }
      });
      this.seats.forEach((spot, index) => {
        const person = byKey.get(spot.key);
        if (spot.seat.dataset.userId !== (spot.key || '')) {
          clearTimeout(spot.commentTimer);
          spot.bubble.hidden = true;
          spot.seat.classList.remove('has-comment');
        }
        spot.person = person || null;
        const podium = Boolean(person && [2,3].includes(person.rank));
        const size = spot.champion ? 210 : podium && person.rank === 2 ? 145 : podium ? 135 : 100;
        const gold = Boolean(person && spot.champion);
        spot.crown.hidden = !podium && !gold;
        spot.crown.classList.toggle('is-gold', gold);
        spot.crown.style.color = gold ? '#ffd43b' : person?.rank === 2 ? '#dce7f3' : '#ce9458';
        spot.crown.style.bottom = `${Math.min(size - 12, spot.y - 40)}px`;
        spot.crown.setAttribute('aria-label', gold ? 'Vương miện vàng — Top 1' : person?.rank === 2 ? 'Vương miện bạc — Top 2' : 'Vương miện đồng — Top 3');
        spot.seat.style.setProperty('--sprite-size', `${size}px`);
        spot.bubble.style.bottom = `${Math.min(size + 8, spot.y - 100)}px`;
        const hand = { x: spot.x + (index > 14 ? -1 : 1) * size * .16, y: spot.y - size * .38 };
        const dx = spot.waterX - hand.x, dy = spot.waterY - hand.y;
        const distance = Math.hypot(dx, dy);
        const tip = { x: hand.x + dx / distance * size * .65, y: hand.y + dy / distance * size * .65 };
        spot.rod.setAttribute('d', `M ${hand.x} ${hand.y} L ${tip.x} ${tip.y}`);
        spot.line.setAttribute('d', `M ${tip.x} ${tip.y} Q ${spot.waterX} ${tip.y} ${spot.waterX} ${spot.waterY}`);
        spot.seat.classList.toggle('is-empty', !person);
        spot.seat.classList.toggle('is-demo-self', Boolean(this.demoPlayerId && spot.key === this.demoPlayerId));
        spot.seat.classList.toggle('is-simulated', Boolean(person?.isSimulated));
        spot.botIcon.hidden = !person?.isSimulated;
        spot.seat.dataset.userId = spot.key || '';
        spot.seat.dataset.seat = String(index + 1);
        this.updateSeatPresence(spot);
        if (person) {
          const skin = this.skinFor(spot.key);
          spot.sprite.style.backgroundPosition = `${skin % 4 * 100 / 3}% ${Math.floor(skin / 4) * 100 / 3}%`;
          spot.sprite.dataset.skin = String(skin);
        }
        spot.name.textContent = person ? (spot.champion ? `👑 ${person.name}` : person.name) : (spot.champion ? '👑 GHẾ TOP 1' : `${index + 1}`);
        spot.weight.textContent = person ? `${person.totalWeightKg || 0} kg${spot.champion && !person.isSimulated ? ' · VUA HỒ CÂU' : ''}` : (spot.champion ? 'Cần thủ dẫn đầu ngồi tại đây' : '');
        spot.seat.title = person ? `${person.name} · TOP ${person.rank} · ${person.totalWeightKg || 0} kg` : `Ghế ${index + 1} đang trống`;
        spot.seat.setAttribute('aria-label', spot.seat.title);
      });
    }

    updateSeatPresence(spot) {
      const away = Boolean(spot.key && spot.key === this.away);
      spot.seat.classList.toggle('is-away', away);
      const fishing = Boolean(spot.person && !away);
      spot.float.hidden = !fishing;
      spot.line.style.display = spot.rod.style.display = fishing ? '' : 'none';
    }

    updateActions(world, live) {
      this.world = world;
      this.live = live;
      this.actionPanel.hidden = !live;
      const { active, pending, waiting, cutTrees } = world;
      const action = active && actions[active.type];
      const parts = [];
      if (action) parts.push(`${active.user} · ${active.applied ? 'Đang về ghế' : action.label}`);
      if (waiting) parts.push(`Chờ ${waiting} · ${pending.map(job => job.user).join(', ')}`);
      if (!parts.length) parts.push(cutTrees.length === actions.chop.targets.length ? 'Đã hết cây có thể chặt' : 'Hàng chờ trống');
      this.actionStatus.textContent = parts.join(' | ');
      this.actionTimeOffset = world.serverNow - performance.now();
      if (this.job?.startsAt === active?.startsAt) return;
      cancelAnimationFrame(this.walkFrame);
      this.job = active;
      this.away = active?.uniqueId;
      this.seats.forEach(spot => this.updateSeatPresence(spot));
      this.walker.hidden = !active;
      if (!active) return;

      const target = this.layout.targets.get(active.target);
      const to = { x: target.actorX, y: target.actorY };
      const from = this.seats.find(spot => spot.key === active.uniqueId) || { x: 540, y: 1685 };
      const route = this.layout.route(from, to);
      const skin = this.skinFor(active.uniqueId);
      this.portrait.style.backgroundPosition = `${-(skin % 4) * 96}px ${-Math.floor(skin / 4) * 96}px`;
      this.tool.textContent = action.icon;
      this.walkerLabel.textContent = active.user;
      let lastX = from.x;
      const frame = () => {
        const elapsed = Math.max(0, performance.now() + this.actionTimeOffset - active.startsAt);
        if (elapsed >= walkMs * 2 + workMs) {
          this.walker.hidden = true;
          return;
        }
        const working = elapsed >= walkMs && elapsed < walkMs + workMs;
        const returning = elapsed >= walkMs + workMs;
        const point = motion.matches || working ? to : returning
          ? route(1 - (elapsed - walkMs - workMs) / walkMs)
          : route(elapsed / walkMs);
        this.walker.style.transform = `translate(${point.x}px, ${point.y}px)`;
        this.walker.classList.toggle('is-working', working);
        this.walker.classList.toggle('is-walking', !working);
        if (working) this.walker.classList.toggle('faces-left', target.x < to.x);
        else if (Math.abs(point.x - lastX) > .3) this.walker.classList.toggle('faces-left', point.x < lastX);
        lastX = point.x;
        this.walkFrame = requestAnimationFrame(frame);
      };
      frame();
    }

    showComment(event) {
      const key = String(event.uniqueId || event.user || '');
      const spot = this.seats.find(seat => seat.key === key || (!event.uniqueId && seat.person?.name === event.user));
      const text = String(event.comment || '').trim().slice(0, 180);
      if (!spot?.person || !text) return;
      clearTimeout(spot.commentTimer);
      spot.bubble.textContent = text;
      spot.bubble.hidden = false;
      spot.seat.classList.add('has-comment');
      spot.commentTimer = setTimeout(() => {
        spot.bubble.hidden = true;
        spot.seat.classList.remove('has-comment');
      }, 6000);
    }

    playEvent(event) {
      const key = String(event.uniqueId || event.user || '');
      const spot = this.seats.find(seat => seat.key === key || seat.person?.name === event.user);
      if (!spot) return { x: 540, y: 900 };
      clearTimeout(spot.timer);
      spot.seat.classList.add('is-active');
      spot.float.classList.add('is-active');
      spot.timer = setTimeout(() => {
        spot.seat.classList.remove('is-active');
        spot.float.classList.remove('is-active');
      }, 3200);
      return { x: spot.waterX, y: spot.waterY };
    }
  }
  window.FishingPondScene = FishingPondScene;
})();
