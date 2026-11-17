class CatchRoundClock {
  constructor(now = Date.now, delay = () => 15000) { this.now = now; this.delay = delay; this.pending = new Map(); this.nextAt = now() + delay(); }
  notice(client, id, phase) {
    if (!id) return;
    let notices = this.pending.get(client);
    if (phase === 'closed') {
      if (!notices?.delete(id)) return;
      if (!notices.size) this.pending.delete(client);
      this.nextAt = this.now() + this.delay();
    } else {
      if (!notices) this.pending.set(client, notices = new Map());
      notices.set(id, this.now() + 12000);
    }
  }
  disconnect(client) {
    if (this.pending.delete(client)) this.nextAt = this.now() + this.delay();
  }
  hasNotice(id) {
    return [...this.pending.values()].some(notices => notices.has(id));
  }
  settled() {
    for (const [client, notices] of this.pending) {
      for (const [id, deadline] of notices) if (deadline <= this.now()) this.notice(client, id, 'closed');
    }
    return !this.pending.size;
  }
  ready() { return this.settled() && this.now() >= this.nextAt; }
  checked() { this.nextAt = this.now() + this.delay(); }
  reset() { this.pending.clear(); this.checked(); }
}
module.exports = { CatchRoundClock };
