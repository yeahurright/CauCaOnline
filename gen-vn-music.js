// Tổng hợp nhạc nền ngũ cung Việt Nam (đàn tranh + bè trầm) — 100% gốc, không bản quyền
const fs = require('fs');
const path = require('path');

const SR = 44100;

function writeWav(file, left, right) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(left[i] * 32767))), o); o += 2;
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(right[i] * 32767))), o); o += 2;
  }
  fs.writeFileSync(file, buf);
}

// Ngũ cung Việt: D - F - G - A - C (thang 5 âm, chất Á Đông trầm)
const SCALE = [146.83, 174.61, 196.00, 220.00, 261.63, 293.66, 349.23, 392.00, 440.00, 523.25];

// Một nốt đàn tranh: nhiều họa âm + tắt dần + tiếng bật dây
function pluck(freq, dur, amp, pan) {
  const len = Math.floor(dur * SR);
  const out = new Float32Array(len);
  const harm = [1, 2, 3, 4.02, 5.05, 6.1];
  const w = [1, .55, .32, .18, .10, .06];
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let s = 0;
    for (let h = 0; h < harm.length; h++) {
      s += Math.sin(2 * Math.PI * freq * harm[h] * t + h * 0.7) * w[h];
    }
    const env = Math.exp(-t * (2.2 + freq / 400));
    const attack = Math.min(1, t * 220);
    // tiếng bật dây ngắn
    const buzz = t < 0.02 ? (Math.random() * 2 - 1) * 0.25 * (1 - t / 0.02) : 0;
    out[i] = (s * env * attack * 0.22 + buzz) * amp;
  }
  return { data: out, pan };
}

// Bè trầm (drone) rung nhẹ
function drone(freq, dur, amp) {
  const len = Math.floor(dur * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const lfo = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.08 * t);
    out[i] = (Math.sin(2 * Math.PI * freq * t) * 0.7 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.2) * lfo * amp;
  }
  return out;
}

function makeTrack(seed, seconds, opts) {
  const rnd = (() => { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
  const n = Math.floor(seconds * SR);
  const L = new Float32Array(n), R = new Float32Array(n);

  // bè trầm
  const base = SCALE[0] / 2;
  const dr = drone(base, seconds, opts.droneAmp);
  for (let i = 0; i < n; i++) { L[i] += dr[i] * 0.9; R[i] += dr[i] * 0.9; }

  // giai điệu: bước đi ngẫu nhiên trên thang ngũ cung, có nghỉ
  let idx = 2;
  let t = 0.4;
  while (t < seconds - 2) {
    const noteDur = 1.2 + rnd() * 2.2;
    if (rnd() > opts.restChance) {
      idx = Math.max(0, Math.min(SCALE.length - 1, idx + Math.round((rnd() - 0.5) * 4)));
      const f = SCALE[idx] * (rnd() < 0.12 ? 2 : 1);
      const p = pluck(f, Math.min(4.5, noteDur + 1.6), opts.noteAmp, (rnd() - 0.5) * 0.6);
      const start = Math.floor(t * SR);
      for (let i = 0; i < p.data.length && start + i < n; i++) {
        const gl = (1 - p.pan) / 2, gr = (1 + p.pan) / 2;
        L[start + i] += p.data[i] * gl;
        R[start + i] += p.data[i] * gr;
      }
    }
    t += noteDur * (opts.tempo || 1);
  }

  // reverb đơn giản (comb delay)
  const d = Math.floor(0.13 * SR);
  for (let i = d; i < n; i++) {
    L[i] += L[i - d] * 0.28;
    R[i] += R[i - d] * 0.28;
  }

  // fade in/out để lặp mượt
  const fade = Math.floor(2.5 * SR);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    L[i] *= g; R[i] *= g;
    L[n - 1 - i] *= g; R[n - 1 - i] *= g;
  }
  // chuẩn hoá
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = peak > 0 ? 0.82 / peak : 1;
  for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; }
  return { L, R };
}

const OUT = 'D:/5 caucavancan/CauCaOnline/_internal/app/public/assets/music';
const tracks = [
  { file: 'vn-dong-que-1.wav', seed: 20261106, sec: 78, opts: { droneAmp: 0.09, noteAmp: 1.0, restChance: 0.32, tempo: 1.0 } },
  { file: 'vn-dong-que-2.wav', seed: 77112233, sec: 84, opts: { droneAmp: 0.07, noteAmp: 0.9, restChance: 0.42, tempo: 1.15 } },
  { file: 'vn-dong-que-3.wav', seed: 31415926, sec: 80, opts: { droneAmp: 0.11, noteAmp: 1.05, restChance: 0.25, tempo: 0.9 } },
  { file: 'vn-dong-que-4.wav', seed: 55512345, sec: 76, opts: { droneAmp: 0.06, noteAmp: 0.85, restChance: 0.5, tempo: 1.25 } }
];

for (const t of tracks) {
  const { L, R } = makeTrack(t.seed, t.sec, t.opts);
  writeWav(path.join(OUT, t.file), L, R);
  console.log('xong', t.file, (fs.statSync(path.join(OUT, t.file)).size / 1048576).toFixed(1), 'MB');
}
