// Session-only roster: historical leaderboard entries are not live participants.
const BITE_RATES = [[0, 0], [1, .70], [2, .78], [5, .85], [10, .88], [20, .90], [50, .94], [100, .97]];
function biteChance(count) {
  if (count <= 0) return 0;
  for (let i = 1; i < BITE_RATES.length; i++) {
    const [upper, high] = BITE_RATES[i];
    const [lower, low] = BITE_RATES[i - 1];
    if (count <= upper) return low + (high - low) * (count - lower) / (upper - lower);
  }
  return .95;
}
class CommentFishing {
  constructor({ now = Date.now, random = Math.random, canFish = () => true } = {}) {
    this.now = now;
    this.random = random;
    this.canFish = canFish;
    this.people = new Map();
    this.roundNumber = 0;
    this.restUntil = new Map();
  }
  get size() { return this.people.size; }
  // Xoá khỏi danh sách dự câu (người đã rời live)
  remove(key) { return this.people.delete(String(key)); }
  clear() { this.people.clear(); this.restUntil.clear(); this.roundNumber = 0; }
  comment(person) {
    const key = String(person.uniqueId || person.user || '');
    if (!key || key.startsWith('sim:')) return false;
    const previous = this.people.get(key);
    this.people.delete(key);
    this.people.set(key, {
      ...previous, ...person, uniqueId: key,
      joinedAt: previous?.joinedAt ?? this.now(),
      isNewcomer: previous?.isNewcomer ?? true,
      lastCommentAt: this.now()
    });
    return true;
  }
  // Thả tim: vào danh sách dự câu nhưng chỉ 1 vé (không được ưu tiên 3 vé như comment)
  like(person) {
    const key = String(person.uniqueId || person.user || '');
    if (!key || key.startsWith('sim:')) return false;
    const previous = this.people.get(key);
    if (previous) return true; // đã có trong danh sách, giữ nguyên
    this.people.set(key, { ...person, uniqueId: key, joinedAt: this.now(), isNewcomer: true, lastCommentAt: -Infinity });
    return true;
  }
  caught(key) {
    // Phòng càng vắng càng nghỉ ít lượt. 1-2 người: KHÔNG nghỉ, câu liên tục.
    const size = this.people.size;
    const restRounds = size <= 2 ? 0 : size <= 5 ? 1 : 3;
    this.restUntil.set(String(key), this.roundNumber + restRounds + 1);
  }
  eligible(now = this.now()) {
    return [...this.people.values()].filter(p => this.canFish(p.uniqueId) && this.roundNumber >= (this.restUntil.get(String(p.uniqueId)) || 0));
  }
  round() {
    const now = this.now();
    const eligible = this.eligible(now);
    if (this.emptyRounds === undefined) this.emptyRounds = 0;

    // Luân phiên: tối đa 2 lần liên tiếp, sau đó nhường người khác
    let drawPool = eligible.filter(person => person.isNewcomer);
    if (!drawPool.length) drawPool = eligible;
    if (eligible.length > 1 && this.lastWinnerKey && (this.winStreak || 0) >= 2) {
      const others = drawPool.filter(p => String(p.uniqueId) !== this.lastWinnerKey);
      if (others.length) drawPool = others;
    }

    let winner = null;
    if (drawPool.length) {
      // Bảo hiểm: trượt 3 lượt liên tiếp thì lượt thứ 4 chắc chắn có cá
      const forced = this.emptyRounds >= 3;
      if (forced || this.random() < biteChance(drawPool.length)) {
        winner = this.draw(drawPool, now);
      }
    }
    this.emptyRounds = winner ? 0 : this.emptyRounds + 1;
    if (winner) {
      const key = String(winner.uniqueId);
      this.winStreak = this.lastWinnerKey === key ? (this.winStreak || 0) + 1 : 1;
      this.lastWinnerKey = key;
    }

    this.roundNumber++;
    for (const [key, round] of this.restUntil) if (round <= this.roundNumber) this.restUntil.delete(key);
    return winner;
  }
  draw(eligible = this.eligible(), now = this.now()) {
    // Mỗi người 1 vé — KHÔNG thưởng thêm vé cho việc spam comment
    const weight = () => 1;
    let ticket = this.random() * eligible.reduce((sum, p) => sum + weight(p), 0);
    for (const person of eligible) {
      ticket -= weight(person);
      if (ticket < 0) { this.caught(person.uniqueId); return person; }
    }
    return null;
  }
}
class SimulationFishing extends CommentFishing {
  sync(people) {
    this.people = new Map(people.map(person => [String(person.uniqueId), {
      ...this.people.get(String(person.uniqueId)),
      user: person.name, uniqueId: String(person.uniqueId), avatar: person.avatar || '',
      lastCommentAt: -Infinity
    }]));
  }
}
module.exports = { CommentFishing, SimulationFishing, biteChance };
