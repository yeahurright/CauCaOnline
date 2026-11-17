(() => {
  const CAPACITY = 30;
  const SKINS = 16;
  const keyOf = person => String(person.uniqueId || person.name);
  const { actions, walkMs, workMs } = window.PondActionsData;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  function makeAvatar() {
    const ring = document.createElement('span');
    ring.className = 'pond-avatar';
    ring.setAttribute('aria-hidden', 'true');
    const image = document.createElement('img');
    image.alt = '';
    image.hidden = true;
    const initials = document.createElement('b');
    ring.append(initials, image);
    return { ring, image, initials };
  }

  function showAvatar(avatar, person) {
    avatar.ring.hidden = !person;
    window.CatchRewardVisuals?.setAvatar(avatar.image, avatar.initials, person?.name || '', person?.avatar);
  }

  class FishingPondScene {
    constructor(layer) {
      this.layer = layer;
      this.seats = [];
      this.skins = new Map();
      this.catchCards = new Map();
      this.layout = window.PondMapLayouts.still;
      try {
        const saved = JSON.parse(sessionStorage.getItem('fishing_angler_skins_v3') || '{}');
        for (const [key, skin] of Object.entries(saved)) if (Number.isInteger(skin) && skin >= 0 && skin < SKINS) this.skins.set(key, skin);
      } catch (_) {}
      if (!layer) return;
      this.walker = document.createElement('div');
      this.walker.className = 'pond-walker';
      this.walker.hidden = true;
      this.walker.innerHTML = '<div class="walker-body"><div class="walker-legs"></div><div class="walker-portrait"></div><span class="walker-tool" aria-hidden="true"></span></div><div class="walker-label"><strong></strong></div>';
      this.portrait = this.walker.querySelector('.walker-portrait');
      this.tool = this.walker.querySelector('.walker-tool');
      const walkerLabel = this.walker.querySelector('.walker-label');
      this.walkerAvatar = makeAvatar();
      walkerLabel.prepend(this.walkerAvatar.ring);
      this.walkerLabel = walkerLabel.querySelector('strong');
      this.actionPanel = document.getElementById('pondActionsPanel');
      this.actionStatus = document.getElementById('pondActionStatus');
      this.specialCommands = document.getElementById('pondSpecialCommands');
      layer.append(this.walker);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 1080 1920');
      svg.setAttribute('class', 'pond-lines');
      svg.setAttribute('aria-hidden', 'true');
      layer.appendChild(svg);
      const layout = this.layout.seats;
      layout.forEach(spot => {
        const size = spot.champion ? 210 : 100;
        const seat = document.createElement('div');
        seat.className = `pond-seat ${spot.facesLeft ? 'right' : 'left'} ${spot.champion ? 'is-champion' : ''} is-empty`;
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
        const avatar = makeAvatar();
        const details = document.createElement('div');
        details.className = 'pond-seat-details';
        const name = document.createElement('strong');
        const weight = document.createElement('span');
        const botIcon = document.createElement('span');
        botIcon.className = 'pond-bot-icon';
        botIcon.textContent = '🤖';
        botIcon.setAttribute('aria-label', 'Người câu giả lập');
        const baitIcon = document.createElement('span');
        baitIcon.className = 'pond-bait-icon';
        baitIcon.textContent = '🪱';
        baitIcon.title = 'Mồi đang sẵn sàng';
        baitIcon.hidden = true;
        const ruby = document.createElement('span');
        ruby.className = 'pond-ruby-bonus';
        ruby.hidden = true;
        ruby.title = 'Lượt còn hưởng lộc Hồng Ngọc';
        details.append(name, weight);
        badge.append(avatar.ring, details, botIcon, baitIcon, ruby);
        const bubble = document.createElement('div');
        bubble.className = 'pond-comment';
        bubble.hidden = true;
        bubble.style.bottom = `${Math.min(size + 8, spot.y - 100)}px`;
        seat.append(stool, sprite, crown, badge, bubble);
        const rod = document.createElementNS(svg.namespaceURI, 'path');
        rod.setAttribute('class', `pond-rod ${spot.champion ? 'champion-line' : ''}`);
        const line = document.createElementNS(svg.namespaceURI, 'path');
        line.setAttribute('class', `pond-fishing-line ${spot.champion ? 'champion-line' : ''}`);
        svg.append(rod, line);
        const float = document.createElement('div');
        float.className = `pond-float ${spot.champion ? 'champion-float' : ''}`;
        float.style.left = `${spot.waterX}px`;
        float.style.top = `${spot.waterY}px`;
        layer.append(seat, float);
        this.seats.push({ ...spot, seat, sprite, crown, stool, avatar, name, weight, botIcon, baitIcon, ruby, bubble, line, rod, float, key: null, timer: null, commentTimer: null });
      });
      this.render([]);
    }

    setMap(layout) {
      if (layout === this.layout) return;
      this.clearCatchCards();
      this.layout = layout;
      this.seats.forEach((spot, index) => {
        this.stopTackle(spot);
        spot.float.classList.remove('is-landing');
        Object.assign(spot, layout.seats[index]);
        spot.seat.style.left = `${spot.x}px`;
        spot.seat.style.top = `${spot.y}px`;
        spot.seat.classList.toggle('right', spot.facesLeft);
        spot.seat.classList.toggle('left', !spot.facesLeft);
        spot.float.style.left = `${spot.waterX}px`;
        spot.float.style.top = `${spot.waterY}px`;
      });
      const special = Object.values(actions).filter(action => action.map === layout.map.id);
      this.specialCommands.textContent = special.map(action => action.label.toLowerCase()).join(' · ');
      this.specialCommands.hidden = !special.length;
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

    assignLegacySeats(entries, byKey) {
      const serverLayout = entries.some(person => Number.isInteger(person.seatIndex));
      const champion = serverLayout ? entries.find(person => person.rank === 1) || entries.find(person => person.seatIndex === 0) : entries[0];
      const championKey = champion ? keyOf(champion) : null;
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
    }

    render(board = [], serverSeats = this.serverSeats) {
      const previousKeys = new Set(this.board?.map(keyOf));
      this.board = board;
      this.serverSeats = serverSeats;
      const entries = [...board].sort((a, b) => a.rank - b.rank).slice(0, CAPACITY);
      const byKey = new Map(entries.map(person => [keyOf(person), person]));
      if (serverSeats) {
        this.seats.forEach(spot => { spot.key = null; });
        for (const person of entries) {
          const spot = this.seats[person.seatIndex];
          if (spot) spot.key = keyOf(person);
        }
      } else {
        this.assignLegacySeats(entries, byKey);
      }
      let newCasts = 0;
      const podiumKeys = serverSeats ? entries.filter(person => !person.isSimulated).slice(0, 3).map(keyOf) : null;
      const nearbySeats = this.layout.seatOrder.slice(1, 3);
      this.seats.forEach((spot, index) => {
        const person = byKey.get(spot.key);
        const seatNumber = serverSeats ? spot.seatNumber : this.layout.map.seatNumbers?.[index] ?? index + 1;
        if (spot.seat.dataset.userId !== (spot.key || '')) {
          this.stopTackle(spot);
          clearTimeout(spot.timer);
          spot.seat.classList.remove('is-active');
          spot.float.classList.remove('is-active', 'is-landing');
          clearTimeout(spot.commentTimer);
          spot.bubble.hidden = true;
          spot.seat.classList.remove('has-comment');
        }
        spot.person = person || null;
        const rank = podiumKeys ? podiumKeys.indexOf(spot.key) + 1 : person?.rank;
        const podium = Boolean(person && !spot.champion && [2,3].includes(rank));
        const standardSize = spot.champion ? 210 : podium && rank === 2 ? 145 : podium ? 135 : 100;
        const size = Math.round(standardSize * .74);
        spot.size = size;
        const gold = Boolean(person && spot.champion);
        spot.crown.hidden = !podium && !gold;
        spot.crown.classList.toggle('is-gold', gold);
        spot.crown.style.color = gold ? '#ffd43b' : rank === 2 ? '#dce7f3' : '#ce9458';
        spot.crown.style.bottom = `${Math.min(size - 12, spot.y - 40)}px`;
        spot.crown.setAttribute('aria-label', gold ? 'Vương miện vàng — Top 1' : rank === 2 ? 'Vương miện bạc — Top 2' : 'Vương miện đồng — Top 3');
        spot.seat.style.setProperty('--sprite-size', `${size}px`);
        spot.bubble.style.bottom = `${Math.min(size + 8, spot.y - 100)}px`;
        if (!spot.tackleFrame) this.drawTackle(spot);
        spot.seat.classList.toggle('is-empty', !person);
        spot.seat.classList.toggle('is-demo-self', Boolean(this.demoPlayerId && spot.key === this.demoPlayerId));
        spot.seat.classList.toggle('is-simulated', Boolean(person?.isSimulated));
        spot.botIcon.hidden = !person?.isSimulated;
        spot.baitIcon.hidden = !person?.bait;
        spot.baitIcon.textContent = person?.bait === 'bran' ? '🌾' : person?.bait === 'squid' ? '🦑' : '🪱';
        spot.ruby.hidden = !person?.rubyCatches;
        spot.ruby.textContent = '◆'.repeat(person?.rubyCatches || 0);
        spot.float.classList.toggle('has-prism-bonus', Boolean(person?.prismCatch));
        spot.seat.dataset.userId = spot.key || '';
        spot.seat.dataset.seat = String(seatNumber);
        spot.seat.classList.toggle('is-near-king', Boolean(serverSeats && nearbySeats.includes(index)));
        showAvatar(spot.avatar, person);
        this.updateSeatPresence(spot);
        if (person) {
          const skin = this.skinFor(spot.key);
          spot.sprite.style.backgroundPosition = `${skin % 4 * 100 / 3}% ${Math.floor(skin / 4) * 100 / 3}%`;
          spot.sprite.dataset.skin = String(skin);
          if (!previousKeys.has(spot.key) && spot.key !== this.away && newCasts < 4) {
            this.moveTackle(spot, 720);
            newCasts++;
          }
        }
        spot.name.textContent = person ? (spot.champion ? `👑 ${person.name}` : person.name)
          : spot.champion ? (serverSeats ? '👑 GHẾ 1' : '👑 GHẾ TOP 1') : `${seatNumber}`;
        spot.weight.textContent = person ? `${person.totalWeightKg || 0} kg${spot.champion && !person.isSimulated ? ' · VUA HỒ CÂU' : serverSeats ? ` · Ghế ${seatNumber}` : ''}` : (spot.champion ? 'Cần thủ dẫn đầu ngồi tại đây' : '');
        spot.seat.title = person ? `${person.name} · TOP ${person.rank} · ${person.totalWeightKg || 0} kg` : `Ghế ${seatNumber} đang trống`;
        spot.seat.setAttribute('aria-label', spot.seat.title);
      });
      for (const [key, entry] of this.catchCards) {
        const spot = this.seats.find(seat => seat.key === key && seat.person);
        if (!spot) { clearTimeout(entry.timer); entry.card.remove(); this.catchCards.delete(key); }
      }
      this.layoutCatchCards();
      this.focusBite(this.focusedKey);
    }

    clearCatchCards() {
      for (const entry of this.catchCards.values()) { clearTimeout(entry.timer); entry.card.remove(); }
      this.catchCards.clear();
    }

    placeCatchCard(card, spot) {
      // Giữ thẻ trong khung hồ và trên đầu nhân vật ở cả bốn bản đồ.
      card.style.left = `${Math.max(112, Math.min(968, spot.x))}px`;
      card.style.top = `${Math.max(130, spot.y - spot.size - 20)}px`;
    }

    layoutCatchCards() {
      const placed = [];
      for (const [key, { card }] of this.catchCards) {
        const spot = this.seats.find(seat => seat.key === key && seat.person);
        if (!spot) continue;
        this.placeCatchCard(card, spot);
        const x = parseFloat(card.style.left);
        let bottom = parseFloat(card.style.top);
        const height = card.offsetHeight;
        for (let tries = 0; tries < placed.length; tries++) {
          const overlap = placed.find(other => Math.abs(x - other.x) < 222 && bottom > other.top - 8 && bottom - height < other.bottom + 8);
          if (!overlap || overlap.top - 8 - height < 16) break;
          bottom = overlap.top - 8;
        }
        card.style.top = `${bottom}px`;
        placed.push({ x, bottom, top: bottom - height });
      }
    }

    showCatch(event) {
      const key = String(event.uniqueId || '');
      const spot = this.seats.find(seat => seat.key === key && seat.person);
      if (!spot || !event.fish) return false;
      const previous = this.catchCards.get(key);
      if (previous) { clearTimeout(previous.timer); previous.card.remove(); }
      const card = document.createElement('aside');
      card.className = 'pond-mini-catch';
      card.dataset.userId = key;
      card.setAttribute('role', 'status');
      const art = document.createElement('span');
      art.className = 'mini-catch-art';
      window.CatchRewardVisuals?.renderMini(art, event.fish);
      const details = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = event.fish.name;
      const weight = document.createElement('b');
      const missed = event.type === 'rodBreak' || event.type === 'catchMiss';
      weight.textContent = missed ? 'Hụt cá' : `${Number(event.weightKg).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg`;
      card.classList.toggle('is-missed', missed);
      const effect = document.createElement('small');
      effect.textContent = missed ? (event.type === 'rodBreak' ? 'Gãy cần' : 'Cá tuột mất rồi') : (event.fish.anomalyEffect || event.fish.mutation)?.name || 'Vừa câu được';
      details.append(name, weight, effect);
      card.append(art, details);
      this.placeCatchCard(card, spot);
      this.layer.append(card);
      const entry = { card, timer: setTimeout(() => { card.remove(); this.catchCards.delete(key); this.layoutCatchCards(); }, 6000) };
      this.catchCards.set(key, entry);
      this.layoutCatchCards();
      if (!missed) this.reel({ uniqueId: key, durationMs: 900, weightKg: event.weightKg });
      return true;
    }

    updateSeatPresence(spot) {
      const away = Boolean(spot.key && spot.key === this.away);
      spot.seat.classList.toggle('is-away', away);
      const fishing = Boolean(spot.person && !away);
      if (!fishing && spot.tackleFrame) this.stopTackle(spot);
      spot.float.hidden = !fishing;
      spot.line.style.display = spot.rod.style.display = fishing ? '' : 'none';
    }

    updateActions(world, live) {
      this.world = world;
      this.live = live;
      this.actionPanel.hidden = !live;
      const { pending, waiting, cutTrees, treeCount = 8 } = world;
      const active = this.layout.targets.has(world.active?.target) ? world.active : null;
      const action = active && actions[active.type];
      const parts = [];
      if (action) parts.push(`${active.user} · ${active.applied ? 'Đang về ghế' : action.label}`);
      if (waiting) parts.push(`Chờ ${waiting} · ${pending.map(job => job.user).join(', ')}`);
      if (!parts.length) parts.push(cutTrees.length === treeCount ? 'Đã hết cây có thể chặt' : 'Hàng chờ trống');
      this.actionStatus.textContent = parts.join(' | ');
      this.actionTimeOffset = world.serverNow - performance.now();
      if (active) {
        const person = this.seats.find(spot => spot.key === active.uniqueId)?.person;
        showAvatar(this.walkerAvatar, person || { name: active.user });
      }
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

    drawTackle(spot, lean = 0, x = spot.waterX, y = spot.waterY, broken = false) {
      const side = spot.facesLeft ? -1 : 1;
      const size = spot.size;
      const handX = spot.x + side * size * (.16 - lean * .07);
      const handY = spot.y - size * (.38 + lean * .09);
      const dx = spot.waterX - handX, dy = spot.waterY - handY;
      const length = Math.hypot(dx, dy) || 1;
      const tipX = handX + size * (.65 * dx / length - lean * .38 * side);
      const tipY = handY + size * (.65 * dy / length - lean * .57);
      const midX = (handX + tipX) / 2, midY = (handY + tipY) / 2;
      spot.sprite.style.transform = lean ? `translateY(${-5 * lean}px) rotate(${-20 * lean}deg)` : '';
      spot.rod.setAttribute('d', broken
        ? `M ${handX} ${handY} L ${midX} ${midY - 10} M ${midX + side * 9} ${midY + 10} L ${tipX + side * 16} ${tipY + 21}`
        : `M ${handX} ${handY} Q ${midX} ${midY - 18 * lean} ${tipX} ${tipY}`);
      spot.line.setAttribute('d', broken ? '' : `M ${tipX} ${tipY} Q ${x} ${tipY + Math.max(0, lean) * 16} ${x} ${y}`);
      spot.float.style.left = `${x}px`;
      spot.float.style.top = `${y}px`;
    }

    stopTackle(spot) {
      if (!spot.tackleFrame) return;
      cancelAnimationFrame(spot.tackleFrame);
      spot.tackleFrame = null;
      spot.seat.classList.remove('is-reeling');
      spot.float.classList.remove('is-moving');
      this.drawTackle(spot);
    }

    moveTackle(spot, duration, catchEvent = null, splash) {
      if (motion.matches) return;
      this.stopTackle(spot);
      spot.seat.classList.toggle('is-reeling', Boolean(catchEvent));
      spot.float.classList.remove('is-landing');
      spot.float.classList.add('is-moving');
      const start = performance.now();
      let splashed = false;
      const frame = now => {
        const progress = Math.min(1, (now - start) / duration);
        if (progress >= 1) {
          this.stopTackle(spot);
          if (!catchEvent) spot.float.classList.add('is-landing');
          return;
        }
        if (catchEvent) {
          const pull = Math.sin(Math.PI * Math.max(0, (progress - .18) / .82));
          const dip = progress < .26 ? Math.sin(Math.PI * progress / .26) * 12 : -pull * 6;
          this.drawTackle(spot, pull * (catchEvent.weightKg > 10 ? 1.45 : .85),
            spot.waterX, spot.waterY + dip, catchEvent.rodBroken && progress > .54);
          if (!splashed && progress > .47) {
            splashed = true;
            splash?.(spot.waterX, spot.waterY);
          }
        } else {
          const fly = Math.max(0, (progress - .28) / .72);
          const x = spot.x + (spot.waterX - spot.x) * fly;
          const y = spot.y + (spot.waterY - spot.y) * fly - spot.size * .5 * (1 - fly) - Math.sin(Math.PI * fly) * 66;
          this.drawTackle(spot, Math.sin(2 * Math.PI * progress), x, y);
        }
        spot.tackleFrame = requestAnimationFrame(frame);
      };
      spot.tackleFrame = requestAnimationFrame(frame);
    }

    reel(event, splash) {
      const spot = this.seats.find(seat => seat.key === event.uniqueId);
      if (spot?.person && spot.key !== this.away) this.moveTackle(spot, event.durationMs, event, splash);
    }

    focusBite(uniqueId) {
      this.focusedKey = uniqueId;
      const stage = this.layer.closest('.stage-9x16');
      const spot = this.seats.find(seat => seat.key === uniqueId && seat.person);
      this.seats.forEach(seat => {
        seat.seat.classList.toggle('has-bite', seat === spot);
        seat.float.classList.toggle('has-bite', seat === spot);
      });
      stage.classList.toggle('is-biting', Boolean(spot));
      const scale = spot ? 2 : 1;
      const x = spot ? (spot.x + spot.waterX) / 2 : 540;
      const y = spot ? (spot.y - spot.size / 2 + spot.waterY) / 2 : 960;
      stage.style.setProperty('--bite-scale', scale);
      stage.style.setProperty('--bite-x', `${Math.max(1080 * (1 - scale), Math.min(0, 540 - x * scale))}px`);
      stage.style.setProperty('--bite-y', `${Math.max(1920 * (1 - scale), Math.min(0, 1080 - y * scale))}px`);
    }

    playEvent(event) {
      const key = String(event.uniqueId || event.user || '');
      const spot = this.seats.find(seat => seat.key === key || (!event.uniqueId && seat.person?.name === event.user));
      if (!spot) return { x: 540, y: 900 };
      if (event.type === 'castRod') {
        if (spot.key !== this.away) this.moveTackle(spot, 720);
        return { x: spot.waterX, y: spot.waterY };
      }
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
