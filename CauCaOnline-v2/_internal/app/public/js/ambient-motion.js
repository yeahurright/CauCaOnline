// Lớp chuyển động ven hồ cho khung 9:16.
(function () {
  'use strict';

  var W = 1080, H = 1920;
  var stage = document.getElementById('stage9x16');
  if (!stage) return;

  var canvas = document.createElement('canvas');
  canvas.className = 'ambient-motion-canvas';
  canvas.width = W;
  canvas.height = H;
  canvas.setAttribute('aria-hidden', 'true');

  var overlay = stage.querySelector('.water-ambient-overlay');
  if (overlay && overlay.parentNode === stage) overlay.insertAdjacentElement('afterend', canvas);
  else stage.appendChild(canvas);

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var rand = function (a, b) { return a + Math.random() * (b - a); };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const weatherNames = { sun: 'Nắng', rain: 'Mưa', mist: 'Sương' };
  const layouts = window.PondMapLayouts;
  let layout = layouts.still;
  const current = document.getElementById('pondCurrent');
  const weatherLabel = document.getElementById('pondCurrentWeather');
  const mapTime = document.getElementById('pondMapTime');
  const ballot = document.getElementById('pondBallot');
  const ballotTitle = document.getElementById('pondBallotTitle');
  const ballotTime = document.getElementById('pondBallotTime');
  const ballotOptions = document.getElementById('pondBallotOptions');
  let weather = 'sun';
  let ballotDeadline = 0;
  let mapDeadline = 0;
  const weatherMix = { sun: 1, rain: 0, mist: 0 };
  const { actions } = window.PondActionsData;
  let cutTrees = new Set();
  let pondEffects = new Set();
  let activeJob = null;
  let serverOffset = 0;
  const baseMap = stage.querySelector('[data-pond-map]');
  const mapImages = new Map([['still', baseMap]]);
  function showMapImage() {
    const image = mapImages.get(layout.map.id);
    if (!image.naturalWidth) return;
    for (const layer of mapImages.values()) layer.classList.toggle('is-current-map', layer === image);
  }
  for (const { id } of window.PondMaps.slice(1)) {
    const image = new Image();
    image.className = 'fishing-lake-bg';
    image.alt = '';
    image.dataset.pondMap = id;
    image.addEventListener('load', showMapImage);
    mapImages.set(id, image);
    baseMap.insertAdjacentElement('afterend', image);
    image.src = `/assets/pond-map-${id}.webp`;
  }
  baseMap.addEventListener('load', showMapImage);

  function timeLeft(deadline) {
    const seconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function renderCountdown() {
    if (!mapTime.hidden) mapTime.textContent = `Khu còn ${timeLeft(mapDeadline)}`;
    if (!ballot.hidden) ballotTime.textContent = timeLeft(ballotDeadline);
  }

  window.PondAmbience = {
    update(state) {
      if (!state) return;
      if (Object.hasOwn(weatherNames, state.weather)) weather = state.weather;
      if (Object.hasOwn(layouts, state.scenery)) layout = layouts[state.scenery];
      stage.dataset.map = layout.map.id;
      showMapImage();
      current.textContent = layout.map.name;
      weatherLabel.textContent = weatherNames[weather];
      mapTime.hidden = state.mapEndsAt == null;
      if (!mapTime.hidden) mapDeadline = performance.now() + Math.max(0, state.mapEndsAt - state.serverNow);
      const poll = state.poll;
      ballot.hidden = !poll;
      if (poll) {
        ballotDeadline = performance.now() + Math.max(0, poll.endsAt - state.serverNow);
        ballotTitle.textContent = poll.kind === 'weather' ? 'Bình chọn thời tiết' : 'Bình chọn khu câu';
        const options = poll.options.map(({ label, count }) => {
          const option = document.createElement('span');
          option.textContent = `${label.toLocaleUpperCase('vi-VN')} · ${count}`;
          return option;
        });
        ballotOptions.replaceChildren(...options);
      }
      renderCountdown();
      if (reducedMotion.matches) render(0, 0);
    },
    updateActions(world) {
      cutTrees = new Set(world.cutTrees);
      pondEffects = new Set(world.effects);
      activeJob = world.active;
      serverOffset = world.serverNow - performance.now();
      if (reducedMotion.matches) render(0, 0);
    }
  };
  setInterval(renderCountdown, 250);

  function loadSprite(path) {
    const sprite = new Image();
    sprite.addEventListener('load', () => {
      if (reducedMotion.matches) render(0, 0);
    });
    sprite.src = `/assets/${path}`;
    return sprite;
  }

  const bamboo = loadSprite('pond-bamboo.webp');
  const scooter = loadSprite('pond-scooter.webp');
  const plants = loadSprite('pond_bank_decor.png');
  const litter = ['plastic_bottle', 'slipper'].map(id => loadSprite(`new_fish/${id}.png`));
  const roadY = x => 1609 + 21 * Math.sin((x + 100) / 244) + 10 * Math.sin(x / 139);
  const road = new Path2D();
  for (let x = -120; x <= W + 120; x += 20) {
    if (x === -120) road.moveTo(x, roadY(x));
    else road.lineTo(x, roadY(x));
  }
  const rain = Array.from({ length: 125 }, () => ({ x: rand(0, W + 80), y: rand(0, H), speed: rand(.43, .82) }));
  const sunWash = ctx.createRadialGradient(165, 260, 32, 165, 260, 1350);
  sunWash.addColorStop(0, 'rgba(255,228,126,.24)');
  sunWash.addColorStop(1, 'rgba(255,228,126,0)');
  let worldTime = 0;
  let nextRide = 1300;
  let ride = null;

  function drawBank(dt, wind) {
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.globalAlpha = .87;
    for (const [i, color] of layout.map.bank.entries()) {
      ctx.strokeStyle = color;
      ctx.lineWidth = [78, 66, 42][i];
      ctx.stroke(layout.bank);
      ctx.lineWidth -= 10;
      ctx.stroke(road);
    }
    ctx.globalAlpha = .32;
    ctx.lineWidth = 2;
    ctx.strokeStyle = layout.map.bank[0];
    ctx.stroke(layout.bankDetail);
    ctx.globalAlpha = 1;

    if (bamboo.naturalWidth) {
      for (const { id } of actions.chop.targets) {
        if (cutTrees.has(id)) continue;
        const { x, y, size } = layout.targets.get(id);
        const height = size * .65;
        const fall = activeJob?.target === id ? Math.max(0, Math.min(1, 1 - (activeJob.hitAt - performance.now() - serverOffset) / 420)) : 0;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(worldTime / 970 + x) * wind + fall * (x < W / 2 ? -.95 : .95));
        ctx.drawImage(bamboo, -height * .45, -height, height * .91, height);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    const elapsed = activeJob?.type === 'water' ? performance.now() + serverOffset - activeJob.hitAt + 950 : -1;
    if (elapsed >= 0 && elapsed < 1150) {
      const { x, y } = layout.targets.get(activeJob.target);
      ctx.fillStyle = '#c9f8ff';
      for (let i = 0; i < 7; i++) {
        const phase = ((elapsed + i * 89) % 520) / 520;
        ctx.globalAlpha = .8 * (1 - phase * .5);
        ctx.beginPath();
        ctx.ellipse(x + (i - 3) * 9 * phase, y - 53 + phase * 45, 2.3, 5, .15, 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (plants.naturalWidth) {
      for (const { id } of actions.water.targets) {
        const { x, y } = layout.targets.get(id);
        const blooming = pondEffects.has(id);
        ctx.drawImage(plants, 19, 1146, 84, 55, x - 37, y - 35, 74, 42);
        if (blooming) {
          ctx.drawImage(plants, 18, 363, 75, 66, x - 51, y - 74, 68, 60);
          ctx.drawImage(plants, 18, 363, 75, 66, x - 4, y - 56, 57, 51);
        }
      }
    }

    if (!dt || !scooter.naturalWidth) return;
    if (worldTime >= nextRide && !ride) {
      const direction = Math.random() < .5 ? -1 : 1;
      ride = { direction, x: direction === 1 ? -82 : W + 82, speed: rand(.125, .195), size: rand(83, 110) };
    }
    if (!ride) return;
    ride.x += ride.speed * ride.direction * dt;
    if (ride.x < -85 || ride.x > W + 85) {
      nextRide = worldTime + rand(5500, 12000);
      ride = null;
      return;
    }
    const y = roadY(ride.x) + 4;
    ctx.fillStyle = 'rgba(54,46,34,.28)';
    ctx.beginPath();
    ctx.ellipse(ride.x, y, ride.size * .48, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(ride.x, y + Math.sin(worldTime / 73) * 1.3);
    ctx.scale(ride.direction, 1);
    ctx.drawImage(scooter, -ride.size / 2, -ride.size * .87, ride.size, ride.size * .87);
    ctx.restore();
  }

  function drawWaterActions() {
    ctx.save();
    ctx.clip(layout.water);
    for (const { id, sprite } of actions.clean.targets) {
      if (pondEffects.has(id) || !litter[sprite].naturalWidth) continue;
      const { x, y } = layout.targets.get(id);
      const wave = worldTime / 880 + x;
      ctx.save();
      ctx.translate(x + Math.sin(wave * .35) * 20, y + Math.sin(wave) * 8);
      ctx.rotate(Math.sin(wave * .6) * .26);
      ctx.drawImage(litter[sprite], -28, -28, 56, 56);
      ctx.restore();
    }
    if (activeJob?.type === 'feed') {
      const elapsed = performance.now() + serverOffset - activeJob.hitAt;
      if (elapsed >= 0 && elapsed < 1900) {
        const { x, y } = layout.targets.get(actions.feed.targets[0].id);
        const progress = elapsed / 1900;
        ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = '#ddfcf0';
        ctx.lineWidth = 3;
        ctx.fillStyle = '#fbd488';
        for (let i = 0; i < 7; i++) {
          const angle = i * Math.PI * 2 / 7;
          ctx.beginPath();
          ctx.arc(x + Math.cos(angle) * (18 + 80 * progress), y + Math.sin(angle) * (12 + 38 * progress), 4, 0, 6.29);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.ellipse(x, y, 12 + 110 * progress, 5 + 38 * progress, 0, 0, 6.29);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawWeather(dt) {
    ctx.globalAlpha = weatherMix.sun;
    ctx.fillStyle = sunWash;
    ctx.fillRect(0, 0, W, H);
    if (weatherMix.mist > .01) {
      ctx.globalAlpha = weatherMix.mist * .58;
      for (let i = 0; i < 5; i++) {
        const x = Math.sin(worldTime / 6800 + i * 1.8) * 270 + 110;
        ctx.drawImage(cloudSprite, x, 190 + i * 296, 1050, 420);
      }
    }
    if (weatherMix.rain > .008) {
      ctx.globalAlpha = weatherMix.rain;
      ctx.fillStyle = 'rgba(31,59,79,.31)';
      ctx.fillRect(0, 0, W, H);
      ctx.beginPath();
      for (const drop of rain) {
        drop.y += dt * drop.speed;
        drop.x -= dt * drop.speed * .27;
        if (drop.y > H + 36 || drop.x < -30) { drop.y = rand(-75, -25); drop.x = rand(0, W + 80); }
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 8, drop.y + drop.speed * 38);
      }
      ctx.strokeStyle = 'rgba(207,237,251,.69)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- sprite mây mềm (vẽ 1 lần) ---------- */
  var cloudSprite = document.createElement('canvas');
  cloudSprite.width = cloudSprite.height = 256;
  (function () {
    var c = cloudSprite.getContext('2d');
    var g = c.createRadialGradient(128, 128, 10, 128, 128, 126);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(240,250,255,0.55)');
    g.addColorStop(1, 'rgba(240,250,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(128, 128, 126, 0, Math.PI * 2);
    c.fill();
  })();

  /* ---------- sprite đốm sáng (vẽ 1 lần) ---------- */
  var glowSprite = document.createElement('canvas');
  glowSprite.width = glowSprite.height = 48;
  (function () {
    var c = glowSprite.getContext('2d');
    var g = c.createRadialGradient(24, 24, 0, 24, 24, 23);
    g.addColorStop(0, 'rgba(255,255,225,1)');
    g.addColorStop(0.35, 'rgba(255,240,170,0.65)');
    g.addColorStop(1, 'rgba(255,220,120,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(24, 24, 23, 0, Math.PI * 2);
    c.fill();
  })();

  /* ---------- hạt ---------- */
  var clouds = [];
  for (var i = 0; i < 7; i++) {
    clouds.push({
      x: rand(-380, W + 380),
      y: rand(30, 760),
      scale: rand(1.1, 2.6),
      vx: rand(2, 7) / 1000,
      a: rand(0.05, 0.11)
    });
  }

  var leaves = [];
  for (var j = 0; j < 22; j++) {
    leaves.push({
      x: rand(-60, W + 60),
      y: rand(-200, H),
      s: rand(6, 15),
      vx: rand(6, 24) / 1000,
      vy: rand(9, 30) / 1000,
      rot: rand(0, Math.PI * 2),
      vr: rand(-1.1, 1.1) / 1000,
      a: rand(0.16, 0.40),
      warm: Math.random() < 0.45
    });
  }

  var motes = [];
  for (var k = 0; k < 38; k++) {
    motes.push({
      x: rand(0, W),
      y: rand(520, H),
      r: rand(1.2, 3.6),
      vx: rand(-7, 7) / 1000,
      vy: rand(-12, -2) / 1000,
      tw: rand(0, Math.PI * 2),
      ts: rand(1.2, 3.2) / 1000,
      a: rand(0.15, 0.55)
    });
  }

  const flow = Array.from({ length: 30 }, () => ({ phase: rand(0, 1), lane: rand(.11, .89), speed: rand(.55, 1.4) }));
  const glints = flow.slice(0, 12);
  const pads = [[.32,.26,74],[.7,.34,61],[.25,.37,92],[.68,.55,65],[.25,.66,90],[.61,.72,105],[.72,.82,72],[.43,.9,85]];
  const lotus = document.createElement('canvas');
  lotus.width = 100;
  lotus.height = 82;
  const petal = lotus.getContext('2d');
  const leaf = petal.createRadialGradient(45, 48, 3, 45, 48, 52);
  leaf.addColorStop(0, '#aec970');
  leaf.addColorStop(.72, '#508b47');
  leaf.addColorStop(1, '#265b3c');
  petal.fillStyle = leaf;
  petal.beginPath();
  petal.moveTo(50, 51);
  petal.ellipse(50, 51, 47, 26, 0, .26, 5.94);
  petal.closePath();
  petal.fill();
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    petal.fillStyle = i % 2 ? '#f9acc2' : '#ec799c';
    petal.beginPath();
    petal.ellipse(49 + Math.cos(angle) * 13, 33 + Math.sin(angle) * 9, 15, 6.8, angle, 0, 6.29);
    petal.fill();
  }
  petal.fillStyle = '#ffdfa1';
  petal.beginPath();
  petal.ellipse(49, 33, 7.8, 5.2, 0, 0, 6.29);
  petal.fill();

  function drawWater() {
    ctx.save();
    if (layout.map.id === 'spring') {
      // Mép thác được căn theo nền Suối Tiên. Vệt sáng rơi dọc theo sườn đá.
      ctx.strokeStyle = '#ecffff';
      for (const { phase, lane, speed } of flow) {
        const p = (worldTime * speed / 720 + phase) % 1;
        const q = Math.min(1, p + .12);
        const x = t => 978 - 275 * t - 25 * Math.sin(Math.PI * t) + (lane - .5) * (67 + 42 * t);
        ctx.globalAlpha = Math.sin(p * Math.PI) * .63;
        ctx.lineWidth = 1.2 + speed * 1.4;
        ctx.beginPath();
        ctx.moveTo(x(p), 43 + 365 * p);
        ctx.lineTo(x(q), 43 + 365 * q);
        ctx.stroke();
      }
    }
    ctx.clip(layout.water);
    if (layout.map.id === 'spring') {
      ctx.strokeStyle = '#c1fff4';
      ctx.lineWidth = 2.3;
      for (const { phase, lane, speed } of flow) {
        const p = (worldTime * speed / 6000 + phase) % 1;
        const y = 432 + (layout.bottom - 512) * p;
        const from = layout.waterPoint(lane, y), to = layout.waterPoint(lane, y + 37);
        ctx.globalAlpha = Math.sin(p * Math.PI) * .52;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo((from.x + to.x) / 2 + 7, from.y + 20, to.x, to.y);
        ctx.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const p = (worldTime / 1280 + i / 4) % 1;
        ctx.globalAlpha = .57 * (1 - p);
        ctx.beginPath();
        ctx.ellipse(702 - p * 14, 426 + p * 28, 27 + p * 133, 11 + p * 46, 0, 0, 6.29);
        ctx.stroke();
      }
    } else if (layout.map.id === 'lotus') {
      for (const [lane, along, size] of pads) {
        const point = layout.waterPoint(lane, layout.top + (layout.bottom - layout.top) * along);
        const sway = Math.sin(worldTime / 1400 + along * 12);
        ctx.globalAlpha = .88;
        ctx.drawImage(lotus, point.x - size / 2 + sway * 10, point.y - size * .35 + sway * 5, size, size * .82);
      }
    } else {
      ctx.strokeStyle = '#d9e4a2';
      ctx.lineWidth = 2;
      for (const { phase, lane, speed } of glints) {
        const p = (worldTime * speed / 5300 + phase) % 1;
        const point = layout.waterPoint(lane, layout.top + (layout.bottom - layout.top) * phase);
        ctx.globalAlpha = Math.sin(p * Math.PI) * .33;
        ctx.beginPath();
        ctx.ellipse(point.x + p * 19, point.y, 13 + p * 75, 2.5 + p * 13, 0, .17, 5.95);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  var ripples = [];
  var lastRipple = 0;
  var last = 0;

  function step(ts) {
    requestAnimationFrame(step);
    if (document.hidden || reducedMotion.matches) { last = ts; return; }
    if (ts - last < 30) return;
    const dt = last ? Math.min(80, ts - last) : 33;
    last = ts;
    worldTime += dt;
    render(worldTime, dt);
  }

  function render(ts, dt) {
    const blend = dt ? Math.min(1, dt / 750) : 1;
    for (const key in weatherMix) weatherMix[key] += (Number(weather === key) - weatherMix[key]) * blend;
    const wind = .045 + .077 * weatherMix.rain;
    ctx.clearRect(0, 0, W, H);

    /* --- mây --- */
    for (var i = 0; i < clouds.length; i++) {
      var cl = clouds[i];
      cl.x += cl.vx * dt;
      if (cl.x - 380 * cl.scale > W + 420) {
        cl.x = -420 * cl.scale;
        cl.y = rand(30, 760);
        cl.scale = rand(1.1, 2.6);
        cl.a = rand(0.05, 0.11);
      }
      var size = 256 * cl.scale;
      ctx.globalAlpha = cl.a;
      ctx.drawImage(cloudSprite, cl.x - size / 2, cl.y - size / 2, size, size);
    }

    ctx.globalAlpha = 1;
    drawWater();

    /* --- đom đóm --- */
    for (var q = 0; q < motes.length; q++) {
      var mo = motes[q];
      mo.x += mo.vx * dt;
      mo.y += mo.vy * dt;
      mo.tw += mo.ts * dt;
      if (mo.y < 460) { mo.y = H + 20; mo.x = rand(0, W); }
      if (mo.x < -20) mo.x = W + 20;
      if (mo.x > W + 20) mo.x = -20;
      var alpha = mo.a * (0.45 + 0.55 * Math.abs(Math.sin(mo.tw)));
      ctx.globalAlpha = alpha;
      ctx.drawImage(glowSprite, mo.x - mo.r * 4, mo.y - mo.r * 4, mo.r * 8, mo.r * 8);
    }

    /* --- lá rơi --- */
    for (var l = 0; l < leaves.length; l++) {
      var lf = leaves[l];
      lf.x += (lf.vx + Math.sin(lf.rot) * 0.012 + wind * .15) * dt;
      lf.y += lf.vy * dt;
      lf.rot += lf.vr * dt;
      if (lf.y > H + 40) {
        lf.y = -40;
        lf.x = rand(-60, W + 60);
      }
      if (lf.x > W + 60) lf.x = -60;
      ctx.globalAlpha = lf.a;
      ctx.save();
      ctx.translate(lf.x, lf.y);
      ctx.rotate(lf.rot);
      ctx.fillStyle = layout.map.id === 'lotus' ? '#ffc1c1' : lf.warm ? '#f6cc78' : '#92ce84';
      ctx.beginPath();
      ctx.ellipse(0, 0, lf.s, lf.s * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /* --- vòng sóng lan --- */
    if (ts - lastRipple > 1400 - 1110 * weatherMix.rain) {
      lastRipple = ts;
      ripples.push({ ...layout.waterPoint(rand(.12, .88), rand(410, 1400)), r: 6, a: 0.38 });
    }
    ctx.save();
    ctx.clip(layout.water);
    for (var r = ripples.length - 1; r >= 0; r--) {
      var rp = ripples[r];
      rp.r += 0.035 * dt;
      rp.a -= 0.00022 * dt;
      if (rp.a <= 0) { ripples.splice(r, 1); continue; }
      ctx.globalAlpha = Math.max(0, rp.a);
      ctx.strokeStyle = 'rgba(215,250,255,1)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.globalAlpha = 1;
    drawBank(dt, wind);
    drawWaterActions();
    drawWeather(dt);
  }

  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) render(0, 0);
  });
  render(0, 0);
  requestAnimationFrame(step);
})();
