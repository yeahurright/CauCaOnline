const maps = require('../public/js/pond-maps');
const { weatherPerkForMap } = require('./fish-sale');
const { ANOMALIES, ANOMALY_DURATION_MS } = require('./pond-anomalies');
const MAP_DURATION = 180_000;
const MAP_BALLOT_DURATION = 30_000;
const WEATHER_DURATION = 45_000;
const anomalyIds = Object.keys(ANOMALIES);
const choices = {
  weather: [{ id: 'sun', label: 'Nắng' }, { id: 'rain', label: 'Mưa' }, { id: 'mist', label: 'Sương' }],
  scenery: maps.map(({ id, vote }) => ({ id, label: vote }))
};
const mapWeather = map => choices.weather.map(({ id, label }) => ({ id, label: map?.weather?.[id] || label }));
const commands = new Map([...Object.values(choices).flat(), ...maps.flatMap(mapWeather)]
  .map(({ id, label }) => [normalize(label), id]));
for (const { id, name, voteAliases = [] } of maps) {
  for (const label of [name, ...voteAliases]) commands.set(normalize(label), id);
}

function normalize(text) {
  return String(text || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}

class PondScenePoll {
  constructor({ now = Date.now, random = Math.random } = {}) {
    this.now = now;
    this.random = random;
    this.scene = { weather: 'sun', scenery: maps[0].id };
    this.votes = new Map();
    this.reset();
  }

  reset(now = this.now()) {
    this.anomaly = null;
    this.mapEndsAt = now + MAP_DURATION;
    this.nextAnomaly = {
      id: anomalyIds[Math.floor(this.random() * anomalyIds.length)],
      startsAt: now + Math.floor(this.random() * (MAP_DURATION - ANOMALY_DURATION_MS))
    };
    this.openBallot('weather', now + WEATHER_DURATION);
  }

  openBallot(kind, endsAt) {
    this.votes.clear();
    this.kind = kind;
    this.endsAt = endsAt;
    this.changed = true;
  }

  startMapBallot(now = this.now()) {
    if (this.kind === 'scenery' && this.endsAt > now) return;
    this.mapEndsAt = now + MAP_BALLOT_DURATION;
    this.openBallot('scenery', this.mapEndsAt);
  }

  handleChat(text, viewerId) {
    const command = normalize(text);
    const option = commands.get(command);
    if (!option) return null;
    this.advance(this.now());
    const voter = String(viewerId || '').trim().toLowerCase();
    if (!voter || !this.kind || this.votes.has(voter) ||
        !this.options().some(({ id, label }) => id === option && (this.kind !== 'weather' || normalize(label) === command))) return false;
    this.votes.set(voter, option);
    this.changed = true;
    return true;
  }

  options(kind = this.kind) {
    const counts = new Map();
    if (kind === this.kind) {
      for (const option of this.votes.values()) counts.set(option, (counts.get(option) || 0) + 1);
    }
    const list = kind === 'weather' ? mapWeather(maps.find(map => map.id === this.scene.scenery)) : choices[kind];
    return list.map(option => ({ ...option, count: counts.get(option.id) || 0 }));
  }

  selectMap(id) {
    if (!maps.some(map => map.id === id)) return false;
    if (this.scene.scenery !== id) {
      this.scene.scenery = id;
      this.reset();
    }
    return true;
  }

  selectWeather(id) {
    if (!choices.weather.some(option => option.id === id)) return false;
    this.scene.weather = id;
    this.changed = true;
    return true;
  }

  selectAnomaly(id, startedAt = this.now()) {
    if (id !== null && !Object.hasOwn(ANOMALIES, id)) return false;
    this.nextAnomaly = null;
    this.anomaly = id === null ? null : { id, startedAt, endsAt: startedAt + ANOMALY_DURATION_MS };
    this.changed = true;
    return true;
  }

  activeAnomaly(now = this.now()) {
    return this.anomaly?.endsAt > now ? this.anomaly : null;
  }

  applyWinner(kind) {
    const options = this.options(kind);
    const highest = Math.max(...options.map(({ count }) => count));
    const candidates = options.filter(({ id, count }) => highest ? count === highest : id !== this.scene[kind]);
    this.scene[kind] = candidates[Math.floor(this.random() * candidates.length)].id;
  }

  advance(now) {
    if (now < this.endsAt) return;
    if (this.kind === 'weather') this.applyWinner('weather');
    if (now >= this.mapEndsAt) {
      this.applyWinner('scenery');
      this.reset(now);
      return;
    }
    const mapVoteAt = this.mapEndsAt - MAP_BALLOT_DURATION;
    if (now >= mapVoteAt) {
      this.openBallot('scenery', this.mapEndsAt);
      return;
    }
    const mapStart = this.mapEndsAt - MAP_DURATION;
    const weatherEnd = mapStart + (Math.floor((now - mapStart) / WEATHER_DURATION) + 1) * WEATHER_DURATION;
    this.openBallot(weatherEnd <= mapVoteAt ? 'weather' : null, Math.min(weatherEnd, mapVoteAt));
  }

  update() {
    const now = this.now();
    this.advance(now);
    if (this.nextAnomaly?.startsAt <= now) {
      const { id, startsAt } = this.nextAnomaly;
      this.selectAnomaly(id, startsAt);
    }
    if (this.anomaly && !this.activeAnomaly(now)) this.selectAnomaly(null);
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  snapshot(live) {
    const now = this.now();
    const anomaly = live && this.activeAnomaly(now);
    return {
      ...this.scene,
      anomaly: anomaly ? {
        ...anomaly, name: ANOMALIES[anomaly.id].name, perk: ANOMALIES[anomaly.id].perk
      } : null,
      weatherPerk: weatherPerkForMap(this.scene.scenery, this.scene.weather)?.label,
      mapEndsAt: live ? this.mapEndsAt : null,
      poll: live && this.kind ? { kind: this.kind, endsAt: this.endsAt, options: this.options() } : null,
      serverNow: now
    };
  }
}

module.exports = { PondScenePoll };
