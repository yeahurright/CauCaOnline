/**
 * Ultra-Low-CPU 2.5D Fishing Lake Canvas Particle Engine
 * Tối ưu hóa tối đa cho OBS / TikTok Live treo máy 24/7:
 * - Khóa cố định 30 FPS siêu mượt và siêu nhẹ CPU/GPU
 * - Tạm dừng khi tab bị ẩn, trừ nguồn phát ?obs=1
 * - Pre-render toàn bộ Bong bóng nước, Gợn sóng, Giọt nước bắn ra Offscreen Canvas 1 lần duy nhất
 */
const AMBIENT_BUBBLES = 7;
const MAX_BURST_BUBBLES = 24;

class FishingParticleEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.width = 1080;
    this.height = 1920;
    this.captureMode = ['1', 'true'].includes(new URLSearchParams(location.search).get('obs'));
    this.water = window.PondMapLayouts.still.water;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.bubbles = [];
    this.ripples = [];
    this.droplets = [];
    this.sunbeams = [];
    this.fishes = [];
    this.fishAtlas = new Image();
    this.fishAtlas.src = '/assets/underwater_fish_atlas.png';
    this.goldSparks = [];

    this.time = 0;
    this.lastFrameTime = 0;
    this.frameInterval = 1000 / 30; // 30 FPS

    this.buildOffscreenSprites();
    this.initAmbientParticles();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  buildOffscreenSprites() {
    // 1. Pre-render Bubble Sprite (32x32)
    this.bubbleSprite = document.createElement('canvas');
    this.bubbleSprite.width = 32;
    this.bubbleSprite.height = 32;
    const bctx = this.bubbleSprite.getContext('2d');
    bctx.beginPath();
    bctx.arc(16, 16, 12, 0, Math.PI * 2);
    bctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    bctx.lineWidth = 1.8;
    bctx.stroke();
    // Highlight reflection spot
    bctx.beginPath();
    bctx.arc(12, 12, 3.5, 0, Math.PI * 2);
    bctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    bctx.fill();

    // 2. Pre-render Sparkle Sprite (16x16)
    this.sparkSprite = document.createElement('canvas');
    this.sparkSprite.width = 16;
    this.sparkSprite.height = 16;
    const sctx = this.sparkSprite.getContext('2d');
    const sgrad = sctx.createRadialGradient(8, 8, 1, 8, 8, 7);
    sgrad.addColorStop(0, 'rgba(255, 255, 220, 1)');
    sgrad.addColorStop(0.5, 'rgba(129, 212, 250, 0.6)');
    sgrad.addColorStop(1, 'rgba(3, 169, 244, 0)');
    sctx.fillStyle = sgrad;
    sctx.beginPath();
    sctx.arc(8, 8, 7, 0, Math.PI * 2);
    sctx.fill();

    // 3. Pre-render Water Droplet Sprite (18x18)
    this.dropSprite = document.createElement('canvas');
    this.dropSprite.width = 18;
    this.dropSprite.height = 18;
    const dctx = this.dropSprite.getContext('2d');
    const dgrad = dctx.createRadialGradient(9, 9, 1, 9, 9, 8);
    dgrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    dgrad.addColorStop(0.6, 'rgba(179, 229, 252, 0.7)');
    dgrad.addColorStop(1, 'rgba(2, 136, 209, 0)');
    dctx.fillStyle = dgrad;
    dctx.beginPath();
    dctx.arc(9, 9, 8, 0, Math.PI * 2);
    dctx.fill();
  }

  initAmbientParticles() {
    // Bong bóng nước nổi lên từ mặt hồ
    for (let i = 0; i < AMBIENT_BUBBLES; i++) {
      this.bubbles.push({
        x: 180 + Math.random() * 720,
        y: 800 + Math.random() * 950,
        size: 6 + Math.random() * 10,
        vy: -(0.6 + Math.random() * 1.1),
        vx: (Math.random() - 0.5) * 0.3,
        alpha: 0.10 + Math.random() * 0.22,
        wobble: Math.random() * Math.PI * 2
      });
    }

    // Ánh nắng lấp lánh trên mặt hồ
    for (let i = 0; i < 15; i++) {
      this.goldSparks.push({
        x: 100 + Math.random() * 880,
        y: 750 + Math.random() * 800,
        size: 8 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        speed: 0.03 + Math.random() * 0.04
      });
    }

    // Đàn cá bơi lội ngẫu nhiên dưới đáy hồ
    for (let i = 0; i < 8; i++) {
      this.spawnAmbientFish(true);
    }
  }

  spawnAmbientFish(initial = false) {
    const dir = Math.random() > 0.5 ? 1 : -1;
    this.fishes.push({
      x: initial ? 240 + Math.random() * 600 : dir > 0 ? -120 : this.width + 120,
      y: 400 + Math.random() * 1000,
      vx: dir * (0.55 + Math.random() * 0.8),
      size: 40 + Math.random() * 28,
      skin: Math.floor(Math.random() * 8),
      scaleY: 0.45,
      alpha: 0.28 + Math.random() * 0.16,
      dir,
      wave: Math.random() * Math.PI * 2
    });
  }

  addBurstBubble(bubble) {
    if (this.bubbles.length >= AMBIENT_BUBBLES + MAX_BURST_BUBBLES) this.bubbles.splice(AMBIENT_BUBBLES, 1);
    this.bubbles.push({ ...bubble, expiresAt: performance.now() + 1800 });
  }

  // Kích hoạt khi thả thính / ném mồi
  addBaitDrop(x = 540, y = 1180, count = 1) {
    // Thêm các gợn sóng đồng tâm
    for (let i = 0; i < 3; i++) {
      this.ripples.push({
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 30,
        radius: 6,
        maxRadius: 80 + Math.random() * 60,
        alpha: 0.85,
        growth: 2.2 + i * 0.6
      });
    }

    // Giọt nước bắn lên
    const dropCount = Math.min(24, count * 3);
    for (let i = 0; i < dropCount; i++) {
      const angle = (Math.PI * 2 * i) / dropCount + Math.random() * 0.3;
      const speed = 2.5 + Math.random() * 5.0;
      this.droplets.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: -Math.abs(Math.sin(angle) * speed * 1.4) - 2.5,
        gravity: 0.28,
        alpha: 1.0,
        size: 8 + Math.random() * 8
      });
    }

    // Sủi bọt nước
    for (let i = 0; i < 3; i++) {
      this.addBurstBubble({
        x: x + (Math.random() - 0.5) * 60,
        y: y + 20 + Math.random() * 80,
        size: 10 + Math.random() * 10,
        vy: -(1.4 + Math.random() * 1.8),
        vx: (Math.random() - 0.5) * 0.7,
        alpha: 0.55,
        wobble: Math.random() * Math.PI * 2
      });
    }
  }

  // Kích hoạt khi giật cá / bắt được cá to
  addFishCatch(x = 540, y = 1180, isBig = false) {
    const mult = isBig ? 2.2 : 1.2;
    for (let i = 0; i < 5; i++) {
      this.ripples.push({
        x,
        y,
        radius: 10 + i * 15,
        maxRadius: 180 * mult,
        alpha: 0.95,
        growth: 3.8 + i * 1.1
      });
    }

    const dropTotal = isBig ? 60 : 35;
    for (let i = 0; i < dropTotal; i++) {
      const angle = Math.random() * Math.PI;
      const speed = (4.0 + Math.random() * 8.0) * mult;
      this.droplets.push({
        x: x + (Math.random() - 0.5) * 50,
        y,
        vx: (Math.random() - 0.5) * speed * 1.5,
        vy: -Math.abs(Math.sin(angle) * speed * 1.8) - 4.0,
        gravity: 0.32,
        alpha: 1.0,
        size: 9 + Math.random() * 10
      });
    }

    if (isBig) {
      // Bong bóng tan sau cú giật cá to.
      for (let i = 0; i < 12; i++) {
        this.addBurstBubble({
          x: x + (Math.random() - 0.5) * 160,
          y: y + Math.random() * 200,
          size: 14 + Math.random() * 18,
          vy: -(2.5 + Math.random() * 3.5),
          vx: (Math.random() - 0.5) * 1.8,
          alpha: 0.9,
          wobble: Math.random() * Math.PI * 2
        });
      }
    }
  }

  animate(now) {
    requestAnimationFrame(this.animate);
    if (document.hidden && !this.captureMode) return;

    const elapsed = now - this.lastFrameTime;
    if (elapsed < this.frameInterval) return;
    this.lastFrameTime = now - (elapsed % this.frameInterval);
    this.time += 0.03;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();
    this.ctx.clip(this.water);

    // 1. Vẽ bóng cá bơi dưới nước
    if (!this.useVideoWildlife) this.renderFishSilhouettes();

    // 2. Vẽ gợn sóng tròn lan tỏa trên mặt hồ
    this.renderRipples();

    // 3. Vẽ bong bóng nước nổi lên
    this.renderBubbles(now);

    // 4. Vẽ giọt nước bắn tung tóe

    // 5. Vẽ ánh nắng lấp lánh mặt hồ
    this.renderSparks();
    this.ctx.restore();
    this.renderDroplets();
  }

  renderFishSilhouettes() {
    for (let i = this.fishes.length - 1; i >= 0; i--) {
      const f = this.fishes[i];
      f.x += f.vx;
      f.wave += 0.06;
      const waveY = f.y + Math.sin(f.wave) * 12;

      this.ctx.save();
      this.ctx.translate(f.x, waveY);
      this.ctx.scale(f.dir, 1);
      this.ctx.rotate(Math.sin(f.wave * .75) * .07);
      if (this.fishAtlas.complete && this.fishAtlas.naturalWidth > 0) {
        const sw = this.fishAtlas.naturalWidth / 4, sh = this.fishAtlas.naturalHeight / 2;
        const width = f.size * 2.8, height = width * sh / sw;
        this.ctx.globalAlpha = f.alpha;
        this.ctx.drawImage(this.fishAtlas, f.skin % 4 * sw, Math.floor(f.skin / 4) * sh, sw, sh, -width / 2, -height / 2, width, height);
      } else {
      this.ctx.fillStyle = `rgba(18, 55, 65, ${f.alpha})`;

      // Vẽ hình bóng cá đơn giản (oval + đuôi vẫy)
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, f.size, f.size * f.scaleY, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Đuôi cá vẫy
      const tailOffset = Math.sin(f.wave * 1.5) * 6;
      this.ctx.beginPath();
      this.ctx.moveTo(-f.size * 0.8, 0);
      this.ctx.lineTo(-f.size * 1.4, -f.size * 0.4 + tailOffset);
      this.ctx.lineTo(-f.size * 1.4, f.size * 0.4 + tailOffset);
      this.ctx.closePath();
      this.ctx.fill();
      }
      this.ctx.restore();

      if ((f.dir > 0 && f.x > this.width + 150) || (f.dir < 0 && f.x < -150)) {
        this.fishes.splice(i, 1);
        if (this.fishes.length < 8) {
          this.spawnAmbientFish();
        }
      }
    }
  }

  renderRipples() {
    this.ctx.save();
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.radius += r.growth;
      r.alpha -= 0.015;

      if (r.alpha <= 0 || r.radius >= r.maxRadius) {
        this.ripples.splice(i, 1);
        continue;
      }

      this.ctx.strokeStyle = `rgba(220, 245, 255, ${r.alpha * 0.75})`;
      this.ctx.lineWidth = 2.2;
      this.ctx.beginPath();
      // Vẽ elip dẹt mô phỏng góc nhìn nghiêng 2.5D mặt hồ
      this.ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.45, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  renderBubbles(now) {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      const remaining = b.expiresAt ? b.expiresAt - now : Infinity;
      if (remaining <= 0) {
        this.bubbles.splice(i, 1);
        continue;
      }
      b.y += b.vy;
      b.wobble += 0.05;
      b.x += Math.sin(b.wobble) * 0.5 + b.vx;

      this.ctx.globalAlpha = b.alpha * Math.min(1, remaining / 550);
      this.ctx.drawImage(this.bubbleSprite, b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);

      // Chỉ bong bóng nền quay vòng.
      if (!b.expiresAt && b.y < 720) {
        b.y = 1500 + Math.random() * 400;
        b.x = 180 + Math.random() * 720;
      }
    }
    this.ctx.globalAlpha = 1.0;
  }

  renderDroplets() {
    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const d = this.droplets[i];
      d.x += d.vx;
      d.vy += d.gravity;
      d.y += d.vy;
      d.alpha -= 0.022;

      if (d.alpha <= 0 || d.y > 1800) {
        this.droplets.splice(i, 1);
        continue;
      }

      this.ctx.globalAlpha = Math.max(0, d.alpha);
      this.ctx.drawImage(this.dropSprite, d.x - d.size / 2, d.y - d.size / 2, d.size, d.size);
    }
    this.ctx.globalAlpha = 1.0;
  }

  renderSparks() {
    for (let i = 0; i < this.goldSparks.length; i++) {
      const s = this.goldSparks[i];
      s.phase += s.speed;
      const alpha = 0.3 + Math.sin(s.phase) * 0.45;
      if (alpha <= 0.02) continue;

      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(this.sparkSprite, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    this.ctx.globalAlpha = 1.0;
  }
}

// Global initialization
window.FishingParticleEngine = FishingParticleEngine;
window.TempleParticleEngine = FishingParticleEngine; // Alias
