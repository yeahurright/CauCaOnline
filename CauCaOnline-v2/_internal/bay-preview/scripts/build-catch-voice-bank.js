const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { BANK_DIR, PREVIEW_BANK_DIR, SAMPLE_RATE, REGIONAL_VOICES, LETTERS, NAME_WORDS, FIXED_CLIPS, SYSTEM_CLIPS, NUMBER_CLIPS, CATCH_JOKES,
  ADAM_CATCH_INTRO, DEMO_NAME_WORDS, demoCatchPhrases } = require('../lib/catch-voice-bank');
const { fishEffectsForMap } = require('../lib/fish-sale');
const { ANOMALIES, anomalyEffects } = require('../lib/pond-anomalies');

const app = path.join(__dirname, '..');
const workerDir = path.join(app, 'tts');
const server = fs.readFileSync(path.join(app, 'server.js'), 'utf8');
const start = server.indexOf('const FISH_CATALOG =');
const end = server.indexOf('const TRASH_IDS =', start);
const fish = vm.runInNewContext(`${server.slice(start, end)}\nFISH_CATALOG`);
const actorsStart = server.indexOf('const DEMO_ACTORS =');
const actors = vm.runInNewContext(`${server.slice(actorsStart, server.indexOf('];', actorsStart) + 2)}\nDEMO_ACTORS`);
const demoPhrases = demoCatchPhrases(actors, Math.ceil(Math.max(...fish.map(item => item.maxWeight))));
const effects = [...['still', 'spring', 'lotus', 'bay'].flatMap(fishEffectsForMap), ...anomalyEffects];
const voices = ['Adam bựa', ...REGIONAL_VOICES];
const aphorismStart = server.indexOf('const APHORISMS =');
const aphorisms = vm.runInNewContext(`${server.slice(aphorismStart, server.indexOf('];', aphorismStart) + 2)}\nAPHORISMS`);
const systemPhrases = [ADAM_CATCH_INTRO, ...DEMO_NAME_WORDS,
  ...Object.values(ANOMALIES).map(anomaly => anomaly.announcement), ...Object.values(SYSTEM_CLIPS), ...aphorisms];
const phrases = [...new Set([
  ...Object.values(FIXED_CLIPS), ...NUMBER_CLIPS, ...Object.values(LETTERS), ...NAME_WORDS,
  ...fish.map(item => item.name), ...effects.map(effect => `bị ${effect.name.toLocaleLowerCase('vi-VN')}`),
  ...anomalyEffects.filter(effect => effect.multiplier > 0).map(effect => effect.description)
])];

function trimClip(wav) {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 36, 40) !== 'data' ||
      wav.readUInt32LE(24) !== SAMPLE_RATE || wav.readUInt16LE(22) !== 1 || wav.readUInt16LE(34) !== 16) {
    throw Error('Expected mono PCM16 WAV at 48 kHz');
  }
  const data = wav.subarray(44, 44 + wav.readUInt32LE(40));
  let first = 0;
  let last = data.length - 2;
  while (first < last && Math.abs(data.readInt16LE(first)) < 110) first += 2;
  while (last > first && Math.abs(data.readInt16LE(last)) < 110) last -= 2;
  if (last <= first) throw Error('Worker returned a silent clip');
  const padding = SAMPLE_RATE * 2 * .06;
  return data.subarray(Math.max(0, first - padding), Math.min(data.length, last + 2 + padding));
}

async function renderVoice(voice, phrases, index, outputDir = BANK_DIR) {
  const proc = spawn(path.join(workerDir, 'tts_worker.exe'), [], {
    cwd: app, windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, TEMPLE_APP_ROOT: workerDir, PYTHONIOENCODING: 'utf-8' }
  });
  const lines = createInterface({ input: proc.stdout });
  const frames = [];
  const clips = Object.create(null);
  let offset = 0;
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => { proc.kill(); reject(Error(`Worker timed out for ${voice}`)); }, 900_000);
    const send = id => proc.stdin.write(JSON.stringify({ id, text: phrases[id], voice }) + '\n');
    proc.on('error', error => { clearTimeout(deadline); reject(error); });
    proc.on('exit', () => {
      clearTimeout(deadline);
      if (frames.length === phrases.length) resolve();
      else reject(Error(`Worker exited for ${voice} at ${frames.length}/${phrases.length}`));
    });
    lines.on('line', raw => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'ready') { send(0); return; }
        if (msg.type !== 'result') return;
        if (!msg.ok || !msg.audioBase64) throw Error(`Could not render ${voice}: ${phrases[msg.id]}`);
        const pcm = trimClip(Buffer.from(msg.audioBase64, 'base64'));
        frames.push(pcm);
        clips[phrases[msg.id]] = [offset, pcm.length];
        offset += pcm.length;
        if (frames.length === phrases.length) proc.stdin.end();
        else send(frames.length);
      } catch (error) { proc.kill(); reject(error); }
    });
  });
  const audio = Buffer.concat(frames);
  const hash = createHash('sha256').update(audio).digest('hex').slice(0, 12);
  const file = `voice-${index}-${hash}.pcm`;
  fs.writeFileSync(path.join(outputDir, file), audio);
  console.log(`${voice}: ${frames.length} clips (${(offset / 1e6).toFixed(1)} MB)`);
  return [voice, { file, clips }];
}

async function main() {
  const previewMode = process.argv[2];
  if (previewMode === '--preview-lines' || previewMode === '--preview-aphorisms') {
    fs.mkdirSync(PREVIEW_BANK_DIR, { recursive: true });
    const indexFile = path.join(PREVIEW_BANK_DIR, 'index.json');
    const previous = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {};
    const jobs = previewMode === '--preview-lines'
      ? [{ voice: voices[0], clips: Object.values(CATCH_JOKES).flat(), index: 0 }]
      : REGIONAL_VOICES.map((voice, index) => ({
        voice, index: index + 1, clips: aphorisms.filter((_, i) => i % REGIONAL_VOICES.length === index)
      }));
    const builds = [];
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, async () => {
      while (jobs.length) {
        const { voice, clips, index } = jobs.shift();
        if (clips.length) builds.push(await renderVoice(voice, clips, index, PREVIEW_BANK_DIR));
      }
    }));
    const tempIndex = `${indexFile}.tmp`;
    fs.writeFileSync(tempIndex, JSON.stringify({ ...previous, ...Object.fromEntries(builds) }, null, 2));
    fs.renameSync(tempIndex, indexFile);
    return;
  }
  fs.mkdirSync(BANK_DIR, { recursive: true });
  const jobs = voices.map((voice, index) => ({ voice, index }));
  const builds = [];
  const concurrency = Math.min(jobs.length, Math.max(1, Math.trunc(Number(process.argv[2]) || 4)));
  console.log(`${phrases.length} clips per voice, ${concurrency} workers`);
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (jobs.length) {
      const { voice, index } = jobs.shift();
      const clips = index === 0 ? [...new Set([...phrases, ...systemPhrases, ...demoPhrases])] : phrases;
      builds.push(await renderVoice(voice, clips, index));
    }
  }));
  const tempIndex = path.join(BANK_DIR, 'index.json.tmp');
  fs.writeFileSync(tempIndex, JSON.stringify(Object.fromEntries(builds), null, 2));
  fs.renameSync(tempIndex, path.join(BANK_DIR, 'index.json'));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
