// Tu lai phong live: cham ngon moi 30 giay, xoay giong + xoay toc do doc
const http = require('http');
const fs = require('fs');
const path = require('path');

const INTERVAL_MS = Number(process.env.AUTO_INTERVAL_MS || 30000);
const STOP_FILE = 'D:\\5 caucavancan\\STOP-AUTOPILOT.txt';
const LOG_FILE = 'D:\\5 caucavancan\\autopilot.log';
const LOCK_FILE = path.join(__dirname, 'autopilot.pid');

// Chi chay 1 ban autopilot du server tu khoi dong hay nguoi dung bam tay
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
}
try {
  const oldPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
  if (oldPid && oldPid !== process.pid && alive(oldPid)) {
    console.log('autopilot already running');
    process.exit(0);
  }
} catch (_) {}
try { fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8'); } catch (_) {}
function releaseLock() {
  try {
    if (parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10) === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch (_) {}
}
process.on('exit', releaseLock);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// Xoay vong nhieu giong khac nhau
const VOICES = [
  'Hải Đăng', 'Mai Anh', 'Trúc Ly', 'Thiện Minh',
  'Ngọc Huyền', 'Quang Sơn', 'Thùy Dung', 'Minh Đức',
  'Thanh Bình', 'Ngọc Linh', 'Đức Trí', 'Quốc Tuấn'
];
// Xoay vong toc do doc
const SPEEDS = [0.95, 1.0, 1.05, 1.1];

function log(line) {
  try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`); } catch (_) {}
}

function rpc(method, params) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params });
    const req = http.request({
      host: '127.0.0.1', port: 3001, path: '/rpc', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 40000
    }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).result); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

const LOW = [
  'Chào mừng cả nhà đến hồ câu cá, cùng xem hôm nay ai may mắn nha!',
  'Hồ câu đang yên ả, cả nhà thư giãn cùng nhau nha.',
  'Hồ câu đang mở, cả nhà ngồi chơi ngắm nước nha.',
  'Buổi câu bắt đầu, cả nhà thư giãn cùng hồ nước.',
  'Hồ vắng nên yên tĩnh, cả nhà nghe tiếng nước cho vui.'
];
const MID = [
  'Cả nhà ơi, hồ đang vui lắm, cùng xem ai câu được cá to nha!',
  'Không khí hồ câu đang rộn ràng, cả nhà thưởng thức nha.',
  'Hồ câu bắt đầu có khách, cả nhà cùng xem nha.',
  'Cả nhà ơi, hồ đang nhộn dần rồi, cùng ngồi xem.',
  'Không khí hồ câu khá vui, cả nhà thưởng thức nha.'
];
const HIGH = [
  'Đông vui quá rồi! Cả nhà cùng xem ai là người may mắn tiếp theo nha!',
  'Hồ câu hôm nay đông thật, chúc cả nhà xem vui vẻ!',
  'Hồ đông vui quá, cả nhà cùng xem ai câu được cá to nha!',
  'Đông thế này thì cá ra liên tục, cả nhà chú ý nha!',
  'Cả nhà đông đủ rồi, cùng xem bảng vàng thay đổi nha!'
];

const HYPE = [
  'Câu cá không chỉ là câu cá, mà là câu cái bình yên.',
  'Cần câu càng cong, cá càng to.',
  'Ngồi lâu thì cá cắn, kiên nhẫn thì cá về.',
  'Hồ sâu cá lớn, lòng tĩnh cá tin.',
  'Cá không ăn mồi thì đổi mồi, chứ đừng đổi hồ.',
  'Câu cá như câu duyên, kiên nhẫn chính là thính.',
  'Nước trong thì không có cá, hồ này nước đục nên cá đầy.',
  'Ai câu cá mà chẳng từng ngồi im một mình.',
  'Cá lớn không vội, người câu giỏi không gấp.',
  'Mồi ngon cá đến, lòng thành cá ở.',
  'Câu được cá là duyên, câu không được là chuyện thường.',
  'Thả câu từ sáng tới chiều, được con cá cũng là cái duyên.',
  'Hồ này lặng gió, chỉ chờ người kiên nhẫn.',
  'Người câu giỏi không phải người câu nhiều nhất, mà là người ngồi lâu nhất.',
  'Một con cá to đáng hơn mười con cá nhỏ, nhưng cả mười đều đáng mừng.',
  'Cá chưa cắn thì tại cá, không tại mồi.',
  'Thuyền to sóng lớn, hồ nhỏ cá hiền.',
  'Ai rồi cũng có lúc câu được cá, miễn là còn ngồi đó.',
  'Mỗi lần thả cần là một lần hy vọng, mà hy vọng thì không bao giờ lỗi thời.',
  'Cá chẳng bao giờ đến sớm, nhưng cũng chẳng bao giờ đến muộn.',
  'Người ngồi lâu nhất chưa chắc câu được nhiều nhất, nhưng chắc chắn bình yên nhất.',
  'Hồ càng vắng, tiếng nước càng rõ, lòng người càng nhẹ.',
  'Đừng đếm cá trong giỏ, hãy đếm những buổi chiều đã ngồi đây.',
  'Cần câu không bắt được cá, người kiên nhẫn mới bắt được.',
  'Cá lớn thường đến sau cùng, như phần thưởng cho người không bỏ về.',
  'Một buổi câu yên tĩnh đáng giá hơn mười buổi câu ồn ào.',
  'Nước lặng không có nghĩa là không có cá, chỉ là cá đang suy nghĩ.',
  'Thả cần xuống rồi thì đừng sốt ruột, hồ đã nghe lời rồi.',
  'Người câu cá giỏi là người biết im lặng đúng lúc.',
  'Cá cắn câu không phải vì mồi ngon, mà vì người thả mồi kiên nhẫn.',
  'Mỗi con cá là một câu chuyện, mỗi lần trượt là một bài học.',
  'Hồ này không vội, người ngồi đây cũng không vội.',
  'Đời người như mặt hồ, phẳng lặng hay gợn sóng đều là cảnh đẹp.',
  'Câu cá dạy ta rằng chờ đợi cũng là một cách tiến về phía trước.',
  'Cá to thì ít, cá nhỏ thì nhiều, nhưng niềm vui thì bằng nhau.',
  'Ngồi bên hồ, nghe nước, nghe gió, nghe cả lòng mình lắng lại.',
  'Cần câu cầm chắc, tâm trí để lỏng, cá sẽ tự tìm đến.',
  'Không phải ngày nào cũng có cá, nhưng ngày nào cũng đáng ngồi.',
  'Người câu cá không bao giờ thất vọng, chỉ là chưa tới lúc.',
  'Hồ sâu không bằng lòng người sâu, nhưng cá ở đây thật thà hơn.',
  'Một cần câu, một ấm trà, một buổi chiều là đủ một đời vui.',
  'Cá nhỏ cũng là cá, miễn là mình còn ngồi đây.',
  'Thả cần là gieo duyên, kéo cần là nhận duyên.',
  'Ai cũng muốn cá to, nhưng người ngồi lâu mới hiểu cá nhỏ cũng quý.',
  'Nắng lên thì cá lặn, chiều xuống thì cá về, đời cũng vậy.',
  'Đừng hỏi hồ có cá không, hỏi mình có đủ kiên nhẫn không.',
  'Câu cá là cách nói chuyện với chính mình mà không cần lên tiếng.',
  'Cá cắn hay không là chuyện của cá, ngồi hay không là chuyện của mình.',
  'Hồ nước này đã chứng kiến bao nhiêu người đến rồi đi, chỉ có cá là ở lại.',
  'Mồi thơm không bằng tay chắc, tay chắc không bằng lòng tĩnh.',
  'Ai vội thì mất phao, ai chậm thì mất cá, người vừa phải thì vui.',
  'Câu cá không phải để giết thời gian, mà để thời gian trôi nhẹ hơn.',
  'Cá quẫy một cái là bao nhiêu mệt mỏi tan hết.',
  'Hồ câu là nơi người ta học cách chờ mà không thấy sốt ruột.',
  'Nước chảy đá mòn, kiên nhẫn thì cá cắn, đời cũng vậy thôi.',
  'Đừng nhìn phao quá lâu, hãy nhìn mặt hồ cho lòng dịu lại.'
];

// Câu hỏi tương tác
const QUESTIONS = [
  'Cả nhà đoán xem con cá tiếp theo nặng bao nhiêu ký?',
  'Ai đang xem hồ này lâu nhất, giơ tay lên nào!',
  'Cả nhà thích cá to hay cá đẹp hơn?',
  'Đố cả nhà biết hôm nay ai sẽ vượt lên dẫn đầu?',
  'Có ai từng câu được con cá to hơn con này chưa?',
  'Cả nhà ơi, hồ này nên thêm loại cá gì nữa?',
  'Ai đoán đúng con cá tiếp theo vượt mốc mười ký?',
  'Cả nhà ơi, ai đang ngồi câu cùng hồ này lâu nhất rồi?',
  'Đoán xem lát nữa con cá nào sẽ xuất hiện tiếp theo?',
  'Cả nhà thích cá vàng, cá koi hay cá trê hoàng kim hơn?',
  'Ai từng câu được con cá nặng nhất hôm nay rồi?',
  'Cả nhà nghĩ hồ này nên thả thêm cá gì cho vui?',
  'Ai đang xem mà chưa từng câu được cá to, giơ tay nào?',
  'Đố cả nhà con cá tiếp theo sẽ trên hay dưới năm ký?',
  'Cả nhà ơi, hôm nay ai là người may mắn nhất hồ?',
  'Ai thích ngồi câu buổi sáng hơn buổi chiều?',
  'Cả nhà thấy hồ này nên thêm sen hay thêm đèn lồng?',
  'Ai đoán được con cá tiếp theo nặng đúng con số này?',
  'Cả nhà ơi, cá to nhất hôm nay đã xuất hiện chưa?',
  'Ai đang xem từ đầu buổi tới giờ, điểm danh nào?',
  'Cả nhà nghĩ ai sẽ vượt lên dẫn đầu trong lượt tới?',
  'Đố cả nhà biết con cá nào hiếm nhất trong hồ này?',
  'Cả nhà ơi, ai từng câu được cá nặng hơn mười ký chưa?',
  'Hôm nay hồ lặng thế này, cả nhà đoán cá to hay cá nhỏ?'
];
// Người chỉ dẫn luật chơi
const GUIDE = [
  'Hồ câu chọn người ngẫu nhiên trong số người đang xem, không cần làm gì cả.',
  'Ai đang xem cũng có thể được chọn, cả nhà cứ thư giãn xem thôi.',
  'Cá to hay bé là do nhân phẩm từng người, cả nhà cứ vui vẻ nha.',
  'Người câu nhiều thì dễ gặp cá bé, người mới vào thì hay gặp cá to.',
  'Rời hồ quá lâu thì hệ thống sẽ nhường suất cho người khác đó nha.',
  'Hồ câu tự chọn người may mắn trong số người đang xem, cả nhà cứ ngồi chơi thôi.',
  'Không cần bấm gì cả, hệ thống tự chọn người và tự đọc tên.',
  'Cá to hay nhỏ là do may mắn từng lượt, cả nhà đừng ngại.',
  'Ai vào xem lâu thì càng có nhiều lượt được chọn.',
  'Nếu rời hồ quá lâu, suất sẽ nhường cho người khác đang xem.',
  'Mỗi lượt chọn vài người, lần lượt hiện cá từ nhỏ đến to.',
  'Con cá cuối cùng là con to nhất, cả nhà chú ý nha.',
  'Thỉnh thoảng sẽ có cú lừa, con nhỏ nhất lại về đích sau cùng.',
  'Bảng vàng bên phải cập nhật liên tục, ai nặng nhất đứng đầu.',
  'Cả nhà cứ xem, hồ câu tự chạy, không cần thao tác gì.'
];
// Lịch xoay các kiểu nói
// Giảm mạnh CHÂM NGÔN (PROVERB) ở autopilot: châm ngôn chính giờ do SERVER đọc sau mỗi
// vòng câu bằng giọng vùng miền (nhiều "người khác"). Autopilot tập trung kéo tương tác.
const SCHEDULE = [
  'PROVERB', 'QUESTION', 'NOTE', 'PERSONAL', 'QUESTION',
  'CHARACTER', 'PERSONAL', 'GUIDE', 'QUESTION', 'PERSONAL'
];
let schedIdx = 0, qIdx = 0, guideIdx = 0, personalIdx = 0;

let tick = 0;
let misses = 0;
let hypeIdx = 0;
let noteIdx = 0;
let voiceIdx = 0;
let speedIdx = 0;
let charIdx = 0;

// Nhan vat dac biet: giong khac + toc do khac + cau noi co "chat" rieng
const CHARACTERS = [
  { voice: 'Thiền Tâm Đức', speed: 0.85, text: 'Răng rứa cả nhà? Câu cá là phải kiên nhẫn nghe chưa. Ngồi lâu rồi cá cũng cắn thôi.' },
  { voice: 'Xuân Vĩnh', speed: 0.88, text: 'Hồi đó tui câu được con cá to lắm, mà con bữa nay còn to hơn nữa. Cả nhà ráng lên nghe.' },
  { voice: 'Adam', speed: 1.12, text: 'Hello cả nhà! Hồ cá này đẹp thật đó nha, cùng xem cho vui!' },
  { voice: 'Quốc Tuấn', speed: 1.08, text: 'Cá to quá xá, số dzách luôn cả nhà ơi!' },
  { voice: 'Mai Anh', speed: 1.1, text: 'Cả nhà ơi, hồ này vui quá trời!' },
  { voice: 'Phạm Tuyên', speed: 1.0, text: 'Câu cá cũng như câu duyên, kiên nhẫn chính là thính, cả nhà ạ.' },
  { voice: 'Thiện Minh', speed: 0.95, text: 'Trời hôm nay đẹp quá, nước lặng cá ăn, cả nhà chuẩn bị tinh thần câu cá to nha.' },
  { voice: 'Ngọc Trân', speed: 1.08, text: 'Ui trời ơi, hồ này cá nhiều ghê cả nhà ạ!' },
  { voice: 'Quang Sơn', speed: 0.95, text: 'Cả nhà ơi, ngồi đây nghe nước chảy cũng đủ thấy nhẹ lòng rồi.' },
  { voice: 'Thùy Dung', speed: 1.05, text: 'Hồ này đẹp thiệt, cá thì nhiều, cả nhà cứ ngồi chơi nha.' },
  { voice: 'Minh Triết', speed: 1.0, text: 'Tui ngồi đây cả buổi rồi, cá chưa cắn mà lòng đã vui.' },
  { voice: 'Kim Thanh', speed: 1.02, text: 'Trời chiều xuống đẹp quá, cả nhà cùng ngắm hồ nha.' },
  { voice: 'Thái Sơn', speed: 0.98, text: 'Câu cá là phải từ từ, gấp gáp là mất phao liền đó cả nhà.' }
];

async function step() {
  if (fs.existsSync(STOP_FILE)) { log('STOP -> thoat'); process.exit(0); }

  const st = await rpc('fishing.getState', {});
  if (!st) {
    misses++;
    log(`khong lay duoc state (${misses}/20)`);
    if (misses >= 20) { log('mat ket noi server -> thoat'); process.exit(0); }
    return;
  }
  misses = 0;
  if (!st.tiktok || !st.tiktok.connected) { log('chua live -> bo qua'); return; }

  const viewers = st.tiktok.viewerCount || 0;
  const seated = (st.seating && st.seating.occupied) || 0;
  // Đang live là đọc, kể cả khi TikTok chưa trả về viewerCount

  // Uu tien: cu 4 luot thi 1 luot nhan vat (~2 phut), cu 5 luot thi 1 luot nhac, con lai cham ngon
  const kind = SCHEDULE[schedIdx % SCHEDULE.length];
  schedIdx++;
  let mode, text, voice, speed;
  const nextVoiceSpeed = () => {
    const v = VOICES[voiceIdx % VOICES.length]; voiceIdx++;
    const sp = SPEEDS[speedIdx % SPEEDS.length]; speedIdx++;
    return [v, sp];
  };

  if (kind === 'CHARACTER') {
    const c = CHARACTERS[charIdx % CHARACTERS.length];
    charIdx++;
    mode = 'NHANVAT'; text = c.text; voice = c.voice; speed = c.speed;
  } else if (kind === 'NOTE') {
    const pool = seated >= 8 ? HIGH : seated >= 3 ? MID : LOW;
    mode = 'NHAC';
    text = pool[noteIdx % pool.length];
    noteIdx++;
    [voice, speed] = nextVoiceSpeed();
  } else if (kind === 'QUESTION') {
    mode = 'HOI';
    text = QUESTIONS[qIdx % QUESTIONS.length];
    qIdx++;
    [voice, speed] = nextVoiceSpeed();
  } else if (kind === 'GUIDE') {
    mode = 'CHIDAN';
    text = GUIDE[guideIdx % GUIDE.length];
    guideIdx++;
    [voice, speed] = nextVoiceSpeed();
  } else if (kind === 'PERSONAL') {
    // CHỈ đọc người ĐANG CÓ MẶT (active). Không đọc người đã rời live.
    const all = Array.isArray(st.leaderboard) ? st.leaderboard : [];
    let board = all.filter(p => p && p.active === true && p.name);
    if (!board.length) {
      // Dự phòng: dùng danh sách người đang ngồi ghế (đang có mặt), sắp theo kg
      board = (Array.isArray(st.seatedAnglers) ? st.seatedAnglers : [])
        .filter(p => p && p.name)
        .sort((a, b) => (b.totalWeightKg || 0) - (a.totalWeightKg || 0));
    }
    const top = board[0];
    const second = board[1];
    const topKg = top ? (Number(top.totalWeightKg) || 0) : 0;
    const secondKg = second ? (Number(second.totalWeightKg) || 0) : 0;
    if (!top || topKg <= 0) {
      // Không có ai đang xem, hoặc chưa ai câu được cá → đọc châm ngôn (tránh "0 ký")
      mode = 'CHAMNGON';
      text = HYPE[hypeIdx % HYPE.length]; hypeIdx++;
    } else if (personalIdx % 2 === 0 || !second || secondKg <= 0) {
      mode = 'CANHAN';
      text = `${top.name} đang dẫn đầu với ${top.totalWeightKg} ký, ${top.catchesCount} con cá. Ai vượt được không ta?`;
      personalIdx++;
    } else {
      mode = 'CANHAN';
      text = `${top.name} dẫn đầu với ${top.totalWeightKg} ký, ${second.name} bám sát với ${second.totalWeightKg} ký. Gay cấn quá cả nhà ơi!`;
      personalIdx++;
    }
    [voice, speed] = nextVoiceSpeed();
  } else {
    mode = 'CHAMNGON';
    text = HYPE[hypeIdx % HYPE.length];
    hypeIdx++;
    [voice, speed] = nextVoiceSpeed();
  }
  tick++;

  // Doi toc do doc (ap dung cho ca giong doc chung)
  await rpc('fishing.setSettings', { ttsSpeed: speed });
  const r = await rpc('fishing.speak', { text, voice });
  log(`v=${viewers} ghe=${seated} [${mode}] ${voice} x${speed} ${r && r.ok ? 'ok' : 'fail'} | ${text}`);
}

log(`AUTOPILOT start interval=${INTERVAL_MS}ms voices=${VOICES.length} speeds=${SPEEDS.length}`);
step();
setInterval(step, INTERVAL_MS);
