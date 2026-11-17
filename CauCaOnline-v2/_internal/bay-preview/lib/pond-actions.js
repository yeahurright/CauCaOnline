const { actions, walkMs, workMs } = require('../public/js/pond-actions-data');
const layouts = require('../public/js/pond-map-layout');

const EFFECT_DURATION_MS = 120_000;
const CATCH_BONUS_RADIUS = 250;

const normalize = text => String(text || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/\s+/g, ' ');
const commands = new Map(Object.entries(actions).map(([type, { label }]) => [normalize(label), type]));

class PondActions {
  constructor(savedTrees, now = Date.now) {
    this.now = now;
    this.cutTrees = new Set(actions.chop.targets.map(target => target.id).filter(id => Array.isArray(savedTrees) && savedTrees.includes(id)));
    this.effects = new Map();
    this.clearQueue();
  }

  enqueue(type, person, mapId = 'still') {
    if (!person.uniqueId || this.pending.length >= 30 || this.isAway(person.uniqueId) ||
        this.pending.some(job => job.uniqueId === person.uniqueId)) return false;
    if (actions[type].map && actions[type].map !== mapId) return false;
    if (type !== 'feed') {
      const free = this.available(type, mapId).filter(target => target.id !== this.active?.target).length;
      if (free <= this.pending.filter(job => job.type === type).length) return false;
    }
    this.pending.push({ type, uniqueId: person.uniqueId, user: person.user });
    return true;
  }

  available(type, mapId = 'still') {
    if (actions[type].map && actions[type].map !== mapId) return [];
    return actions[type].targets.filter(({ id }) => !this.cutTrees.has(id) && !this.effects.has(id));
  }

  isAway(id) { return this.active?.uniqueId === id; }

  clearQueue() {
    this.pending = [];
    this.active = null;
    this.catchBonuses = new Map();
  }

  hasCatchBonuses(mapId) {
    const now = this.now();
    return [...this.catchBonuses.values()].some(bonus => bonus.mapId === mapId && bonus.remaining > 0 && bonus.expiresAt > now);
  }

  catchBonusesAt(mapId, seatIndex) {
    const layout = layouts[mapId];
    const seat = layout?.seats[seatIndex];
    if (!seat) return [];
    const now = this.now();
    return [...this.catchBonuses.values()].filter(bonus => {
      if (bonus.mapId !== mapId || bonus.remaining <= 0 || bonus.expiresAt <= now) return false;
      const target = layout.targets.get(bonus.target);
      return target && Math.hypot(seat.waterX - target.waterX, seat.waterY - target.waterY) <= CATCH_BONUS_RADIUS;
    });
  }

  update(isPresent, mapId = 'still') {
    const now = this.now();
    let changed = false;
    let cut = false;
    let completed = false;
    for (const [id, expiresAt] of this.effects) {
      if (expiresAt > now) continue;
      this.effects.delete(id);
      changed = true;
    }
    if (this.active && actions[this.active.type].map && actions[this.active.type].map !== mapId) {
      this.active = null;
      changed = true;
    }
    const job = this.active;
    if (job && !job.applied && now >= job.hitAt) {
      job.applied = true;
      if (job.type === 'chop') {
        this.cutTrees.add(job.target);
        cut = true;
      }
      if (['water', 'clean', 'beacon', 'buoy'].includes(job.type)) this.effects.set(job.target, now + EFFECT_DURATION_MS);
      const key = `${mapId}:${job.type}`;
      const previous = this.catchBonuses.get(key);
      const expiresAt = now + EFFECT_DURATION_MS;
      if (previous?.expiresAt > now && previous.remaining > 0) {
        Object.assign(previous, { target: job.target, expiresAt });
      } else {
        const benefit = actions[job.type].benefit || job.type;
        this.catchBonuses.set(key, { mapId, type: job.type, benefit, target: job.target, remaining: 2, expiresAt });
      }
      completed = true;
      changed = true;
    }
    if (job && now >= job.endsAt) {
      this.active = null;
      changed = true;
    }
    while (!this.active && this.pending.length) {
      const next = this.pending.shift();
      changed = true;
      const [target] = this.available(next.type, mapId);
      if (!target || !isPresent(next.uniqueId)) continue;
      this.active = { ...next, target: target.id, startsAt: now, hitAt: now + walkMs + workMs,
        endsAt: now + walkMs * 2 + workMs, applied: false };
    }
    return { changed, cut, completed };
  }

  snapshot() {
    return { active: this.active, pending: this.pending.slice(0, 3).map(({ user, type }) => ({ user, type })),
      waiting: this.pending.length, cutTrees: [...this.cutTrees], treeCount: actions.chop.targets.length,
      effects: [...this.effects.keys()], serverNow: this.now() };
  }
}

module.exports = { PondActions, parsePondAction: text => commands.get(normalize(text)) };
