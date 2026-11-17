const { actions, walkMs, workMs } = require('../public/js/pond-actions-data');

const normalize = text => String(text || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ');
const commands = new Map(Object.entries(actions).map(([type, { label }]) => [normalize(label), type]));

class PondActions {
  constructor(savedTrees, now = Date.now) {
    this.now = now;
    this.cutTrees = new Set(actions.chop.targets.map(target => target.id).filter(id => Array.isArray(savedTrees) && savedTrees.includes(id)));
    this.effects = new Map();
    this.clearQueue();
  }

  enqueue(type, person) {
    if (!person.uniqueId || this.pending.length >= 30 || this.isAway(person.uniqueId) ||
        this.pending.some(job => job.uniqueId === person.uniqueId)) return false;
    if (type !== 'feed') {
      const free = this.available(type).filter(target => target.id !== this.active?.target).length;
      if (free <= this.pending.filter(job => job.type === type).length) return false;
    }
    this.pending.push({ type, uniqueId: person.uniqueId, user: person.user });
    return true;
  }

  available(type) {
    return actions[type].targets.filter(({ id }) => !this.cutTrees.has(id) && !this.effects.has(id));
  }

  isAway(id) { return this.active?.uniqueId === id; }

  clearQueue() {
    this.pending = [];
    this.active = null;
  }

  update(isPresent) {
    const now = this.now();
    let changed = false;
    let cut = false;
    for (const [id, expiresAt] of this.effects) {
      if (expiresAt > now) continue;
      this.effects.delete(id);
      changed = true;
    }
    const job = this.active;
    if (job && !job.applied && now >= job.hitAt) {
      job.applied = true;
      if (job.type === 'chop') {
        this.cutTrees.add(job.target);
        cut = true;
      }
      if (job.type === 'water' || job.type === 'clean') this.effects.set(job.target, now + 120_000);
      changed = true;
    }
    if (job && now >= job.endsAt) {
      this.active = null;
      changed = true;
    }
    while (!this.active && this.pending.length) {
      const next = this.pending.shift();
      changed = true;
      const [target] = this.available(next.type);
      if (!target || !isPresent(next.uniqueId)) continue;
      this.active = { ...next, target: target.id, startsAt: now, hitAt: now + walkMs + workMs,
        endsAt: now + walkMs * 2 + workMs, applied: false };
    }
    return { changed, cut };
  }

  snapshot() {
    return { active: this.active, pending: this.pending.slice(0, 3).map(({ user, type }) => ({ user, type })),
      waiting: this.pending.length, cutTrees: [...this.cutTrees], effects: [...this.effects.keys()], serverNow: this.now() };
  }
}

module.exports = { PondActions, parsePondAction: text => commands.get(normalize(text)) };
