const isSimulatedAngler = person => Boolean(person?.isSimulated) || String(person?.uniqueId || '').startsWith('sim:');
const compareAnglers = (a, b) => (b.totalWeightKg || 0) - (a.totalWeightKg || 0) || (b.points || 0) - (a.points || 0);

// Người không tương tác quá lâu thì nhường ghế (coi như đã rời live)
let seatIdleMs = 10 * 60 * 1000;
function setSeatIdleMinutes(minutes) {
  const m = Number(minutes);
  if (Number.isFinite(m) && m > 0) seatIdleMs = Math.max(60000, m * 60000);
}
function lastSeenAt(person) {
  return Math.max(person?.lastSeenAt || 0, person?.lastInteractionAt || 0, person?.lastJoinedAt || 0);
}
function isActivePerson(person, now) {
  const last = lastSeenAt(person);
  if (!last) return false;
  return now - last < seatIdleMs;
}

class PondSeating {
  constructor(anglers, savedKeys, capacity = 30, isPresent = (_, person, now) => isActivePerson(person, now),
    seatOrder = () => this.defaultOrder) {
    this.anglers = anglers;
    this.capacity = capacity;
    this.isPresent = isPresent;
    this.seatOrder = seatOrder;
    this.defaultOrder = Array.from({ length: capacity }, (_, index) => index);
    this.chosenSeats = new Map();
    this.keys = Array(capacity).fill(null);
    this.rotationOffset = 0;
    const candidates = Array.isArray(savedKeys) ? savedKeys : Object.keys(anglers()).sort((a, b) => {
      const left = anglers()[a], right = anglers()[b];
      return Number(isSimulatedAngler(left)) - Number(isSimulatedAngler(right)) || (right.totalWeightKg || 0) - (left.totalWeightKg || 0);
    });
    const seen = new Set();
    candidates.slice(0, capacity).forEach((key, index) => {
      if (key && anglers()[key] && !seen.has(key)) {
        this.keys[index] = key;
        seen.add(key);
      }
    });
    this.rebalance();
  }

  rebalance() {
    const people = this.anglers();
    const now = Date.now();
    const order = this.seatOrder();
    const mapChanged = this.currentOrder && order !== this.currentOrder;
    if (mapChanged) this.chosenSeats.clear();
    this.currentOrder = order;
    const ranked = Object.entries(people).filter(([key, person]) => !isSimulatedAngler(person) && this.isPresent(key, person, now))
      .sort(([, a], [, b]) => compareAnglers(a, b));
    const leaders = ranked.slice(0, Math.min(10, this.capacity));
    const leaderKeys = new Set(leaders.map(([key]) => key));
    const next = Array(this.capacity).fill(null);
    const seated = new Set();
    const activeKeys = new Set(ranked.map(([key]) => key));
    for (const [key, index] of this.chosenSeats) {
      if (!activeKeys.has(key)) this.chosenSeats.delete(key);
      else {
        next[index] = key;
        seated.add(key);
      }
    }
    const king = ranked.find(([key]) => !seated.has(key))?.[0];
    if (king) {
      next[0] = king;
      seated.add(king);
    }
    for (const [key] of leaders) {
      if (seated.has(key)) continue;
      const index = order.find(index => index > 0 && !next[index]);
      if (index === undefined) break;
      next[index] = key;
      seated.add(key);
    }

    // Under capacity, keep every active viewer seated; above capacity, retain
    // current rotating seats until the one-per-minute rotation swaps one out.
    for (const index of order.slice(1)) {
      const key = this.keys[index];
      if (!mapChanged && !next[index] && activeKeys.has(key) && !seated.has(key)) {
        next[index] = key;
        seated.add(key);
      }
    }
    const waiting = ranked.filter(([key]) => !seated.has(key))
      .sort(([, a], [, b]) => (a.lastSeatedAt || 0) - (b.lastSeatedAt || 0)
        || (a.lastJoinedAt || 0) - (b.lastJoinedAt || 0)
        || (a.lastJoinedOrder || 0) - (b.lastJoinedOrder || 0));
    for (const index of order.slice(1)) {
      if (next[index]) continue;
      const entry = waiting.shift();
      if (!entry) break;
      const [key, person] = entry;
      next[index] = key;
      person.lastSeatedAt ||= now;
    }
    for (const index of order.slice(1)) {
      const key = this.keys[index], person = people[key];
      if (!next[index] && person && isSimulatedAngler(person) && !next.includes(key)) next[index] = key;
    }
    this.keys.splice(0, this.capacity, ...next);
    for (const key of this.keys) if (key && people[key]) people[key].lastSeatedAt ||= now;
  }

  rotateOne() {
    this.rebalance();
    const people = this.anglers();
    const now = Date.now();
    const ranked = Object.entries(people).filter(([key, person]) => !isSimulatedAngler(person) && this.isPresent(key, person, now))
      .sort(([, a], [, b]) => compareAnglers(a, b));
    if (ranked.length <= this.capacity) return false;

    const leaderKeys = new Set(ranked.slice(0, Math.min(10, this.capacity)).map(([key]) => key));
    const waiting = ranked.filter(([key]) => !leaderKeys.has(key) && !this.keys.includes(key))
      .sort(([, a], [, b]) => (a.lastSeatedAt || 0) - (b.lastSeatedAt || 0)
        || (a.lastJoinedAt || 0) - (b.lastJoinedAt || 0)
        || (a.lastJoinedOrder || 0) - (b.lastJoinedOrder || 0));
    if (!waiting.length || this.capacity <= leaderKeys.size) return false;

    const order = this.currentOrder.slice(1);
    let index = -1;
    for (let offset = 0; offset < order.length; offset++) {
      const position = (this.rotationOffset + offset) % order.length;
      const candidate = order[position];
      const key = this.keys[candidate];
      const person = people[key];
      if (person && !isSimulatedAngler(person) && !leaderKeys.has(key)) {
        index = candidate;
        this.chosenSeats.delete(key);
        this.rotationOffset = (position + 1) % order.length;
        break;
      }
    }
    if (index < 0) return false;
    const [key, person] = waiting[0];
    this.keys[index] = key;
    person.lastSeatedAt = now;
    return true;
  }

  ensure(key) {
    this.rebalance();
    if (this.keys.includes(key)) return true;
    const person = this.anglers()[key];
    if (!person || !isSimulatedAngler(person)) return false;
    const empty = this.keys.flatMap((value, index) => value ? [] : [index]);
    const index = empty.length ? empty[Math.floor(Math.random() * empty.length)] : -1;
    if (index < 0) {
      const weakest = this.keys.filter(seated => isSimulatedAngler(this.anglers()[seated]))
        .sort((a,b) => compareAnglers(this.anglers()[b], this.anglers()[a]))[0];
      if (!weakest || compareAnglers(person, this.anglers()[weakest]) >= 0) return false;
      this.keys[this.keys.indexOf(weakest)] = key;
      return true;
    }
    this.keys[index] = key;
    return true;
  }

  changeSeat(key, index) {
    this.rebalance();
    if (!Number.isInteger(index) || index <= 0 || index >= this.capacity) return false;
    if (!this.keys.includes(key) || isSimulatedAngler(this.anglers()[key])) return false;
    if (this.keys[index] && this.keys[index] !== key) return false;
    this.chosenSeats.set(key, index);
    this.rebalance();
    return true;
  }

  clear() { this.keys.fill(null); this.chosenSeats.clear(); }

  snapshot(realLeaderboard) {
    this.rebalance();
    const rankByKey = new Map(realLeaderboard.map(person => [person.uniqueId, person.rank]));
    const bots = this.keys.filter(key => isSimulatedAngler(this.anglers()[key]))
      .sort((a,b) => compareAnglers(this.anglers()[a], this.anglers()[b]));
    const botRank = new Map(bots.map((key,index) => [key,realLeaderboard.length + index + 1]));
    const seatedAnglers = this.keys.flatMap((key, seatIndex) => {
      const person = this.anglers()[key];
      if (!person) return [];
      const isSimulated = isSimulatedAngler(person);
      return [{ ...person, seatIndex, isSimulated, rank: isSimulated ? botRank.get(key) : rankByKey.get(person.uniqueId) }];
    });
    const real = seatedAnglers.filter(person => !person.isSimulated).length;
    const now = Date.now();
    const waitingAnglers = Object.entries(this.anglers())
      .filter(([key, person]) => !this.keys.includes(key) && !isSimulatedAngler(person)
        && this.isPresent(key, person, now))
      .sort(([, a], [, b]) => compareAnglers(a, b))
      .map(([key, person], index) => ({
        uniqueId: key,
        name: person.name,
        totalWeightKg: person.totalWeightKg || 0,
        position: index + 1
      }));
    return {
      seatedAnglers,
      waitingAnglers,
      seating: { capacity: this.capacity, occupied: seatedAnglers.length, real, simulated: seatedAnglers.length - real, waiting: waitingAnglers.length }
    };
  }
}

module.exports = { PondSeating, isSimulatedAngler, compareAnglers, setSeatIdleMinutes, isActivePerson };
