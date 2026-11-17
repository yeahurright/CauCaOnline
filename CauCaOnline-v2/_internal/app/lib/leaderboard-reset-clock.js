class LeaderboardResetClock {
  constructor(minutes = () => 60, now = Date.now) { this.minutes = minutes; this.now = now; this.restart(); }
  restart() { this.resetAt = this.now() + this.minutes() * 60000; }
  due() { if (this.now() < this.resetAt) return false; this.restart(); return true; }
}
module.exports = { LeaderboardResetClock };
