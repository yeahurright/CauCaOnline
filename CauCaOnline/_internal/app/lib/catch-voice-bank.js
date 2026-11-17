const fs = require('node:fs');
const path = require('node:path');
const { isNonFishItem } = require('./fish-sale');

const BANK_DIR = path.join(__dirname, '..', 'tts', 'data', 'catch-voice-bank');
const APHORISM_BANK_DIR = path.join(__dirname, '..', 'voice-bank');
const SAMPLE_RATE = 48000;
const REGIONAL_VOICES = ['Quang Sơn', 'Ngọc Trân', 'Thùy Dung', 'Thái Sơn', 'Minh Triết', 'Mỹ Duyên', 'Đức Trí', 'Kim Thanh', 'Thục Đoan'];
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const LETTER_NAMES = 'chữ a|bê|xê|dê|chữ e|ép|gờ|hát|chữ i|giây|ca|e lờ|em mờ|en nờ|chữ o|pê|quy|e rờ|ét|tê|chữ u|vê|vê kép|ích|y dài|dét'.split('|');
const LETTERS = Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz'].map((letter, index) => [letter, LETTER_NAMES[index]]));
const NAME_WORDS = 'an anh bảo bình chi châu dũng dung duy dương giang hà hải hạnh hiếu hoa hoàng hồng huy hùng khoa lan linh long mai minh my mỹ nam nga ngân ngọc nguyên nhung phong phúc phương quang quân quỳnh sơn tâm thanh thảo thắng thùy thục tiến trâm trang trân trí trung tuấn tuyết uyên vi việt vinh xuân yến'.split(' ');
const ADAM_CATCH_INTRO = 'Chúc mừng';
const DEMO_NAME_WORDS = ['bạn', 'mẫu'];
const nameWithoutTones = word => word.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
const NAME_ALIASES = new Map(NAME_WORDS.map(word => [nameWithoutTones(word), word]));
const FIXED_CLIPS = {
  caught: 'câu được', broken: 'Gãy cần!', missed: 'hụt', rodCost: 'Mất một trăm xèng.',
  kg: 'ký', noSale: 'Bán được không xèng.', unknown: 'cần thủ',
  replaceRod: 'vừa thay cần, trừ một trăm xèng nha!',
  pondFee: 'Hồ vừa thu phí câu cá, sáu mươi xèng mỗi người đến lượt nha!'
};
const SYSTEM_CLIPS = {
  thanks: 'Cảm ơn', gift: 'đã tặng quà cho hồ!',
  milestone: 'chạm mốc một nghìn xèng!', featured: 'vừa ghé hồ.',
  opening: 'Cả nhà ơi, hồ mình còn đúng một lượt nữa là đóng cửa nha. Coi thử ai câu được con cá chốt sổ hôm nay!',
  closing: 'Rồi, cá tan ca, chủ hồ cũng cuốn cần đây. Cảm ơn cả nhà đã ngồi chơi tới giờ. Mai mình lại mở hồ, hẹn gặp cả nhà nha!'
};
const NUMBER_CLIPS = [...DIGITS, 'mười', 'mươi', 'trăm', 'lẻ', 'mốt', 'lăm', 'phẩy'];

function numberParts(value) {
  const [whole, decimals] = Number(value).toFixed(2).replace(/\.?0+$/, '').split('.');
  const number = Number(whole);
  const hundreds = Math.floor(number / 100);
  const tens = Math.floor(number / 10) % 10;
  const units = number % 10;
  const parts = hundreds ? [DIGITS[hundreds], 'trăm'] : [];
  if (tens === 1) parts.push('mười');
  if (tens > 1) parts.push(DIGITS[tens], 'mươi');
  if (hundreds && !tens && units) parts.push('lẻ');
  if (units || !number) parts.push(units === 5 && tens ? 'lăm' : units === 1 && tens > 1 ? 'mốt' : DIGITS[units]);
  if (decimals) parts.push('phẩy', ...[...decimals].map(digit => DIGITS[digit]));
  return parts;
}

function demoCatchIntro(name) {
  return `${ADAM_CATCH_INTRO} ${name.toLocaleLowerCase('vi-VN')} ${FIXED_CLIPS.caught}`;
}

function demoCatchPhrases(actors, maxKg) {
  const phrases = actors.map(({ user }) => demoCatchIntro(user));
  for (let kg = 0; kg <= maxKg; kg++) {
    const whole = numberParts(kg).join(' ');
    phrases.push(whole, `${whole} ${FIXED_CLIPS.kg}`);
  }
  for (let hundredths = 1; hundredths < 100; hundredths++) {
    const decimal = numberParts(hundredths / 100).slice(1).join(' ');
    phrases.push(`${decimal} ${FIXED_CLIPS.kg}`, `${DIGITS[0]} ${decimal} ${FIXED_CLIPS.kg}`);
  }
  return phrases;
}

function catchWeightParts(kg, clips, usePhrases) {
  const parts = [...numberParts(kg), FIXED_CLIPS.kg];
  if (!usePhrases) return parts;
  const complete = parts.join(' ');
  if (Object.hasOwn(clips, complete)) return [complete];
  const split = parts.indexOf('phẩy');
  if (split <= 0) return parts;
  const chunks = [parts.slice(0, split).join(' '), parts.slice(split).join(' ')];
  return chunks.every(chunk => Object.hasOwn(clips, chunk)) ? chunks : parts;
}

function nameParts(name, clips) {
  const parts = [];
  const words = name.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2').toLocaleLowerCase('vi-VN').split(/\s+/u);
  for (const word of words) {
    const plain = nameWithoutTones(word);
    const known = NAME_WORDS.includes(word) || DEMO_NAME_WORDS.includes(word) ? word : NAME_ALIASES.get(plain);
    if (known && Object.hasOwn(clips, known)) {
      parts.push(known);
      continue;
    }
    if (word) parts.push(word);
  }
  return parts.length ? parts : [FIXED_CLIPS.unknown];
}

function catchParts(name, fish, newcomer, clips, congratulations = false) {
  const named = nameParts(name, clips);
  if (fish.rodBroken) return [FIXED_CLIPS.broken, ...named, FIXED_CLIPS.missed, fish.name, FIXED_CLIPS.rodCost];
  let intro = [...named, FIXED_CLIPS.caught];
  if (congratulations && !isNonFishItem(fish)) {
    const phrase = demoCatchIntro(name);
    intro = Object.hasOwn(clips, phrase) ? [phrase] : [ADAM_CATCH_INTRO, ...intro];
  }
  const parts = [...intro, fish.name, ...catchWeightParts(fish.weightKg, clips, congratulations)];
  const effect = fish.anomalyEffect || (!newcomer && fish.mutation);
  if (effect) {
    parts.push(`bị ${effect.name.toLocaleLowerCase('vi-VN')}`);
    if (effect.multiplier === 0) parts.push(FIXED_CLIPS.noSale);
    else if (effect.description && !newcomer) parts.push(effect.description);
  }
  return parts;
}

function wavBuffer(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function loadVoiceBank() {
  const load = directory => Object.entries(JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf8')))
    .map(([voice, { file, clips }]) => [voice, { clips, pcm: fs.readFileSync(path.join(directory, file)) }]);
  const bank = new Map(load(BANK_DIR));
  try {
    for (const [voice, extra] of load(APHORISM_BANK_DIR)) {
      const base = bank.get(voice);
      if (!base) {
        bank.set(voice, extra);
        continue;
      }
      const clips = Object.fromEntries(Object.entries(extra.clips)
        .map(([phrase, [offset, length]]) => [phrase, [base.pcm.length + offset, length]]));
      bank.set(voice, { clips: { ...base.clips, ...clips }, pcm: Buffer.concat([base.pcm, extra.pcm]) });
    }
  } catch (error) {
    console.warn('[Kho châm ngôn]', error.message);
  }
  return bank;
}

function assembleVoice(bank, voice, phrases, tightenJoins = false) {
  const pauseAfter = phrase => phrase === FIXED_CLIPS.kg || phrase?.endsWith(` ${FIXED_CLIPS.kg}`) || phrase?.startsWith('bị ');
  const keepBytes = Math.round(SAMPLE_RATE * 0.018) * 2;
  const pcm = Buffer.concat(phrases.map((phrase, index) => {
    const clip = Object.hasOwn(bank.clips, phrase) && bank.clips[phrase];
    if (!clip) throw Error(`Missing ${voice} clip: ${phrase}`);
    const [offset, length] = clip;
    if (offset < 0 || length < 2 || offset + length > bank.pcm.length || offset % 2 !== 0 || length % 2 !== 0) {
      throw Error(`Invalid ${voice} clip: ${phrase}`);
    }
    const audio = bank.pcm.subarray(offset, offset + length);
    if (!tightenJoins) return audio;
    let start = 0;
    let end = length - 2;
    if (index > 0 && !pauseAfter(phrases[index - 1])) {
      while (start < end && Math.abs(audio.readInt16LE(start)) < 110) start += 2;
      start = Math.max(0, start - keepBytes);
    }
    if (index < phrases.length - 1 && !pauseAfter(phrase)) {
      while (end > start && Math.abs(audio.readInt16LE(end)) < 110) end -= 2;
      end = Math.min(length - 2, end + keepBytes);
    }
    return audio.subarray(start, end + 2);
  }));
  return { wav: wavBuffer(pcm), durationSec: pcm.length / (SAMPLE_RATE * 2) };
}

module.exports = { BANK_DIR, SAMPLE_RATE, REGIONAL_VOICES, LETTERS, NAME_WORDS, FIXED_CLIPS, SYSTEM_CLIPS, NUMBER_CLIPS,
  ADAM_CATCH_INTRO, DEMO_NAME_WORDS, demoCatchPhrases, nameParts, catchParts, loadVoiceBank, assembleVoice };
