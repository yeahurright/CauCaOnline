/**
 * FishingAudioEngine
 * - Nhạc nền: Mô phỏng sóng nước hồ câu êm dịu, tiếng chim rừng & suối reo thư giãn bằng Web Audio API,
 *   tự động hạ nhỏ âm lượng (ducking) khi có giọng đọc VieNeu-TTS thông báo bắt cá.
 * - Hiệu ứng âm thanh (SFX):
 *   + Tiếng ném thính tõm xuống nước (Water drop / splash)
 *   + Tiếng vung cần xé gió (Rod whoosh)
 *   + Tiếng bụp nhẹ khi cá lên bờ
 *   + Tiếng còi báo cá bến thuyền (Boat air horn)
 *   + Tiếng chuông reo ăn mừng cá to (Celebration chime)
 * - Giọng đọc: Hàng đợi VieNeu-TTS phát tuần tự hào sảng.
 */
// Nhạc nền KHÔNG LỜI — piano nhẹ nhàng. Kevin MacLeod (incompetech.com), CC BY 4.0
const BG_MUSIC_TRACKS = [
  '/assets/music/gymnopedie.mp3',
  '/assets/music/deliberate-thought.mp3',
  '/assets/music/piano-between.mp3',
  '/assets/music/meditation-01.mp3',
  '/assets/music/dreamer.mp3'
];

class FishingAudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.sfxEnabled = true;
    // Cửa sổ phụ (không phải nguồn OBS/Live Studio) mặc định TẮT tiếng để tránh phát trùng
    this.silentSecondary = false;
    // Chỉ 1 tiếng còi tại một thời điểm
    this.hornActive = false;
    // Nhạc nền MP3 (luân phiên các bài)
    this.musicEl = null;
    this.musicIndex = 0;
    this.bgMusicEnabled = true;
    this.ttsEnabled = true;
    this.ttsVoice = 'default';

    const savedMusicVol = parseFloat(localStorage.getItem('fishing_music_vol'));
    const savedTtsVol = parseFloat(localStorage.getItem('fishing_tts_vol'));
    this.bgBaseVolume = Number.isFinite(savedMusicVol) ? Math.max(0, Math.min(1, savedMusicVol)) : 0.60;
    this.ttsVolume = Number.isFinite(savedTtsVol) ? Math.max(0, Math.min(1, savedTtsVol)) : 0.95;

    this.synthBgTimer = null;
    this.waterLapTimer = null;
    this.ttsQueue = [];
    this.speechFiles = new Map();
    this.ttsPlaying = false;
    this.currentAudio = null;
    this.onTtsStateChange = null;

    // Chống lặp câu thoại / tiếng vọng (De-duplication & Anti-Echo)
    this.lastTtsText = '';
    this.lastTtsTimestamp = 0;
    this.tabChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fishing_tts_channel') : null;
    if (this.tabChannel) {
      this.tabChannel.onmessage = (e) => {
        if (e.data?.text) {
          this.lastTtsText = String(e.data.text);
          this.lastTtsTimestamp = Number(e.data.timestamp) || Date.now();
        }
      };
    }
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.unlocked = true;
    if (this.bgMusicEnabled && !this.waterLapTimer) {
      this.startLakeAmbience();
    }
    this.syncMusic();
    return this.ctx;
  }

  // ---- Nhạc nền MP3 không bản quyền ----
  playNextMusicTrack() {
    if (!this.bgMusicEnabled || this.silentSecondary) return;
    if (!this.musicEl) {
      this.musicEl = new Audio();
      this.musicEl.addEventListener('ended', () => this.playNextMusicTrack());
    }
    const el = this.musicEl;
    el.src = BG_MUSIC_TRACKS[this.musicIndex % BG_MUSIC_TRACKS.length];
    this.musicIndex = (this.musicIndex + 1) % BG_MUSIC_TRACKS.length;
    el.volume = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  stopRealMusic() {
    if (!this.musicEl) return;
    try { this.musicEl.pause(); } catch (_) {}
    this.musicEl = null;
  }

  // Đồng bộ trạng thái nhạc theo cờ bật/tắt
  syncMusic() {
    if (this.bgMusicEnabled && this.unlocked) {
      if (!this.musicEl) this.playNextMusicTrack();
      else this.musicEl.volume = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
    } else if (!this.bgMusicEnabled) {
      this.stopRealMusic();
    }
  }

  getDuckedVolume() {
    return this.bgBaseVolume * 0.10;
  }

  setMusicVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.bgBaseVolume = v;
    if (this.musicEl) {
      try { this.musicEl.volume = this.ttsPlaying ? this.getDuckedVolume() : v; } catch (_) {}
    }
    try {
      localStorage.setItem('fishing_music_vol', String(v));
    } catch (_) {}
  }

  setTtsVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.ttsVolume = v;
    try {
      localStorage.setItem('fishing_tts_vol', String(v));
    } catch (_) {}
    if (this.currentAudio) {
      this.currentAudio.volume = this.ttsVolume;
    }
  }

  // --------------------------------------------------------------------------
  // 1. ÂM THANH NỀN HỒ NƯỚC & THIÊN NHIÊN (LAKE & NATURE SYNTH AMBIENCE)
  // --------------------------------------------------------------------------
  startLakeAmbience() {
    if (!this.bgMusicEnabled || this.silentSecondary) return;
    if (this.synthBgTimer) return;

    // Chuỗi nốt lofi ngũ cung êm dịu gợi cảm giác ngồi câu cá bên hồ
    const PENTATONIC = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
    let noteIdx = 0;

    const playLakeTone = () => {
      if (!this.bgMusicEnabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const freq = PENTATONIC[noteIdx % PENTATONIC.length];
        noteIdx++;
        const vol = (this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume) * 0.12;
        if (vol <= 0.002) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 5.0);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now);
        osc.stop(now + 5.1);
      } catch (_) {}
    };

    // Tiếng nước vỗ nhẹ bờ hồ ngẫu nhiên
    const playSoftWaterLap = () => {
      if (!this.bgMusicEnabled || !this.ctx || this.ttsPlaying) return;
      try {
        const now = this.ctx.currentTime;
        const vol = this.bgBaseVolume * 0.05;

        // Pink noise buffer cho tiếng sóng
        const bufferSize = this.ctx.sampleRate * 1.2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.11;
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(380, now);
        filter.frequency.linearRampToValueAtTime(180, now + 1.2);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        whiteNoise.start(now);
        whiteNoise.stop(now + 1.25);
      } catch (_) {}
    };

    // Nhạc nền giờ dùng file MP3 thật (không bản quyền), chỉ giữ tiếng sóng nước
    this.syncMusic();
    this.waterLapTimer = setInterval(playSoftWaterLap, 6500);
  }

  stopLakeAmbience() {
    this.stopRealMusic();
    if (this.synthBgTimer) {
      clearInterval(this.synthBgTimer);
      this.synthBgTimer = null;
    }
    if (this.waterLapTimer) {
      clearInterval(this.waterLapTimer);
      this.waterLapTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // 2. TIẾNG THẢ THÍNH / MỒI RƠI XUỐNG NƯỚC (WATER DROP / PLOP)
  // --------------------------------------------------------------------------
  playWaterDrop(pitchMultiplier = 1.0, peakGain = 0.24) {
    if (!this.sfxEnabled || this.silentSecondary) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startFreq = 420 * pitchMultiplier * (0.95 + Math.random() * 0.1);
      const endFreq = startFreq * 2.2;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.08);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 4. TIẾNG VUNG CẦN CÂU XÉ GIÓ (ROD WHOOSH)
  // --------------------------------------------------------------------------
  playRodWhoosh() {
    if (!this.sfxEnabled || this.silentSecondary || this.ttsPlaying) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      // Bandpass noise whoosh
      const bufferSize = ctx.sampleRate * 0.3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(1600, now + 0.12);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.28);
      filter.Q.setValueAtTime(3.5, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.3);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 6. TIẾNG CÒI BÁO CÁ / CÒI BẾN TÀU (BOAT AIR HORN)
  // --------------------------------------------------------------------------
  playAirHorn() {
    if (!this.sfxEnabled || this.silentSecondary || this.ttsPlaying) return;
    // Chỉ cho 1 tiếng còi tại một thời điểm
    if (this.hornActive) return;
    this.hornActive = true;
    setTimeout(() => { this.hornActive = false; }, 1000);
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      const baseFreq = 210;
      const partials = [
        { freq: baseFreq, amp: 0.22 },
        { freq: baseFreq * 1.25, amp: 0.18 },
        { freq: baseFreq * 1.5, amp: 0.14 }
      ];

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.001, now);
      master.gain.linearRampToValueAtTime(0.04, now + 0.05);
      master.gain.setValueAtTime(0.04, now + 0.65);
      master.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      master.connect(ctx.destination);

      partials.forEach((p) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(p.freq, now);

        const g = ctx.createGain();
        g.gain.setValueAtTime(p.amp, now);

        osc.connect(g);
        g.connect(master);

        osc.start(now);
        osc.stop(now + 1.0);
      });
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 7. TIẾNG CHUÔNG ĂN MỪNG CHIẾN TÍCH (CELEBRATION CHIME)
  // --------------------------------------------------------------------------
  playCelebrationChime(isCurrent) {
    if (!this.sfxEnabled || this.silentSecondary || isCurrent?.() === false) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 arpeggio
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        if (!this.sfxEnabled || this.silentSecondary || isCurrent?.() === false) return;
        try {
          const ctx = this.ensureContext();
          const now = ctx.currentTime;

          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 1.25);
        } catch (_) {}
      }, idx * 110);
    });
  }

  // --------------------------------------------------------------------------
  // 8. HÀNG ĐỢI VIENEU TTS (VOICE QUEUE)
  // --------------------------------------------------------------------------
  enqueueTts(text, options = {}) {
    const onStart = typeof options.onStart === 'function' ? options.onStart : null;
    const onEnd = typeof options.onEnd === 'function' ? options.onEnd : null;

    if (this.silentSecondary) return;
    if (!this.ttsEnabled) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 4000);
      return;
    }
    const clean = String(text || '').trim();
    if (!clean) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 4000);
      return;
    }

    // 1. Chống lặp câu thoại / tiếng vọng: Bỏ qua nếu cùng 1 câu thoại được gửi lại trong vòng 3.5s
    const now = Date.now();
    if (clean === this.lastTtsText && (now - this.lastTtsTimestamp) < 3500) {
      console.warn('[Audio] Đã chặn câu thoại lặp lại (Anti-Echo):', clean);
      if (onEnd) setTimeout(() => onEnd({ played: false, skipped: true }), 0);
      return;
    }

    // 1b. Chống lặp giữa các Tab / Cửa sổ khác nhau (Cross-Tab Anti-Echo qua localStorage):
    try {
      const crossTabKey = 'fishing_last_played_tts';
      const rawStored = localStorage.getItem(crossTabKey);
      if (rawStored) {
        const parsed = JSON.parse(rawStored);
        if (parsed.text === clean && (now - Number(parsed.ts || 0)) < 3500) {
          console.warn('[Audio] Bỏ qua câu thoại đã được tab/cửa sổ khác phát (Cross-Tab Anti-Echo):', clean);
          if (onEnd) setTimeout(() => onEnd({ played: false, skipped: true }), 0);
          return;
        }
      }
      localStorage.setItem(crossTabKey, JSON.stringify({ text: clean, ts: now }));
    } catch (_) {}

    // 2. Bỏ qua nếu câu thoại đã nằm sẵn trong hàng đợi chờ đọc
    if (this.ttsQueue.some((item) => item.text === clean)) {
      console.warn('[Audio] Câu thoại đã có trong hàng đợi, bỏ qua để tránh vang:', clean);
      if (onEnd) onEnd({ played: false, skipped: true });
      return;
    }

    this.lastTtsText = clean;
    this.lastTtsTimestamp = now;
    if (this.tabChannel) {
      try {
        this.tabChannel.postMessage({ text: clean, timestamp: now });
      } catch (_) {}
    }

    const isPriority = options.priority === true;
    const queuedAnnouncement = options.queuedAnnouncement === true;
    // Hàng đợi tối đa 3 câu — dồn nhiều quá thì bỏ câu cũ nhất để đọc câu mới
    if (!queuedAnnouncement) {
      const regular = this.ttsQueue.filter((item) => !item.queuedAnnouncement);
      if (regular.length >= 3) {
        const oldest = regular.find((item) => !item.priority) || regular[0];
        const [dropped] = this.ttsQueue.splice(this.ttsQueue.indexOf(oldest), 1);
        if (dropped.onEnd) dropped.onEnd({ played: false, dropped: true });
      }
    }

    // Ưu tiên chúc mừng cá, độc lập với tốc độ đọc.
    const isCatchLine = options.isCatch ?? (Number(options.rate) > 0);
    let finalRate = Number(options.rate) || 0;

    if (isCatchLine) {
      // 1. Bỏ mọi câu không phải chúc mừng đang chờ (châm ngôn, câu hỏi, chỉ dẫn)
      this.ttsQueue = this.ttsQueue.filter((it) => {
        if (it.isCatch || it.queuedAnnouncement) return true;
        if (it.onEnd) it.onEnd({ played: false, dropped: true });
        return false;
      });
      // 2. Chỉ tự tăng tốc nếu caller không chọn tốc độ cụ thể.
      const pending = this.ttsQueue.length;
      if (pending > 0 && !(Number(options.rate) > 0)) {
        const busy = Math.min(1.5, 1.2 + pending * 0.1);
        finalRate = Math.max(finalRate, +busy.toFixed(2));
      }
    }

    const item = {
      id: `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: clean,
      voice: (options.voice || this.ttsVoice || 'default'),
      rate: finalRate,
      isCatch: isCatchLine,
      url: options.url || null,
      priority: isPriority || isCatchLine || queuedAnnouncement,
      queuedAnnouncement,
      onStart,
      onEnd,
      fetchPromise: null
    };

    if (!item.url) {
      // KHÔNG tổng hợp ngay — chỉ tổng hợp khi thực sự sắp phát (tránh quá tải)
      item.fetchPromise = null;
    }

    if (isPriority) {
      // Chèn sau các câu ưu tiên đang chờ, để chúc mừng luôn phát trước câu nhắc
      let insertAt = 0;
      for (let i = this.ttsQueue.length - 1; i >= 0; i--) {
        if (this.ttsQueue[i].priority) { insertAt = i + 1; break; }
      }
      this.ttsQueue.splice(insertAt, 0, item);
    } else {
      this.ttsQueue.push(item);
    }
    this.processTtsQueue();
  }

  async fetchTtsAudio(text, voice = 'default') {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice })
      });
      const data = await res.json();
      if (data && data.ok && data.url) {
        return data;
      }
      return { ok: false, fallback: true, text };
    } catch (_) {
      return { ok: false, fallback: true, text };
    }
  }

  // Dừng mọi nguồn âm thanh đang phát (bắt buộc trước khi phát câu mới)
  stopAllAudio() {
    try {
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio = null;
      }
    } catch (_) {}
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch (_) {}
  }

  async processTtsQueue() {
    if (this.ttsPlaying || this.ttsQueue.length === 0) return;
    this.ttsPlaying = true;
    // Hạ nhỏ nhạc nền khi đang đọc
    if (this.musicEl) {
      try { this.musicEl.volume = this.getDuckedVolume(); } catch (_) {}
    }
    const item = this.ttsQueue.shift();
    this.currentRate = Number(item.rate) || 0;
    this.currentCatch = !!item.isCatch;

    try {
      let audioUrl = item.url;
      if (!audioUrl) {
        // Chỉ tổng hợp khi tới lượt phát thật sự
        const res = item.fetchPromise ? await item.fetchPromise : await this.fetchTtsAudio(item.text, item.voice);
        if (res && res.ok && res.url) {
          audioUrl = res.url;
        }
      }

      // Khoá cứng: dừng sạch mọi âm thanh cũ trước khi phát câu mới
      this.stopAllAudio();

      if (item.onStart) item.onStart();

      let played;
      if (audioUrl) {
        played = await this.playWavUrl(audioUrl);
      } else {
        played = await this.speakWithWebSpeech(item.text);
      }
      if (item.onEnd) item.onEnd({ played: played !== false });
    } catch (_) {
      if (item.onEnd) item.onEnd({ played: false });
    } finally {
      this.ttsPlaying = false;
      this.currentRate = 0;
      this.currentCatch = false;
      // Trả nhạc nền về âm lượng bình thường
      if (this.musicEl) {
        try { this.musicEl.volume = this.bgBaseVolume; } catch (_) {}
      }
      if (this.ttsQueue.length > 0) {
        setTimeout(() => this.processTtsQueue(), 220);
      }
    }
  }

  preloadSpeech(url) {
    const cached = this.speechFiles.get(url);
    if (cached) return cached;

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 5000);
    const file = fetch(url, { cache: 'force-cache', signal: abort.signal })
      .then(async response => response.ok ? await response.blob() : null)
      .catch(() => null)
      .then(blob => {
        if (!blob?.size && this.speechFiles.get(url) === file) this.speechFiles.delete(url);
        return blob?.size ? blob : null;
      })
      .finally(() => clearTimeout(timeout));
    this.speechFiles.set(url, file);
    if (this.speechFiles.size > 12) this.speechFiles.delete(this.speechFiles.keys().next().value);
    return file;
  }

  async playWavUrl(url) {
    const file = await this.preloadSpeech(url);
    const localUrl = file ? URL.createObjectURL(file) : null;
    return new Promise((resolve) => {
      let audio;
      let finished = false;
      const handleDone = (played) => {
        if (finished) return;
        finished = true;
        if (this.currentAudio === audio) this.currentAudio = null;
        if (localUrl) URL.revokeObjectURL(localUrl);
        resolve(played);
      };

      try {
        audio = new Audio(localUrl || url);
        this.currentAudio = audio;
        audio.volume = Math.max(0, Math.min(1, this.ttsVolume));
        audio.playbackRate = (this.currentRate > 0 ? this.currentRate : (this.ttsSpeed || 1));
        audio.preservesPitch = true;

        audio.onended = () => handleDone(true);
        audio.onerror = () => handleDone(false);

        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => handleDone(false));
        }
      } catch (_) {
        handleDone(false);
      }
    });
  }

  speakWithWebSpeech(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        setTimeout(() => resolve(false), 2000);
        return;
      }
      try {
        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find((v) => v.lang && v.lang.toLowerCase().includes('vi'));
        // Tuyệt đối không dùng giọng tiếng Anh của Windows nếu máy chưa cài gói giọng vi-VN
        if (!viVoice) {
          setTimeout(() => resolve(false), 1500);
          return;
        }
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'vi-VN';
        utter.voice = viVoice;
        utter.rate = this.currentRate > 0 ? this.currentRate : (this.ttsSpeed || 1);
        utter.volume = this.ttsVolume;

        const timer = setTimeout(() => resolve(false), 30000);
        utter.onend = () => {
          clearTimeout(timer);
          resolve(true);
        };
        utter.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
        window.speechSynthesis.speak(utter);
      } catch (_) {
        setTimeout(() => resolve(false), 2000);
      }
    });
  }
}

// Backward-compatible global singleton
window.FishingAudio = new FishingAudioEngine();
window.TempleAudio = window.FishingAudio; // Alias
