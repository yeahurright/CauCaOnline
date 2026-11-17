/**
 * Fishing Lake Live Controller & WebSocket Client
 * - Tự động co giãn khung hình 9:16 (1080x1920) chuẩn xác theo màn hình
 * - Kết nối thời gian thực qua WebSocket (/ws) với JSON-RPC 2.0
 * - Điều phối hiệu ứng phao câu, cần thủ, âm thanh và giọng đọc VieNeu-TTS Hải Đăng
 */
(function () {
  'use strict';

  // 1. Kiểm tra tham số ?obs=1 để kích hoạt chế độ OBS Studio sạch (không dock)
  const urlParams = new URLSearchParams(window.location.search);
  const showDemoControls = urlParams.get('controls') === 'demo';
  const isObsMode = urlParams.get('obs') === '1' || urlParams.get('obs') === 'true';
  if (isObsMode) {
    document.body.classList.add('obs-mode');
  }

  // 1b. Người xem qua link công khai (tunnel) chỉ thấy khung hồ, không thấy bảng điều khiển
  const isLocalHost = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i
    .test(window.location.hostname || '');
  const isPublicViewer = !isLocalHost;

  // Trình mở bản thử bật tiếng ở trang điều khiển bằng tham số sound=1.
  const isAudioSource = isObsMode || isPublicViewer || urlParams.get('sound') === '1';
  if (window.FishingAudio) {
    window.FishingAudio.silentSecondary = !isAudioSource;
  }
  if (isPublicViewer) {
    document.body.classList.add('obs-mode');
  }

  // 2. Tự động co giãn 9:16 (Auto Scale)
  const stage = document.getElementById('stage9x16');
  const stageWrapper = document.getElementById('stageWrapper');

  function resizeStage() {
    if (!stage || !stageWrapper) return;
    const availWidth = stageWrapper.clientWidth;
    const availHeight = stageWrapper.clientHeight;
    const scale = Math.min(availWidth / 1080, availHeight / 1920);
    stage.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', resizeStage);
  resizeStage();

  // 3. Khởi tạo Canvas Particle Engine
  const canvas = document.getElementById('fishingCanvas');
  let particleEngine = null;
  if (canvas && window.FishingParticleEngine) {
    particleEngine = new window.FishingParticleEngine(canvas);
  }

  // 4. Các phần tử DOM chính
  const bobberBody = document.getElementById('bobberBody');
  const anglerSpriteImg = document.getElementById('anglerSpriteImg');
  const anglerWishBubble = document.getElementById('anglerWishBubble');
  const anglerName = document.getElementById('anglerName');
  const anglerAction = document.getElementById('anglerAction');
  const anglerAvatar = document.getElementById('anglerAvatar');

  const statCatches = document.getElementById('statCatches');
  const statWeight = document.getElementById('statWeight');
  const statBait = document.getElementById('statBait');
  const statHorn = document.getElementById('statHorn');
  const pondSeatCommand = document.getElementById('pondSeatCommand');
  const legacyBaitGuide = document.getElementById('pondGuideLegacyBait');
  const newBaitGuide = document.getElementById('pondGuideNewBait');

  const liveStatusText = document.getElementById('liveStatusText');
  const liveDot = document.getElementById('liveDot');

  const activeAnglerName = document.getElementById('activeAnglerName');
  const activeActionTag = document.getElementById('activeActionTag');
  const leaderboardList = document.getElementById('leaderboardList');
  const vipStoolsLayer = document.getElementById('vipStoolsLayer');
  const pondScene = new window.FishingPondScene(vipStoolsLayer);
  const bitePrompt = document.getElementById('bitePrompt');
  let smallCatchCards = false;
  let biteClock;
  function updateBite(bite, serverNow = Date.now()) {
    clearInterval(biteClock);
    const visible = bite && bite.phase === 'waiting';
    bitePrompt.hidden = !visible;
    pondScene.focusBite(visible && bite.bigFish ? bite.uniqueId : null);
    if (!visible) return;
    document.getElementById('bitePlayer').textContent = bite.user;
    document.getElementById('biteTitle').textContent = bite.bigFish ? '🐟 CÓ CÁ LỚN!' : '🐟 CÁ CẮN CÂU!';
    document.getElementById('biteInstruction').textContent = bite.bigFish
      ? `❤️ Tim để cá to hơn\nGõ để tăng tỷ lệ câu: ${bite.chancePercent}%\nGIẬT / KÉO / LÊN / CÂU` : 'Gõ GIẬT trong chat để kéo cá lên';
    const deadline = performance.now() + bite.endsAt - serverNow;
    const tick = () => {
      const left = Math.max(0, deadline - performance.now());
      document.getElementById('biteCountdown').textContent = `${Math.ceil(left / 1000)}s`;
      document.getElementById('biteProgress').style.transform = `scaleX(${Math.min(1, left / (bite.endsAt - bite.startedAt))})`;
    };
    tick();
    biteClock = setInterval(tick, 100);
  }
  let activityLive = false;
  const featureStrip = document.getElementById('pondFeatureStrip');
  const featureName = document.getElementById('pondFeatureName');
  const featureReason = document.getElementById('pondFeatureReason');
  const featureTime = document.getElementById('pondFeatureTime');
  const featureShadow = document.getElementById('pondFeatureShadow');
  let pondFeature = null;
  let featureDeadline = 0;

  function renderFeatureClock() {
    if (!pondFeature) return;
    const seconds = Math.max(0, Math.ceil((featureDeadline - performance.now()) / 1000));
    featureStrip.hidden = seconds === 0;
    if (!seconds) featureShadow.hidden = true;
    featureTime.textContent = `0:${String(seconds).padStart(2, '0')}`;
  }

  function updatePondFeature(fish, serverNow = Date.now()) {
    if ((fish?.endsAt === pondFeature?.endsAt) && (fish?.mapId === pondFeature?.mapId)) return;
    pondFeature = fish || null;
    featureStrip.hidden = featureShadow.hidden = !pondFeature;
    if (pondFeature) {
      featureDeadline = performance.now() + Math.max(0, fish.endsAt - serverNow);
      featureName.textContent = `${fish.name} · ${fish.weightKg} kg · ${fish.reason === 'escaped' ? 'còn quanh hồ' : 'vừa ghé hồ'}`;
      featureReason.textContent = fish.reason === 'escaped'
        ? `Từng làm gãy cần của ${fish.user}` : `${fish.user} chạm 1.000 xèng`;
      const layout = window.PondMapLayouts[fish.mapId];
      const point = layout.waterPoint(.47, layout.top + (layout.bottom - layout.top) * .58);
      featureShadow.style.left = `${point.x}px`;
      featureShadow.style.top = `${point.y}px`;
      renderFeatureClock();
    }
  }

  setInterval(renderFeatureClock, 1000);

  function updatePondActions(world) {
    if (!world) return;
    window.PondAmbience?.updateActions(world);
    pondScene.updateActions(world, activityLive);
  }

  let lastPondSceneTime = 0;
  function updatePondScene(scene) {
    if (Number.isFinite(scene?.serverNow)) {
      if (scene.serverNow < lastPondSceneTime) return;
      lastPondSceneTime = scene.serverNow;
    }
    window.PondAmbience?.update(scene);
    const layout = window.PondMapLayouts[scene?.scenery];
    if (!layout) return;
    if (pondFeature && pondFeature.mapId !== scene.scenery) updatePondFeature(null);
    pondScene.setMap(layout);
    if (particleEngine) {
      particleEngine.water = layout.water;
      particleEngine.useVideoWildlife = Boolean(layout.map.weather);
    }
    demoMap.value = scene.scenery;
    if (demoWeather.dataset.map !== scene.scenery) {
      const labels = layout.map.weather || { sun: 'Nắng', rain: 'Mưa', mist: 'Sương' };
      demoWeather.replaceChildren(...Object.entries(labels).map(([id, label]) => new Option(label, id)));
      demoWeather.dataset.map = scene.scenery;
    }
    if (!demoDock.hidden) {
      renderDemoVotes(scene.poll);
      if (demoFish.dataset.map !== scene.scenery) void loadDemoFish(scene.scenery);
    }
    demoWeather.value = scene.weather;
  }
  const eventFeed = document.getElementById('eventFeed');

  // Modal & Banner
  const catchModal = document.getElementById('catchModal');
  const catchBadge = document.getElementById('catchBadge');
  const catchIcon = document.getElementById('catchIcon');
  const catchFishName = document.getElementById('catchFishName');
  const catchWeight = document.getElementById('catchWeight');
  const catchEffect = document.getElementById('catchEffect');
  const catchMap = document.getElementById('catchMap');
  const catchSale = document.getElementById('catchSale');
  const catchRodBreak = document.getElementById('catchRodBreak');
  const catchRodCost = document.getElementById('catchRodCost');
  const catchWinnerLabel = catchModal.querySelector('.catch-winner-label');
  const catchAnglerName = document.getElementById('catchAnglerName');

  const leviathanBanner = document.getElementById('leviathanBanner');
  const leviathanTitle = document.getElementById('leviathanTitle');
  const leviathanSub = document.getElementById('leviathanSub');

  // 5. Kết nối WebSocket (/ws)
  let ws = null;
  let wsRetryTimer = null;
  let lastWsAt = Date.now();

  function connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      reportCatchNotice(null, 'register');
      for (const notice of pendingCatchNotices.values()) reportCatchNotice(notice, 'queued');
      console.log('[WebSocket] Đã kết nối tới server hồ câu!');
      if (liveDot) liveDot.style.background = '#00e676';
    };

    ws.onclose = () => {
      updateBite(null);
      console.warn('[WebSocket] Mất kết nối, tự kết nối lại sau 2.5s...');
      if (liveDot) liveDot.style.background = '#ff5252';
      window.PondAmbience?.update({ poll: null });
      document.getElementById('pondActionsPanel').hidden = true;
      clearTimeout(wsRetryTimer);
      wsRetryTimer = setTimeout(connectWs, 2500);
    };

    ws.onerror = (err) => {
      console.warn('[WebSocket Error]', err);
    };

    ws.onmessage = (event) => {
      lastWsAt = Date.now();
      try {
        const msg = JSON.parse(event.data);
        handleWsMessage(msg);
      } catch (_) {}
    };
  }

  // Watchdog: nếu WebSocket im lặng quá lâu (kết nối chết ngầm) thì nối lại
  setInterval(() => {
    if (Date.now() - lastWsAt > 30000) {
      console.warn('[WebSocket] Im lặng > 30s — kết nối lại');
      lastWsAt = Date.now();
      try { ws && ws.close(); } catch (_) {}
      clearTimeout(wsRetryTimer);
      wsRetryTimer = setTimeout(connectWs, 500);
    }
  }, 10000);

  let latestPoolNames = [];
  let participantIndex = [];
  const lastFishCache = new Map();
  let personalRotateIdx = 0;
  let priorityCard = null;

  function buildParticipantIndex(st) {
    const idx = new Map();
    const put = (name, kg, count, lastFish, lastKg) => {
      const key = String(name || '').trim();
      if (!key) return;
      const prev = idx.get(key) || { name: key, kg: 0, count: 0, lastFish: '', lastKg: 0 };
      if (kg != null) prev.kg = Math.max(prev.kg || 0, Number(kg) || 0);
      if (count != null) prev.count = Math.max(prev.count || 0, Number(count) || 0);
      if (lastFish && !prev.lastFish) { prev.lastFish = lastFish; prev.lastKg = Number(lastKg) || 0; }
      idx.set(key, prev);
    };
    (st.leaderboard || []).forEach(p => put(p.name, p.totalWeightKg, p.catchesCount, p.lastFishName, p.lastFishKg));
    (st.seatedAnglers || []).forEach(p => put(p.name, p.totalWeightKg, p.catchesCount));
    (st.waitingAnglers || []).forEach(p => put(p.name, p.totalWeightKg, null));
    (st.recentEvents || []).forEach(e => {
      if (e.type === 'hookFish' && e.fish) {
        put(e.user, null, null, e.fish.name, e.weightKg);
        lastFishCache.set(String(e.user), { fish: e.fish.name, kg: e.weightKg });
      }
    });
    for (const [name, info] of lastFishCache.entries()) {
      put(name, null, null, info.fish, info.kg);
    }
    participantIndex = [...idx.values()].filter(p => p.kg > 0 || p.lastFish);
  }

  function renderPersonalCards() {
    const box = document.getElementById('personalCards');
    if (!box) return;
    const list = participantIndex;
    if (!list.length) { box.classList.remove('show'); return; }
    let chosen;
    if (priorityCard) {
      chosen = [priorityCard, ...list.filter(p => p.name !== priorityCard.name).slice(0, 2)];
    } else {
      chosen = Array.from({ length: Math.min(3, list.length) }, (_, i) => list[(personalRotateIdx + i) % list.length]);
    }
    const esc = (v) => String(v ?? '').replace(/[<>&"]/g, '');
    box.innerHTML = chosen.map((p, i) => `
      <div class="pc-card${i === 0 && priorityCard ? ' pc-focus' : ''}">
        <div class="pc-name">${esc(p.name)}</div>
        <div class="pc-stat">${Number(p.kg || 0).toFixed(1)} kg · ${p.count || 0} cá</div>
        <div class="pc-last">${p.lastFish ? `Gần nhất: ${esc(p.lastFish)} ${p.lastKg} kg` : 'Chưa có cá gần đây'}</div>
      </div>`).join('');
    box.classList.add('show');
  }

  function focusPersonalCard(name) {
    const found = participantIndex.find(p => p.name === String(name || '').trim());
    priorityCard = found || { name: String(name || '').trim(), kg: 0, count: 0, lastFish: '', lastKg: 0 };
    renderPersonalCards();
    clearTimeout(window.__pcPriorityTimer);
    window.__pcPriorityTimer = setTimeout(() => { priorityCard = null; renderPersonalCards(); }, 6000);
  }

  let lbMode = 'kg';
  const lbCache = { kg: [], count: [], god: [], revenue: [] };
  setInterval(() => {
    if (participantIndex.length) {
      personalRotateIdx = (personalRotateIdx + 3) % participantIndex.length;
      if (!priorityCard) renderPersonalCards();
    }
  }, 5000);

  // Xem thử thẻ cá: thêm ?demo=catch vào URL
  if (isLocalHost && urlParams.get('demo') === 'catch') {
    setTimeout(() => {
      handleFishingEvent({
        type: 'hookFish', user: 'Minh Anh', uniqueId: 'demo', zoomResult: true,
        weightKg: 42.5,
        fish: { id: 'ca_voi', name: 'Cá Voi Ông Tổ', tier: 4, rarity: 'Huyền Thoại', icon: '🐋' }
      });
    }, 1200);
  }

  function handleWsMessage(msg) {
    if (!msg) return;
    if (msg.method === 'fishing.featuredFish') {
      updatePondFeature(msg.params.fish, msg.params.serverNow);
      return;
    }
    if (msg.method === 'fishing.pondScene') {
      updatePondScene(msg.params);
      return;
    }
    if (msg.method === 'fishing.pondActions') {
      updatePondActions(msg.params);
      return;
    }
    if (msg.method === 'fishing.demoJoin') {
      showDemoJoin(msg.params);
      return;
    }
    if (msg.method === 'fishing.leaderboardReset') {
      window.dispatchEvent(new Event('fishing-leaderboard-reset'));
      return;
    }
    if (msg.method === 'fishing.round') {
      const status = document.getElementById('fishingRoundStatus');
      const round = msg.params || {};
      const result = round.winner ? `${round.winner} bắt được ${round.fish?.name || 'cá'}${round.fish?.tier ? ` — Tier ${round.fish.tier}${round.fish.rarity ? ` (${round.fish.rarity})` : ''}` : ''}${round.weightKg != null ? ` · ${round.weightKg} kg` : ''}` : 'Chưa có ai bắt được cá';
      if (status) status.textContent = `${new Date().toLocaleTimeString('vi-VN')} · ${round.eligible || 0} người đủ điều kiện · ${Math.round((round.chance || 0) * 1000) / 10}% có cá · ${result}`;
      // Nhiều người xem → nhiều người được gọi tên hơn
      const eligibleN = Number(round.eligible) || 0;
      const pickCount = eligibleN >= 40 ? 6 : eligibleN >= 20 ? 4 : 2;
      // Ưu tiên tên suýt trúng thật do server gửi; nếu chưa có thì lấy từ danh sách ghế/chờ
      let picks = Array.isArray(round.nearMiss) ? round.nearMiss.filter(Boolean) : [];
      if (!picks.length) {
        const candidates = latestPoolNames.filter(n => n !== round.winner);
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        picks = candidates.slice(0, pickCount);
      }
      const bar = document.getElementById('nearMissBar');
      const txt = document.getElementById('nearMissText');
      if (bar && txt && picks.length) {
        txt.textContent = `🎣 Đang câu: ${picks.join(' · ')}`;
        bar.classList.add('show');
      }
      return;
    }
    if (msg.method === 'fishing.multiCatch') {
      const grid = document.getElementById('multiCatchGrid');
      const list = Array.isArray(msg.params?.catches) ? msg.params.catches : [];
      const esc = (v) => String(v ?? '').replace(/[<>&"]/g, '');
      if (grid && list.length) {
        const newIds = window.PondCatchArtIds || [];
        grid.innerHTML = list.map(c => `
          <div class="mc-card${c.biggest ? ' mc-big' : ''}">
            <div class="mc-ico">${newIds.includes(c.id)
              ? `<img src="/assets/new_fish/${c.id}.png" alt="" style="height:52px;width:auto;object-fit:contain;">`
              : esc(c.icon || '🐟')}</div>
            <div class="mc-name">${esc(c.name)}</div>
            <div class="mc-kg">${esc(c.kg)} kg</div>
            <div class="mc-user">${esc(c.user)}</div>
          </div>`).join('');
        grid.classList.add('show');
        clearTimeout(window.__multiCatchTimer);
        window.__multiCatchTimer = setTimeout(() => grid.classList.remove('show'), 9500);
      }
      return;
    }
    if (msg.method === 'fishing.bite') {
      updateBite(msg.params, msg.params.serverNow);
      return;
    }
    if (msg.method === 'fishing.anglerReel') {
      const reel = msg.params;
      pondScene.reel(reel, (x, y) => particleEngine?.addFishCatch(x, y, reel.weightKg > 10));
      return;
    }
    if (msg.method === 'fishing.roundReveal') {
      updateBite(null);
      const payload = msg.params || {};
      if (payload.speech) playSyncedCatch(payload.speech, payload.catches?.[0]?.fish, () => playRoundReveal(payload), payload.revealMs);
      else playRoundReveal(payload);
      return;
    }
    if (msg.method === 'fishing.roundCardsDone') {
      if (activeCatchNotice?.roundStep) closeCatchNotice(activeCatchNotice);
      return;
    }
    if (msg.method === 'fishing.preloadCatchAudio' || msg.method === 'tts.preload') {
      const { url, fish } = msg.params || {};
      window.CatchRewardVisuals?.preload(fish);
      const audio = window.FishingAudio;
      if (audio?.ttsEnabled && !audio.silentSecondary && typeof url === 'string' && url.startsWith('/tts-cache/')) {
        audio.preloadSpeech(url);
      }
      return;
    }
    if (msg.method === 'fishing.reset') {
      window.location.reload();
      return;
    }
    if (msg.method === 'fishing.comment') {
      pondScene.showComment(msg.params || {});
      if (msg.params?.user) focusPersonalCard(msg.params.user);
      return;
    }
    if (msg.method === 'tts.play') {
      const audio = window.FishingAudio;
      const { text, voice, url, rate, isCatch, sequenceId, queuedAnnouncement, pondScene } = msg.params || {};
      let sceneShown = false;
      const showScene = () => {
        if (pondScene && !sceneShown) {
          sceneShown = true;
          updatePondScene(pondScene);
        }
      };
      const onEnd = result => {
        showScene();
        reportCatchNotice({ id: sequenceId }, 'closed', result?.played === true);
      };
      if (!audio?.unlocked || audio.silentSecondary || !audio.ttsEnabled || !text || !url) onEnd();
      else audio.enqueueTts(text, { voice, url, rate, isCatch, sequenceId, priority: true, queuedAnnouncement,
        onPlaying: showScene, onEnd });
      return;
    }

    // Trạng thái hồ câu
    if (msg.method === 'fishing.state' || msg.method === 'temple.state') {
      updatePublicState(msg.params);
    }
    // Sự kiện tương tác thời gian thực
    else if (msg.method === 'fishing.event' || msg.method === 'temple.event') {
      if (msg.params?.state) updatePublicState(msg.params.state);
      const eventData = msg.params?.event;
      if (eventData && eventData.type === 'hookFish' && eventData.user && eventData.fish) {
        lastFishCache.set(String(eventData.user), {
          fish: eventData.fish.name,
          kg: eventData.weightKg ?? eventData.fish.weightKg ?? 0
        });
      }
      if (eventData && msg.params.speech) playSyncedCatch(msg.params.speech, eventData.fish, () => handleFishingEvent(eventData), eventData.zoomResult ? 6000 : 2000);
      else if (eventData) handleFishingEvent(eventData);
    }
    // Số người xem live
    else if (msg.method === 'fishing.viewerCount' || msg.method === 'temple.viewerCount') {
      const count = msg.params?.viewerCount || 0;
      if (liveStatusText) {
        liveStatusText.textContent = `HỒ CÂU CÁ • ${count} NGƯỜI XEM`;
      }
    }
  }

  // 6. Cập nhật giao diện hồ câu từ trạng thái
  function updatePublicState(st) {
    smallCatchCards = Boolean(st.demo?.smallCatchCards);
    const rawNames = [...(st.seatedAnglers || []), ...(st.waitingAnglers || [])]
      .map(p => typeof p === 'string' ? p : (p && p.name))
      .filter(Boolean);
    latestPoolNames = [...new Set(rawNames)];
    lbCache.god = Array.isArray(st.cauThanHall) ? st.cauThanHall : [];
    lbCache.count = Array.isArray(st.leaderboardByCount) ? st.leaderboardByCount : [];
    lbCache.revenue = Array.isArray(st.revenueLeaderboard) ? st.revenueLeaderboard : [];
    buildParticipantIndex(st);
    if (!st) return;
    if (st.demo && !isObsMode && !isPublicViewer) {
      if (showDemoControls) updateDemoDock(st.demo, st.settings, st.seating);
      else document.getElementById('demoControlsLink').hidden = false;
    }
    window.dispatchEvent(new CustomEvent('fishing-public-state', {detail:st}));
    updatePondScene(st.pondScene);
    updatePondFeature(st.featuredFish, st.serverNow);
    const tunnelInput = document.getElementById('inputPublicTunnelUrl');
    if (tunnelInput) tunnelInput.value = st.publicTunnelUrl || 'Tunnel đang tắt — dùng địa chỉ local';
    const audio = window.FishingAudio;
    if (audio && st.settings) {
      if (st.demo) audio.silentSecondary = isObsMode;
      audio.ttsVoice = st.settings.ttsVoice || 'default';
      audio.ttsSpeed = st.settings.ttsSpeed || 1;
      audio.ttsEnabled = (st.settings.ttsEnabled !== false) && !audio.silentSecondary;
      audio.sfxEnabled = (st.settings.sfxEnabled !== false) && !audio.silentSecondary;
      audio.bgMusicEnabled = (st.settings.bgMusicEnabled !== false) && !audio.silentSecondary;
      if (Number.isFinite(st.settings.ttsVolume)) audio.setTtsVolume(st.settings.ttsVolume);
      if (Number.isFinite(st.settings.musicVolume)) audio.setMusicVolume(st.settings.musicVolume);
    }
    if (audio) audio.hasObsClient = Boolean(st.hasObsClient);
    if (st.settings) {
      for (const [slider, label, value] of [
        ['sliderMusicVol', 'valMusicVol', st.settings.musicVolume],
        ['sliderTtsVol', 'valTtsVol', st.settings.ttsVolume]
      ]) {
        if (!Number.isFinite(value)) continue;
        const control = document.getElementById(slider);
        if (control && document.activeElement !== control) control.value = Math.round(value * 100);
        const output = document.getElementById(label);
        if (output) output.textContent = `${Math.round(value * 100)}%`;
      }
    }


    if (statCatches) statCatches.textContent = st.totalCatches ?? 0;
    if (statWeight) statWeight.textContent = st.totalWeightKg ?? '0.0';
    if (statBait) statBait.textContent = st.totalBait ?? 0;
    if (statHorn) statHorn.textContent = st.hornsBlown ?? 0;

    // Cập nhật bảng xếp hạng VUA SÁT CÁ
    if (leaderboardList && Array.isArray(st.leaderboard)) {
      renderLeaderboard(st.leaderboard);
    }
    pondScene.demoPlayerId = st.demo?.playerId;
    pondSeatCommand.hidden = newBaitGuide.hidden = !st.hasPondCommands;
    legacyBaitGuide.hidden = Boolean(st.hasPondCommands);
    renderVipStools(st.seatedAnglers || st.leaderboard || [], Boolean(st.hasPondCommands));
    updateBite(st.bite, st.serverNow);
    activityLive = Boolean(st.demo || st.demoClosing || st.tiktok?.connected) && st.closingPhase === 'open';
    const demoSaleButton = document.getElementById('btnDemoSaleRound');
    if (demoSaleButton) demoSaleButton.hidden = !st.demoClosing;
    updatePondActions(st.pondActions);

    // Phát hiện người mới ngồi vào ghế → nhấp nháy bảng hướng dẫn
    const seatIds = (st.seatedAnglers || []).map((p) => p.uniqueId || p.name).filter(Boolean);
    if (seatIds.length) {
      if (!knownSeatIds) {
        knownSeatIds = new Set(seatIds);
      } else {
        let hasNew = false;
        let newName = '';
        for (const id of seatIds) {
          if (!knownSeatIds.has(id)) {
            knownSeatIds.add(id);
            hasNew = true;
            const person = (st.seatedAnglers || []).find((p) => (p.uniqueId || p.name) === id);
            if (person && !newName) newName = person.name;
          }
        }
        if (hasNew && newName) {
          if (st.demo) showDemoJoin({ user: newName, message: 'Vừa vào hồ' });
          else showViewerGreeting(newName);
        }
      }
    }
    // Hàng chờ ghế
    const waitingBar = document.getElementById('waitingBar');
    const waitingNames = document.getElementById('waitingNames');
    if (waitingBar && waitingNames) {
      const list = Array.isArray(st.waitingAnglers) ? st.waitingAnglers : [];
      if (list.length) {
        const names = list.slice(0, 3).map(p => p.name).join(' · ');
        waitingNames.textContent = `${list.length} người — ${names}${list.length > 3 ? ' …' : ''}`;
        waitingBar.style.display = 'flex';
      } else {
        waitingBar.style.display = 'none';
      }
    }
    window.FishingSimulationControls?.update(st);
    const seatingStatus = document.getElementById('seatingStatus');
    if (seatingStatus && st.seating) {
      seatingStatus.textContent = `Ghế: ${st.seating.occupied}/${st.seating.capacity} · Người thật: ${st.seating.real} · Giả lập: ${st.seating.simulated}${st.seating.waiting ? ` · Đang chờ ghế: ${st.seating.waiting}` : ''}`;
    }
    if (st.settings) {
      autoSimState = Boolean(st.settings.autoSim);
      const toggle = document.getElementById('btnToggleAutoSim');
      if (toggle) {
        toggle.textContent = `🤖 Tự động Giả lập: ${autoSimState ? 'BẬT' : 'TẮT'}`;
        toggle.classList.toggle('gold', autoSimState);
      }
    }

    // Cập nhật trạng thái TikTok
    if (st.tiktok && liveStatusText) {
      if (st.demo) {
        liveStatusText.textContent = `CHẠY THỬ • ${st.demo.actors.length} NHÂN VẬT`;
        if (liveDot) liveDot.style.background = '#6bf1d1';
      } else if (st.demoClosing) {
        liveStatusText.textContent = 'CHẠY THỬ • CHỐT HỒ';
        if (liveDot) liveDot.style.background = '#6bf1d1';
      } else if (st.tiktok.connected) {
        liveStatusText.textContent = `@${st.tiktok.username} • ${st.tiktok.viewerCount || 0} NGƯỜI XEM`;
        if (liveDot) liveDot.style.background = '#00e676';
      } else if (st.tiktok.connecting) {
        liveStatusText.textContent = `ĐANG KẾT NỐI @${st.tiktok.username}...`;
        if (liveDot) liveDot.style.background = '#ffea00';
      } else {
        liveStatusText.textContent = 'HỒ CÂU • CHỜ KẾT NỐI';
        if (liveDot) liveDot.style.background = '#a6bbb4';
      }
    }
  }

  function renderLeaderboardRows() {
    const isGod = lbMode === 'god';
    const isRevenue = lbMode === 'revenue';
    const isCount = lbMode === 'count';
    const raw = lbCache[lbMode];
    const board = isGod
      ? [...raw].sort((a, b) => (b.kg || 0) - (a.kg || 0))
      : isRevenue ? [...raw].sort((a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0))
        : isCount ? raw
        : [...raw].sort((a, b) => (b.totalWeightKg || 0) - (a.totalWeightKg || 0));
    const header = document.getElementById('lbHeader');
    if (header) header.textContent = isGod ? '🏆 THẦN CÂU CÁ' : isRevenue ? '💰 TOP XÈNG'
      : isCount ? '🐟 TOP SỐ CÁ' : '👑 VUA SÁT CÁ BỜ HỒ';
    leaderboardList.innerHTML = '';
    board.slice(0, 8).forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      const rank = idx + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
      const sleeping = '';
      const value = isGod ? `${item.kg}kg` : isRevenue ? `${item.totalRevenue || 0} xèng` : `${item.totalWeightKg}kg`;
      const catches = isGod ? item.catches : item.catchesCount;
      row.innerHTML = `
        <div class="lb-left">
          <span class="lb-rank">${medal}</span>
          <span class="lb-name" title="${item.name}">${item.name}${sleeping}</span>
        </div>
        <div class="lb-right">
          <span class="lb-weight">${isCount ? `${catches || 0} cá` : value}</span>
          <span class="lb-count">${isCount ? value : `${catches || 0} cá`}</span>
        </div>
      `;
      leaderboardList.appendChild(row);
    });
  }

  // Cứ 12 giây đổi bảng xếp hạng.
  setInterval(() => {
    const modes = ['kg'];
    if (lbCache.count.length) modes.push('count');
    if (lbCache.revenue.length) modes.push('revenue');
    if (lbCache.god.length) modes.push('god');
    lbMode = modes[(modes.indexOf(lbMode) + 1) % modes.length];
    renderLeaderboardRows();
  }, 12000);

  let knownSeatIds = null;

  // Chào tên người mới vào
  // Lời chào người mới vào (trung tính, không kêu gọi tương tác)
  const VIEWER_GREETINGS = [
    ['Chào {n} 👋', 'Ngồi hồ ngắm cá cho thư giãn nha'],
    ['{n} ghé hồ rồi 🎣', 'Cứ xem, cá sẽ tự cắn câu'],
    ['Mừng {n} đến bờ hồ 🌊', 'Một buổi thật nhẹ nhàng nha'],
    ['{n} vào hồ ✨', 'Chúc ngắm hồ vui vẻ'],
    ['Hế lô {n} 👋', 'Ngồi chơi ngắm cá nha']
  ];
  let greetIdx = 0;

  function showViewerGreeting(name) {
    const stage = document.getElementById('stage9x16');
    if (!stage || !name) return;
    let el = document.getElementById('viewerGreeting');
    if (!el) {
      el = document.createElement('div');
      el.id = 'viewerGreeting';
      stage.appendChild(el);
    }
    const safeName = String(name).replace(/[<>&]/g, '');
    const pair = VIEWER_GREETINGS[greetIdx % VIEWER_GREETINGS.length];
    greetIdx++;
    el.innerHTML = `<div class="vg-l1">${pair[0].replace(/\{n\}/g, safeName)}</div>`
      + `<div class="vg-l2">${pair[1]}</div>`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(showViewerGreeting._t);
    showViewerGreeting._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // Dòng chạy chữ: top 3 Vua Sát Cá
  function renderTopTicker(board) {
    const track = document.getElementById('topTickerTrack');
    if (!track) return;
    const top = (Array.isArray(board) ? board : []).slice(0, 3);
    let full;
    if (!top.length) {
      full = '👑 VUA SÁT CÁ — chưa có ai câu cá        •        ';
    } else {
      const medals = ['🥇', '🥈', '🥉'];
      const line = top.map((p, i) =>
        `${medals[i]} ${p.name} ${p.totalWeightKg}kg · ${p.catchesCount || 0} cá`
      ).join('        ');
      full = `${line}        •        `;
    }
    if (track.dataset.text === full) return;
    track.dataset.text = full;
    track.innerHTML = `<span>${full}</span><span>${full}</span>`;
    track.style.animation = 'none';
    void track.offsetWidth;
    track.style.animation = '';
  }

  function renderLeaderboard(board) {
    // Ai rời live thì biến mất khỏi bảng; vào lại hiện lại kèm điểm cũ
    lbCache.kg = (Array.isArray(board) ? board : []).filter(p => p.active !== false);
    renderLeaderboardRows();
    renderTopTicker(lbCache.kg);
  }

  function renderVipStools(board, serverSeats) {
    pondScene.render(board, serverSeats);
  }

  // 7. Xử lý hoạt ảnh sự kiện tương tác
  let catchModalTimer = null;
  let activeCatchNotice = null;
  const pendingCatchNotices = new Map();
  // ===== PHÁT TUẦN TỰ TỐI ĐA 5 CON CÁ: khoảng 2 giây/con =====
  function playSyncedCatch(playback, fish, showCard, revealMs = 2000) {
    const audio = window.FishingAudio;
    const { text, url, sequenceId, durationMs, ...speech } = playback;
    let timeout;
    let shownAt = null;
    let notice = null;
    let done = false;
    const reveal = () => {
      if (shownAt !== null) return;
      shownAt = performance.now();
      const previous = activeCatchNotice;
      showCard();
      if (activeCatchNotice !== previous) notice = activeCatchNotice;
    };
    const finish = result => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      reveal();
      reportCatchNotice({ id: sequenceId }, 'closed', result?.played === true);
      if (notice) {
        const remaining = revealMs - (performance.now() - shownAt);
        if (remaining > 0) setTimeout(() => closeCatchNotice(notice), remaining);
        else closeCatchNotice(notice);
      }
    };
    if (!audio?.unlocked || !audio.ttsEnabled || audio.silentSecondary || !text || !url) return finish();

    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 1500);
    const onPlaying = () => {
      reveal();
      if (notice) clearTimeout(catchModalTimer);
      clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(), (durationMs || 15000) + 3500);
    };
    controller.signal.addEventListener('abort', finish, { once: true });
    Promise.resolve(window.CatchRewardVisuals?.preload(fish)).then(() => {
      if (controller.signal.aborted) return;
      audio.enqueueTts(text, { ...speech, url, sequenceId, priority: true, signal: controller.signal,
        onPlaying, onEnd: finish });
    });
  }

  function playRoundReveal(payload) {
    const list = Array.isArray(payload.catches) ? payload.catches : [];
    if (smallCatchCards && list.every(event => !event.zoomResult)) {
      for (const event of list) {
        pondScene.showCatch(event);
        if (!['rodBreak', 'catchMiss'].includes(event.type)) window.FishingAudio?.playCatchTing();
      }
      return;
    }
    if (!list.length || !catchModal) return;

    const perMs = Math.max(600, Number(payload.revealMs) || 2000);
    const token = (window.__revealToken = (window.__revealToken || 0) + 1);
    const isCurrent = () => token === window.__revealToken;

    const twistLabel = document.getElementById('revealTwistLabel');
    const card = catchModal.querySelector('.catch-card');
    const audio = window.FishingAudio;

    // Đóng thẻ cũ (nếu còn) trước khi bắt đầu chuỗi mới
    if (activeCatchNotice) closeCatchNotice();

    const showOne = (idx) => {
      if (!isCurrent()) return;
      const c = list[idx];
      if (!c) return;
      const isFinal = c.isFinal ?? idx === list.length - 1;
      const missed = c.type === 'rodBreak' || c.type === 'catchMiss';
      renderCatchCard(c);
      if (twistLabel) {
        twistLabel.textContent = (isFinal && payload.twist && !missed) ? '😅 Cú lừa: con nhỏ nhất về đích!' : '';
      }

      catchModal.classList.add('active');
      if (card) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }

      if (!missed) audio?.playCatchTing();

      if (isFinal || payload.step) {
        const notice = { id: `reveal:${Date.now()}`, closed: false, roundStep: Boolean(payload.step) };
        activeCatchNotice = notice;
        window.__catchCloseNotice = notice;
        clearTimeout(catchModalTimer);
        catchModalTimer = setTimeout(() => closeCatchNotice(notice), document.body.classList.contains('pond-demo') ? 25000 : 15000);
        if (isFinal && !missed) {
          playBigFishEffect(Number(c.weightKg) || 0);
        }
      } else {
        setTimeout(() => showOne(idx + 1), perMs);
      }
    };

    showOne(0);
  }

  function renderCatchCard(event) {
    const { fish, saleXu, rodCostXu } = event;
    const missed = event.type === 'rodBreak' || event.type === 'catchMiss';
    catchModal.querySelector('.catch-card').classList.toggle('is-rod-break', event.type === 'rodBreak');
    catchModal.querySelector('.catch-card').classList.toggle('is-missed', missed);
    catchBadge.textContent = missed ? '😝 CÂU HỤT RỒI!' : '🎉 CHÚC MỪNG!';
    document.getElementById('catchMessage').textContent = missed ? 'Cá thắng 1–0! Hẹn phục thù nha 😝' : 'Kéo đẹp lắm, cá đã lên bờ!';
    catchBadge.style.background = missed ? '#f0a18d' : '#f5d578';
    if (window.CatchRewardVisuals) window.CatchRewardVisuals.render(event);
    else catchIcon.textContent = fish?.icon || '🐟';
    catchFishName.textContent = fish?.name || 'Cá Nước Ngọt';
    catchWeight.textContent = `${Number(event.weightKg).toLocaleString('vi-VN')} kg`;
    catchAnglerName.textContent = event.user;
    catchWinnerLabel.textContent = missed ? 'CẦN THỦ VỪA HỤT CÁ' : 'CẦN THỦ VỪA BẮT ĐƯỢC';
    const mutation = missed ? null : fish?.anomalyEffect || fish?.mutation;
    const map = window.PondMaps.find(item => item.id === fish?.mapId);
    catchMap.hidden = !map;
    catchMap.textContent = map?.name || '';
    if (catchEffect) {
      catchEffect.hidden = !mutation;
      catchEffect.dataset.effect = mutation?.id || '';
      const label = mutation ? (mutation.description && mutation.multiplier === 0
        ? mutation.name : `${mutation.name} ×${String(mutation.multiplier).replace('.', ',')}`) : '';
      catchEffect.textContent = !missed && fish?.anomalyEffect && fish.mutation
        ? `${label} · ${fish.mutation.name}` : label;
    }
    if (catchSale) {
      catchSale.hidden = missed || saleXu == null || !Number.isFinite(Number(saleXu));
      catchSale.textContent = catchSale.hidden ? '' : `${saleXu} xèng`;
      catchSale.classList.toggle('is-zero', saleXu === 0);
    }
    if (catchRodBreak) {
      const fee = event.type === 'rodBreak' ? { reason: 'Gãy cần', xu: rodCostXu } : !missed && fish?.isTrash && fish.catchFee;
      catchRodBreak.hidden = !fee?.xu;
      catchRodCost.textContent = fee?.xu ? `${fee.reason} · −${fee.xu} xèng` : '';
    }
  }

  function reportCatchNotice(notice, phase, played) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ method: 'client.catchNotice', params: { id: notice?.id, phase, played } }));
  }
  function closeCatchNotice(notice = activeCatchNotice) {
    if (!notice || notice.closed) return;
    notice.closed = true;
    if (window.__catchCloseNotice === notice) window.__catchCloseNotice = null;
    pendingCatchNotices.delete(notice.id);
    reportCatchNotice(notice, 'closed');
    if (activeCatchNotice === notice) {
      catchModal?.classList.remove('active');
      activeCatchNotice = null;
      clearTimeout(catchModalTimer);
    }
  }
  let bannerTimer = null;

  // Hiệu ứng cá to — TO DẦN theo cân nặng (bắt đầu từ 10kg)
  function playBigFishEffect(kg) {
    const stage = document.getElementById('stage9x16');
    if (!stage) return;
    const value = Number(kg) || 0;
    if (value < 10) return;

    const t = Math.min(1, (value - 10) / 80);           // 10kg → 0 | 90kg → 1
    const mix = (a, b) => Math.round(a + (b - a) * t);
    const r = 255, g = mix(214, 78), b = mix(90, 36);   // vàng → đỏ cam

    const size = Math.round(140 + 260 * t);             // 140 → 400 px
    const border = (4 + 11 * t).toFixed(1);             // 4 → 15 px
    const grow = (2.6 + 2.6 * t).toFixed(2);            // 2.6 → 5.2
    const dur = (1.0 + 1.1 * t).toFixed(2);             // 1.0 → 2.1 s
    const peak = (0.55 + 0.40 * t).toFixed(2);          // 0.55 → 0.95
    const spread = Math.round(55 + 22 * t);             // 55 → 77 %
    const glow = Math.round(12 + 88 * t);               // 12 → 100 px

    let flash = document.getElementById('bigFishFlash');
    if (!flash) {
      flash = document.createElement('div');
      flash.id = 'bigFishFlash';
      stage.appendChild(flash);
    }
    let ring = document.getElementById('bigFishRing');
    if (!ring) {
      ring = document.createElement('div');
      ring.id = 'bigFishRing';
      ring.className = 'bigfish-ring';
      stage.appendChild(ring);
    }

    flash.style.setProperty('--bf-color', `rgba(${r}, ${g}, ${b}, 0.78)`);
    flash.style.setProperty('--bf-spread', spread + '%');
    flash.style.setProperty('--bf-dur', dur + 's');
    flash.style.setProperty('--bf-peak', peak);

    ring.style.setProperty('--bf-size', size + 'px');
    ring.style.setProperty('--bf-border', border + 'px');
    ring.style.setProperty('--bf-ring', `rgba(${r}, ${g}, ${b}, 0.95)`);
    ring.style.setProperty('--bf-grow', grow);
    ring.style.setProperty('--bf-dur', dur + 's');

    flash.className = '';
    ring.className = 'bigfish-ring';
    void flash.offsetWidth;
    flash.className = 'on';
    ring.className = 'bigfish-ring on';

    stage.style.boxShadow = `inset 0 0 ${glow}px rgba(${r}, ${g}, ${b}, 0.6)`;

    clearTimeout(playBigFishEffect._timer);
    playBigFishEffect._timer = setTimeout(() => {
      flash.className = '';
      ring.className = 'bigfish-ring';
      stage.style.boxShadow = '';
    }, Math.round(parseFloat(dur) * 1000) + 400);
  }

  function handleFishingEvent(ev) {
    appendEventFeed(ev);
    if (smallCatchCards && !ev.zoomResult && ['hookFish', 'catchBigFish', 'catchLeviathan', 'rodBreak', 'catchMiss'].includes(ev.type)) {
      pondScene.showCatch(ev);
      if (!['rodBreak', 'catchMiss'].includes(ev.type)) window.FishingAudio?.playCatchTing();
      if (activeAnglerName) activeAnglerName.textContent = ev.user;
      if (activeActionTag) activeActionTag.textContent = ev.type === 'rodBreak' ? 'Gãy cần, hụt cá' : ev.type === 'catchMiss' ? 'Cá tuột mất rồi' : `${ev.fish?.name} · ${ev.weightKg} kg`;
      return;
    }
    const waterPoint = pondScene.playEvent(ev);

    // Kích hoạt âm thanh & giọng đọc
    const audio = window.FishingAudio;

    switch (ev.type) {
      // 1. Thả thính / Ném mồi
      case 'castBait':
        if (audio) audio.playWaterDrop();
        if (particleEngine) particleEngine.addBaitDrop(waterPoint.x, waterPoint.y, ev.count || 1);
        if (activeAnglerName) activeAnglerName.textContent = ev.user;
        if (activeActionTag) activeActionTag.textContent = `Thả ${ev.count || 1} nắm thính thơm`;
        break;

      // 2. Quăng cần
      case 'castRod':
        if (audio) {
          audio.playRodWhoosh();
          audio.playWaterDrop(1.2);
        }
        if (particleEngine) particleEngine.addBaitDrop(waterPoint.x, waterPoint.y, 2);
        if (anglerWishBubble) anglerWishBubble.textContent = `“${ev.wish || 'Quăng cần thả phao!'}”`;
        if (anglerName) anglerName.textContent = ev.user;
        if (anglerAction) anglerAction.textContent = '✨ Quăng cần thả phao';
        if (activeAnglerName) activeAnglerName.textContent = ev.user;
        if (activeActionTag) activeActionTag.textContent = 'Vừa vung cần thả phao';

        if (ev.ttsText && audio) {
          audio.enqueueTts(ev.ttsText);
        }
        break;

      // 3. Giật cần lên cá (Hook Fish)
      case 'hookFish':
      case 'catchBigFish':
      case 'catchLeviathan':
      case 'rodBreak':
      case 'catchMiss':
        const missed = ev.type === 'rodBreak' || ev.type === 'catchMiss';
        const missLabel = ev.type === 'rodBreak' ? 'Gãy cần, hụt cá' : 'Cá tuột mất rồi';
        if (ev.zoomResult) updateBite(null);
        const isLeviathan = ev.type === 'catchLeviathan';
        const isBig = ev.type === 'catchBigFish' || isLeviathan;

        // Hiệu ứng theo cân nặng: 10 / 20 / 50 kg
        if (!missed) playBigFishEffect(ev.weightKg);

        // Rung lắc phao câu
        if (bobberBody) {
          bobberBody.classList.add('hooked');
          setTimeout(() => bobberBody.classList.remove('hooked'), 3200);
        }

        // Cần thủ giật cần
        if (anglerSpriteImg) {
          anglerSpriteImg.classList.add('reeling');
          setTimeout(() => anglerSpriteImg.classList.remove('reeling'), 3000);
        }

        // Âm thanh
        if (!missed) audio?.playCatchTing();

        // Hiệu ứng hạt nước
        if (particleEngine && !missed) {
          particleEngine.addFishCatch(waterPoint.x, waterPoint.y, isBig);
        }

        // Cập nhật thông tin cần thủ
        if (anglerWishBubble && ev.wish) {
          anglerWishBubble.textContent = `“${ev.wish}”`;
        }
        if (anglerName) anglerName.textContent = ev.user;
        if (anglerAction) {
          anglerAction.textContent = missed ? missLabel : `🐟 Bắt được ${ev.fish?.name || 'Cá'} (${ev.weightKg}kg)`;
        }

        if (activeAnglerName) activeAnglerName.textContent = ev.user;
        if (activeActionTag) {
          activeActionTag.textContent = missed ? missLabel : `Vừa giật được ${ev.fish?.name || 'Cá to'} ${ev.weightKg}kg`;
        }

        // Mở Modal Chiến Tích Bắt Cá đồng bộ Giọng Đọc
        const notice = { id: ev.id || `local:${Date.now()}:${Math.random()}`, closed: false };
        pendingCatchNotices.set(notice.id, notice);
        reportCatchNotice(notice, 'queued');
        const showCatchNotice = (withTimer = true) => {
          if (!ev.fish || !catchModal || notice.closed) return;
          // Đang đọc cá trước → xếp hàng, không cắt ngang
          if (activeCatchNotice && activeCatchNotice.voiceDone === false) {
            window.__pendingCatchNotices = window.__pendingCatchNotices || [];
            window.__pendingCatchNotices.push(() => showCatchNotice(false));
            // Giữ tối đa 3 thẻ chờ — bỏ cái cũ nhất
            if (window.__pendingCatchNotices.length > 3) window.__pendingCatchNotices.shift();
            return;
          }
          if (activeCatchNotice !== notice) closeCatchNotice();
          activeCatchNotice = notice;
          reportCatchNotice(notice, 'open');
          renderCatchCard(ev);
          document.getElementById('revealTwistLabel').textContent = '';

          catchModal.classList.add('active');
          clearTimeout(catchModalTimer);
          // Thẻ chỉ đóng khi giọng đọc xong; 20 giây là chốt an toàn
          clearTimeout(catchModalTimer);
          catchModalTimer = setTimeout(() => closeCatchNotice(notice), ev.zoomResult ? 6000 : 20000);
        };
        // Hiện thẻ ngay, giữ tới khi đọc xong
        showCatchNotice(false);
        window.__catchCloseNotice = notice;

        // Banner Thủy Quái
        if (isLeviathan && leviathanBanner) {
          leviathanTitle.textContent = `🐉 ${ev.fish?.name?.toUpperCase() || 'THỦY QUÁI XUẤT THẾ'} 🐉`;
          leviathanSub.textContent = `Đại cần thủ ${ev.user} bắt được thủy quái nặng ${ev.weightKg}kg!`;
          leviathanBanner.classList.add('active');
          clearTimeout(bannerTimer);
          bannerTimer = setTimeout(() => {
            leviathanBanner.classList.remove('active');
          }, 7000);
        }

        // Phát giọng đọc ZeroTTS
        // Mọi lời chúc mừng (cá to lẫn cá bé) đều do SERVER tổng hợp và phát qua tts.play.
        break;

      // 5. Cảm ơn quà tặng (không cho cá)
      case 'giftThanks':
        if (leviathanBanner) {
          leviathanTitle.textContent = `🎁 CẢM ƠN ${(ev.user || '').toUpperCase()}`;
          leviathanSub.textContent = `Đã tặng ${ev.giftName || 'quà'} — cảm ơn bạn nhiều!`;
          leviathanBanner.classList.add('active');
          clearTimeout(bannerTimer);
          bannerTimer = setTimeout(() => {
            leviathanBanner.classList.remove('active');
          }, 5000);
        }
        if (audio) audio.playCelebrationChime();
        if (particleEngine) particleEngine.addFishCatch(waterPoint.x, waterPoint.y, true);
        break;

      // 4. Thổi còi báo cá
      case 'soundHorn':
        if (audio) audio.playAirHorn();
        if (particleEngine) particleEngine.addFishCatch(waterPoint.x, waterPoint.y, false);
        if (activeAnglerName) activeAnglerName.textContent = ev.user;
        if (activeActionTag) activeActionTag.textContent = 'Thổi còi báo cá vang rền bến hồ';
        if (ev.ttsText && audio) {
          audio.enqueueTts(ev.ttsText);
        }
        break;
    }
  }

  function appendEventFeed(ev) {
    if (!eventFeed) return;
    const item = document.createElement('div');
    item.className = 'feed-item';
    const timeStr = new Date().toLocaleTimeString('vi-VN');
    const label = document.createElement('strong');
    label.textContent = `[${timeStr}] ${ev.user}`;
    const detail = ev.type === 'rodBreak' ? 'Gãy cần, hụt cá' : ev.type === 'catchMiss' ? `Câu hụt ${ev.fish?.name} (${ev.weightKg}kg)` : ev.type === 'hookFish' ? `Giật được ${ev.fish?.name} (${ev.weightKg}kg)` : ev.type === 'castBait' ? `Thả ${ev.count} mồi thính` : ev.type === 'soundHorn' ? 'Thổi còi báo cá' : 'Quăng cần thả phao';
    item.append(label, `: ${detail}`);
    eventFeed.prepend(item);
    if (eventFeed.children.length > 25) {
      eventFeed.removeChild(eventFeed.lastChild);
    }
  }

  // 8. Đăng ký các nút bấm tương tác trực tiếp
  async function callRpc(method, params = {}) {
    if (['fishing.castBait','fishing.castRod','fishing.hookFish','fishing.soundHorn','fishing.catchBigFish','fishing.catchLeviathan'].includes(method)) {
      const user = String(params.user || '').trim() || 'Cần thủ ẩn danh';
      const selected = window.FishingSimulationControls?.selected();
      params = { ...params, user: selected?.name || user, uniqueId: selected?.uniqueId || `sim:rpc:${encodeURIComponent(user)}`, avatar: selected?.avatar || '', selectedSimulated: Boolean(selected) };
    }
    try {
      const res = await fetch('/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params
        })
      });
      return await res.json();
    } catch (e) {
      console.warn('[RPC Error]', e.message);
      return null;
    }
  }

  const demoDock = document.getElementById('demoDock');
  const demoMap = document.getElementById('demoMap');
  const demoWeather = document.getElementById('demoWeather');
  const demoAnomalyControls = document.getElementById('demoAnomalyControls');
  demoAnomalyControls?.addEventListener('submit', async event => {
    event.preventDefault();
    const choice = document.getElementById('demoAnomalyChoice');
    const status = document.getElementById('demoAnomalyStatus');
    const audio = window.FishingAudio;
    if (audio?.ttsEnabled && !audio.silentSecondary) audio.ensureContext();
    const reply = await callRpc('demo.anomaly', { id: choice.value });
    status.textContent = reply?.result?.queued ? 'Đã xếp dị tượng vào lượt phát.'
      : reply?.error?.message || 'Chưa kết nối được hồ thử.';
  });
  demoMap.replaceChildren(...window.PondMaps.map(({ id, name }) => new Option(name, id)));
  demoMap.addEventListener('change', async () => {
    const reply = await callRpc('demo.map', { id: demoMap.value });
    if (reply?.result) updatePondScene(reply.result);
  });
  demoWeather.addEventListener('change', async () => {
    const reply = await callRpc('demo.weather', { id: demoWeather.value });
    if (reply?.result) updatePondScene(reply.result);
  });
  const demoActor = document.getElementById('demoActor');
  const demoStatus = document.getElementById('demoStatus');
  const demoChatText = document.getElementById('demoChatText');
  const demoGuestCount = document.getElementById('demoGuestCount');
  const demoGuests = document.getElementById('demoGuests');
  const demoRosterStatus = document.getElementById('demoRosterStatus');
  const demoFish = document.getElementById('demoFish');
  const demoWeight = document.getElementById('demoWeight');
  const demoOutcome = document.getElementById('demoOutcome');
  const demoCatchButton = document.getElementById('demoCatchButton');
  const demoBiteButton = document.getElementById('demoBiteButton');
  const demoCatchStatus = document.getElementById('demoCatchStatus');
  const demoAutoRounds = document.getElementById('demoAutoRounds');
  const demoAudio = document.getElementById('demoAudio');
  const demoBallot = document.getElementById('demoBallot');
  const demoVoteOptions = document.getElementById('demoVoteOptions');
  const demoJoinStatus = document.getElementById('demoJoinStatus');
  let demoJoinTimer;

  function showDemoJoin({ user, message }) {
    if (!document.body.classList.contains('pond-demo')) return;
    clearTimeout(demoJoinTimer);
    demoJoinStatus.textContent = `@${user} · ${message}`;
    demoJoinTimer = setTimeout(() => { demoJoinStatus.textContent = ''; }, 3500);
  }

  function renderDemoVotes(poll) {
    const active = poll?.kind === 'scenery';
    demoBallot.disabled = active;
    demoVoteOptions.hidden = !active;
    const key = active ? String(poll.endsAt) : '';
    if (demoVoteOptions.dataset.ballot === key) return;
    demoVoteOptions.dataset.ballot = key;
    demoVoteOptions.replaceChildren(...(active ? poll.options.map(({ label }, index) => {
      const button = document.createElement('button');
      button.className = 'dock-btn';
      button.type = 'button';
      button.dataset.demoChat = String(index + 1);
      button.textContent = `${index + 1} · ${label}`;
      return button;
    }) : []));
  }

  function updateDemoDock(demo, settings, seating) {
    if (!document.body.classList.contains('pond-demo')) {
      document.body.classList.add('pond-demo');
      if (demoAnomalyControls) demoWeather.insertAdjacentElement('afterend', demoAnomalyControls);
      resizeStage();
    }
    demoDock.hidden = false;
    const actors = demo.actors.map(person => person.uniqueId).join(',');
    if (demoActor.dataset.actors !== actors) {
      const selected = demoActor.value;
      demoActor.replaceChildren(...demo.actors.map(person => new Option(person.user, person.uniqueId)));
      if (demo.actors.some(person => person.uniqueId === selected)) demoActor.value = selected;
      demoActor.dataset.actors = actors;
    }
    const remaining = demo.capacity - demo.actors.length;
    demoGuests.disabled = demoGuestCount.disabled = remaining === 0;
    demoGuestCount.max = Math.max(1, remaining);
    if (remaining > 0 && demoGuestCount.valueAsNumber > remaining) demoGuestCount.value = remaining;
    const roster = `${demo.actors.length}/${demo.capacity} người thử · ${seating.occupied}/${seating.capacity} ghế · ${seating.waiting} đang chờ`;
    if (demoRosterStatus.textContent !== roster) demoRosterStatus.textContent = roster;
    demoAutoRounds.textContent = `Câu tự động: ${demo.autoRounds ? 'Bật' : 'Tắt'}`;
    demoAutoRounds.setAttribute('aria-pressed', String(demo.autoRounds));
    const speaking = settings.ttsEnabled !== false;
    demoAudio.textContent = speaking ? 'Tắt giọng đọc' : 'Bật giọng đọc';
    demoAudio.setAttribute('aria-pressed', String(speaking));
  }

  async function loadDemoFish(mapId) {
    const previous = demoFish.value;
    demoFish.dataset.map = mapId;
    demoFish.replaceChildren(new Option('Đang tải danh mục…', ''));
    demoCatchButton.disabled = true;
    try {
      const response = await fetch(`/api/fish-catalog?map=${encodeURIComponent(mapId)}`);
      if (!response.ok) throw new Error('Không tải được danh mục cá.');
      const { catalog } = await response.json();
      if (demoFish.dataset.map !== mapId) return;
      demoFish.replaceChildren(...catalog.map(({ id, name }) => new Option(name, id)));
      if (catalog.some(fish => fish.id === previous)) demoFish.value = previous;
      demoCatchButton.disabled = !demoFish.value;
    } catch {
      if (demoFish.dataset.map !== mapId) return;
      demoFish.replaceChildren(new Option('Chưa tải được danh mục cá', ''));
      delete demoFish.dataset.map;
    }
  }

  document.getElementById('demoCatch').addEventListener('submit', async event => {
    event.preventDefault();
    if (demoCatchButton.disabled || !demoActor.value) return;
    if (demoAudio.getAttribute('aria-pressed') === 'true') window.FishingAudio?.ensureContext();
    demoCatchButton.disabled = true;
    demoBiteButton.disabled = true;
    const biting = event.submitter === demoBiteButton;
    demoCatchStatus.textContent = biting ? 'Đang chờ người được gọi tên gõ GIẬT…' : 'Đang tạo kết quả…';
    const reply = await callRpc(biting ? 'demo.bite' : 'demo.catch', {
      uniqueId: demoActor.value,
      fishId: demoFish.value,
      weightKg: demoWeight.value ? demoWeight.valueAsNumber : undefined,
      outcome: demoOutcome.value
    });
    demoCatchButton.disabled = !demoFish.value;
    demoBiteButton.disabled = !demoFish.value;
    const caught = reply?.result?.event;
    demoCatchStatus.textContent = caught
      ? `${caught.user} ${caught.type === 'rodBreak' ? 'gãy cần khi kéo' : 'đã câu'} ${caught.fish.name} · ${caught.weightKg.toLocaleString('vi-VN')} kg.`
      : reply?.result?.phase === 'timeout' ? 'Cá đã tuột vì hết thời gian. Thử lại bằng nút Cho cá cắn.'
      : reply?.result?.phase === 'cancelled' ? 'Lượt cá cắn đã hủy do hồ hoặc người chơi thay đổi.'
      : reply?.error?.message || 'Mất kết nối với hồ thử.';
  });

  document.querySelectorAll('[data-demo-likes]').forEach(button => button.addEventListener('click', async () => {
    const reply = await callRpc('demo.like', { count: Number(button.dataset.demoLikes) });
    demoCatchStatus.textContent = reply?.result?.accepted
      ? `❤️ Cá nặng ${reply.result.weightKg.toLocaleString('vi-VN')} kg · +${reply.result.likeBonusPercent}% so với ban đầu.`
      : reply?.error?.message || 'Tim tăng cân nặng khi đang zoom câu cá lớn.';
  }));

  demoAutoRounds.addEventListener('click', async () => {
    const enabled = demoAutoRounds.getAttribute('aria-pressed') !== 'true';
    const reply = await callRpc('demo.autoRounds', { enabled });
    if (reply?.result) {
      updateDemoDock(reply.result.demo, reply.result.settings, reply.result.seating);
      demoCatchStatus.textContent = enabled ? 'Đã bật câu tự động.' : 'Đã tạm dừng lượt tự động mới.';
    } else {
      demoCatchStatus.textContent = reply?.error?.message || 'Mất kết nối với hồ thử.';
    }
  });

  async function sendDemoChat(text) {
    if (demoAudio.getAttribute('aria-pressed') === 'true') window.FishingAudio?.ensureContext();
    const reply = await callRpc('demo.chat', { uniqueId: demoActor.value, text });
    if (!reply || reply.error) {
      demoStatus.textContent = reply?.error?.message || 'Mất kết nối với hồ thử.';
      return false;
    }
    const { kind, accepted, message } = reply.result;
    if (message) demoStatus.textContent = message;
    else if (kind === 'action') demoStatus.textContent = accepted ? 'Đã đưa lệnh vào hàng chờ.' : 'Nhân vật đang có lượt hoặc đã hết đích cho lệnh này.';
    else if (kind === 'vote') demoStatus.textContent = accepted ? 'Đã tính phiếu.' : 'Bạn đã bỏ phiếu hoặc lựa chọn này chưa mở.';
    else demoStatus.textContent = accepted ? 'Đã gửi bình luận.' : 'Hãy đợi vài giây trước khi gửi lại.';
    return accepted;
  }

  document.getElementById('demoChat').addEventListener('submit', async event => {
    event.preventDefault();
    if (await sendDemoChat(demoChatText.value)) demoChatText.value = '';
  });
  demoDock.addEventListener('click', event => {
    const text = event.target.closest('[data-demo-chat]')?.dataset.demoChat;
    if (text) sendDemoChat(text);
  });
  demoBallot.addEventListener('click', async () => {
    const reply = await callRpc('demo.ballot');
    if (reply?.result) updatePondScene(reply.result);
    demoStatus.textContent = reply?.result ? 'Gõ 1 đến 4 hoặc chọn nút để gửi phiếu.' : 'Chưa mở được bình chọn.';
  });
  document.getElementById('demoRoster').addEventListener('submit', async event => {
    event.preventDefault();
    const reply = await callRpc('demo.guests', { count: demoGuestCount.valueAsNumber });
    if (reply?.result) updateDemoDock(reply.result.demo, reply.result.settings, reply.result.seating);
    else demoRosterStatus.textContent = reply?.error?.message || 'Chưa thêm được người thử.';
  });
  demoAudio.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    callRpc('fishing.setSettings', { ttsEnabled: demoAudio.getAttribute('aria-pressed') !== 'true' });
  });
  document.getElementById('demoReset').addEventListener('click', async () => {
    const reply = await callRpc('demo.reset');
    if (reply?.result) {
      demoWeight.value = '';
      demoOutcome.value = 'catch';
      demoCatchStatus.textContent = '';
      demoStatus.textContent = '';
    }
  });

  function getAnglerInputs() {
    const nameInput = document.getElementById('inputAnglerName');
    const wishInput = document.getElementById('inputAnglerWish');
    return {
      user: nameInput?.value?.trim() || 'Cần thủ ẩn danh',
      wish: wishInput?.value?.trim() || 'Săn cá chép vàng 5 ký!'
    };
  }

  // Hotspots trên màn hình hồ câu
  const spotBait = document.getElementById('spotBait');
  const spotCast = document.getElementById('spotCast');
  const spotHorn = document.getElementById('spotHorn');
  const fishingBobberZone = document.getElementById('fishingBobberZone');

  if (spotBait) {
    spotBait.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const { user } = getAnglerInputs();
      callRpc('fishing.castBait', { user, count: 5 });
    });
  }

  if (spotCast) {
    spotCast.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const { user, wish } = getAnglerInputs();
      callRpc('fishing.castRod', { user, wish });
    });
  }

  if (spotHorn) {
    spotHorn.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const { user } = getAnglerInputs();
      callRpc('fishing.soundHorn', { user });
    });
  }

  if (fishingBobberZone) {
    fishingBobberZone.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const { user, wish } = getAnglerInputs();
      callRpc('fishing.hookFish', { user, wish });
    });
  }

  // Thẻ quà HUD đáy
  document.getElementById('cardBait')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user, wish } = getAnglerInputs();
    if (Math.random() < 0.5) callRpc('fishing.castRod', { user, wish, readTts: false });
    else callRpc('fishing.castBait', { user, count: 5 });
  });

  document.getElementById('cardCast')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user, wish } = getAnglerInputs();
    callRpc('fishing.soundHorn', { user, wish, readTts: false });
  });

  document.getElementById('cardGourmet')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.catchBigFish', { user, coins: 20 });
  });

  // Nút Quick Dock
  document.getElementById('btnRpcHook')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user, wish } = getAnglerInputs();
    callRpc('fishing.hookFish', { user, wish });
  });

  document.getElementById('btnRpcCast')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user, wish } = getAnglerInputs();
    callRpc('fishing.castRod', { user, wish });
  });

  document.getElementById('btnRpcBait')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.castBait', { user, count: 5 });
  });

  document.getElementById('btnRpcHorn')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.soundHorn', { user });
  });

  document.getElementById('btnRpcBigFish')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.catchBigFish', { user, coins: 35 });
  });

  document.getElementById('btnRpcLeviathan')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.catchLeviathan', { user, coins: 199 });
  });

  // Điều khiển âm thanh
  const btnUnlockAudio = document.getElementById('btnUnlockAudio');
  if (btnUnlockAudio) {
    btnUnlockAudio.addEventListener('click', () => {
      const audio = window.FishingAudio;
      // Chỉ nguồn phát (LIVE Studio / ?obs=1) mới được bật tiếng.
      // Tab điều khiển localhost giữ im lặng để không tạo tiếng vọng.
      if (!isAudioSource) {
        btnUnlockAudio.textContent = '🔇 Tab này không phát tiếng — chỉ nguồn LIVE Studio phát';
        btnUnlockAudio.classList.remove('gold');
        return;
      }
      if (audio) {
        audio.silentSecondary = false;
        audio.ttsEnabled = true;
        audio.sfxEnabled = true;
        audio.bgMusicEnabled = true;
      }
      window.FishingAudio?.ensureContext();
      btnUnlockAudio.textContent = '✅ Đã Bật Âm Thanh & Giọng Đọc';
      btnUnlockAudio.classList.remove('gold');
    });
  }

  const btnToggleMusic = document.getElementById('btnToggleMusic');
  if (btnToggleMusic) {
    btnToggleMusic.addEventListener('click', () => {
      const audio = window.FishingAudio;
      if (!audio) return;
      audio.ensureContext();
      audio.bgMusicEnabled = !audio.bgMusicEnabled;
      callRpc('fishing.setSettings', { bgMusicEnabled: audio.bgMusicEnabled });
      audio.syncMusic();
      if (audio.bgMusicEnabled) {
        audio.startLakeAmbience();
        btnToggleMusic.textContent = '🎵 Nhạc Nền: BẬT';
        btnToggleMusic.classList.add('active-toggle');
      } else {
        audio.stopLakeAmbience();
        btnToggleMusic.textContent = '🎵 Nhạc Nền: TẮT';
        btnToggleMusic.classList.remove('active-toggle');
      }
    });
  }

  const btnToggleTts = document.getElementById('btnToggleTts');
  if (btnToggleTts) {
    btnToggleTts.addEventListener('click', () => {
      const audio = window.FishingAudio;
      if (!audio) return;
      audio.ttsEnabled = !audio.ttsEnabled;
      callRpc('fishing.setSettings', { ttsEnabled: audio.ttsEnabled });
      btnToggleTts.textContent = audio.ttsEnabled ? '🎙️ Giọng Đọc: BẬT' : '🎙️ Giọng Đọc: TẮT';
      btnToggleTts.classList.toggle('active-toggle', audio.ttsEnabled);
    });
  }

  const sliderMusicVol = document.getElementById('sliderMusicVol');
  const valMusicVol = document.getElementById('valMusicVol');
  if (sliderMusicVol) {
    sliderMusicVol.addEventListener('input', (e) => {
      const val = e.target.value;
      if (valMusicVol) valMusicVol.textContent = `${val}%`;
      window.FishingAudio?.setMusicVolume(val / 100);
      callRpc('fishing.setSettings', { musicVolume: Number(val) / 100 });
    });
  }

  const sliderTtsVol = document.getElementById('sliderTtsVol');
  const valTtsVol = document.getElementById('valTtsVol');
  if (sliderTtsVol) {
    sliderTtsVol.addEventListener('input', (e) => {
      const val = e.target.value;
      if (valTtsVol) valTtsVol.textContent = `${val}%`;
      window.FishingAudio?.setTtsVolume(val / 100);
      callRpc('fishing.setSettings', { ttsVolume: Number(val) / 100 });
    });
  }

  // Kết nối TikTok Live — ghi nhớ tài khoản để các lần sau tự vào
  const TIKTOK_USER_KEY = 'cauca.tiktokUsername';
  const btnConnectTikTok = document.getElementById('btnConnectTikTok');
  const inputTikTokUser = document.getElementById('inputTikTokUser');

  function loadSavedTikTokUser() {
    try { return localStorage.getItem(TIKTOK_USER_KEY) || ''; } catch (_) { return ''; }
  }
  function saveTikTokUser(username) {
    try { localStorage.setItem(TIKTOK_USER_KEY, username); } catch (_) {}
  }

  const savedTikTokUser = loadSavedTikTokUser();
  if (inputTikTokUser && savedTikTokUser) inputTikTokUser.value = savedTikTokUser;

  async function doConnectTikTok(username, button) {
    if (!username) return;
    if (button) { button.textContent = 'Đang kết nối...'; button.disabled = true; }
    try {
      const reply = await callRpc('fishing.connectTikTok', { username });
      if (reply?.error) throw new Error(reply.error.message || 'Không kết nối được TikTok Live');
      saveTikTokUser(username);
      // AUTO: kết nối xong → bật luôn âm thanh + nhạc + TTS (nếu đây là nguồn phát).
      // Nhờ vậy quy trình chỉ cần "bấm Kết nối là mọi thứ tự chạy".
      if (isAudioSource) {
        const audio = window.FishingAudio;
        if (audio) { audio.silentSecondary = false; audio.ttsEnabled = true; audio.sfxEnabled = true; audio.bgMusicEnabled = true; }
        window.FishingAudio?.ensureContext();
        const bu = document.getElementById('btnUnlockAudio');
        if (bu) { bu.textContent = '✅ Đã Bật Âm Thanh & Giọng Đọc'; bu.classList.remove('gold'); }
      }
    } finally {
      if (button) { button.textContent = 'Kết Nối'; button.disabled = false; }
    }
  }

  if (btnConnectTikTok) {
    btnConnectTikTok.addEventListener('click', async () => {
      const username = inputTikTokUser?.value?.trim();
      if (!username) return alert('Vui lòng nhập @username hoặc link TikTok Live');
      try { await doConnectTikTok(username, btnConnectTikTok); }
      catch (error) { alert(error.message); }
    });
  }

  // Nhập @username rồi Enter là vào luôn
  if (inputTikTokUser) {
    inputTikTokUser.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); btnConnectTikTok?.click(); }
    });
  }

  document.getElementById('btnFillSimulatedSeats')?.addEventListener('click', async () => {
    const button = document.getElementById('btnFillSimulatedSeats');
    button.disabled = true;
    button.textContent = 'Đang tạo người câu…';
    try {
      const count = document.getElementById('simulatedCount');
      if (count && !count.reportValidity()) return;
      const reply = await callRpc('fishing.fillSimulatedSeats', { count: Number(count?.value || 5) });
      if (reply?.error || !reply?.result) throw new Error(reply?.error?.message || 'Không tạo được người giả lập');
      updatePublicState(reply.result.state);
    } catch (error) {
      const status = document.getElementById('seatingStatus');
      if (status) status.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = '🎲 Tạo người câu ngẫu nhiên';
    }
  });

  // Tự động giả lập cần thủ
  let autoSimState = false;
  const btnToggleAutoSim = document.getElementById('btnToggleAutoSim');
  if (btnToggleAutoSim) {
    btnToggleAutoSim.addEventListener('click', async () => {
      autoSimState = !autoSimState;
      if (autoSimState) {
        await callRpc('fishing.startAutoSim');
        btnToggleAutoSim.textContent = '🤖 Tự động Giả lập: BẬT';
        btnToggleAutoSim.classList.add('gold');
      } else {
        await callRpc('fishing.stopAutoSim');
        btnToggleAutoSim.textContent = '🤖 Tự động Giả lập: TẮT';
        btnToggleAutoSim.classList.remove('gold');
      }
    });
  }

  // Bấm đóng modal chiến tích khi click ra ngoài
  if (catchModal) {
    catchModal.addEventListener('click', (e) => {
      if (e.target === catchModal) {
        closeCatchNotice();
      }
    });
  }

  document.getElementById('btnCopyTunnelUrl')?.addEventListener('click', async () => {
    const url = document.getElementById('inputPublicTunnelUrl')?.value;
    if (url?.startsWith('https://')) await navigator.clipboard.writeText(url);
  });
  document.getElementById('btnRefreshTunnelUrl')?.addEventListener('click', async () => {
    const button = document.getElementById('btnRefreshTunnelUrl');
    button.disabled = true;
    try { await callRpc('live.refreshTunnel'); }
    finally { button.disabled = false; }
  });

  connectWs();
})();
