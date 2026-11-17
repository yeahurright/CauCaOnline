const MIN_KG = 0.1;
const MAX_KG = 100;
const WINDOW_MS = 120000;

class InteractiveCatches {
  constructor(now = Date.now, random = Math.random) {
    this.now = now;
    this.random = random;
    this.people = new Map();
  }
  clear() { this.people.clear(); }
  sync(ids) {
    const present = new Set(ids);
    for (const id of this.people.keys()) if (!present.has(id)) this.people.delete(id);
    for (const id of present) if (!this.people.has(id)) {
      this.people.set(id, { messages: [], nextAt: this.now() + 4000 + this.random() * 8000 });
    }
  }
  stats(id) {
    const person = this.people.get(id);
    if (person) person.messages = person.messages.filter(at => at > this.now() - WINDOW_MS);
    const count = person?.messages.length || 0;
    const power = Math.min(1, count / 20);
    return { count, power, chance: .35 + .55 * power };
  }
  interact(id) {
    const person = this.people.get(id);
    if (!person) return null;
    // Giữ tối đa 20 lượt trong cửa sổ hai phút.
    person.messages.push(this.now());
    person.messages = person.messages.slice(-20);
    return this.stats(id);
  }
  attempt(id) {
    const person = this.people.get(id);
    if (!person || person.nextAt > this.now()) return null;
    person.nextAt = this.now() + 8000 + this.random() * 6000;
    const stats = this.stats(id);
    if (this.random() >= stats.chance) return null;
    return { ...stats, weightKg: clampWeight(MIN_KG + (MAX_KG - MIN_KG) * this.random() ** (7 - 6 * stats.power)) };
  }
}

function clampWeight(value) {
  return +Math.max(MIN_KG, Math.min(MAX_KG, Number(value) || MIN_KG)).toFixed(1);
}

module.exports = { InteractiveCatches, clampWeight, MIN_KG, MAX_KG };
