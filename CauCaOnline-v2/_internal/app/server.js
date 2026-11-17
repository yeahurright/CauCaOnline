const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { PondSeating, isSimulatedAngler, compareAnglers, setSeatIdleMinutes, isActivePerson } = require('./lib/pond-seating');
const { shouldReadCatchCongratulations, SIM_CATCH_VOICE_MODES } = require('./lib/simulation-voice');
const { CommentFishing, SimulationFishing, biteChance } = require('./lib/comment-fishing');
const { fishSaleXu, rollFishMutation, pickFishForMap } = require('./lib/fish-sale');
const { PondScenePoll } = require('./lib/pond-scene-poll');
const { PondActions, parsePondAction } = require('./lib/pond-actions');
let pondScenePoll = new PondScenePoll();
let lastPondSceneBroadcastAt = 0;
const commentFishing = new CommentFishing({ canFish: id => !pondActions.isAway(id) });
const simulationFishing = new SimulationFishing();
const { CatchRoundClock } = require('./lib/catch-round-clock');
let catchRoundClock;
const { LeaderboardResetClock } = require('./lib/leaderboard-reset-clock');
let leaderboardResetClock;
const { spawn } = require('child_process');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const { ensureLoginBrowser, readTikTokSession, fetchRoomAudience } = require('./lib/tiktok-audience');

// Bắt lỗi toàn cục để tránh sập server khi WebSocket hoặc kết nối bên ngoài bị ngắt đột ngột
process.on('uncaughtException', (err) => {
  console.warn('[Process UncaughtException]', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Process UnhandledRejection]', reason?.message || reason);
});

const LOCAL_DEMO = process.argv.includes('--demo');
const PORT = process.env.PORT || (LOCAL_DEMO ? 3023 : 3001);
const DATA_DIR = LOCAL_DEMO ? path.join(require('os').tmpdir(), 'CauCaOnline-v2-demo')
  : process.env.CAUCA_DATA_DIR || path.join(__dirname, 'data');
const DEMO_ACTORS = [
  { uniqueId: 'demo:player', user: 'Bạn' },
  { uniqueId: 'demo:mai', user: 'Mai mẫu' },
  { uniqueId: 'demo:an', user: 'An mẫu' }
];
let demoSession = null;
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
const STATE_FILE = path.join(DATA_DIR, 'fishing-state.json');
const LEGACY_STATE_FILE = path.join(DATA_DIR, 'merit-state.json');

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// 1. BÁCH KHOA CÁ & THỦY QUÁI (FISH CATALOG)
// ============================================================================
const FISH_CATALOG = [
  // Tier 1: Phổ Thông (Common - Tỉ lệ xuất hiện cao)
  {
    id: 'bong_cat',
    name: 'Cá Bống Cát',
    species: 'Glossogobius giuris',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 0.2,
    maxWeight: 0.6,
    points: 10,
    badgeColor: '#546e7a',
    gradient: 'linear-gradient(135deg, #78909c 0%, #455a64 100%)',
    quote: 'Bống bống bang bang, bé hạt tiêu nhưng thịt thơm ngọt lịm!',
    icon: '🐟',
    ttsSummary: 'Cá Bống Cát tươi rói! Bé hạt tiêu nhưng mở hàng siêu may mắn!'
  },
  {
    id: 'ro_dong',
    name: 'Cá Rô Đồng',
    species: 'Anabas testudineus',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 0.3,
    maxWeight: 0.9,
    points: 12,
    badgeColor: '#558b2f',
    gradient: 'linear-gradient(135deg, #7cb342 0%, #33691e 100%)',
    quote: 'Rô đồng béo múp, vây giương oai vệ, đặc sản đồng quê!',
    icon: '🐟',
    ttsSummary: 'Cá Rô Đồng béo mầm, vây giương oai vệ đặc sản đồng quê!'
  },
  {
    id: 'me_hoa',
    name: 'Cá Mè Hoa',
    species: 'Hypophthalmichthys nobilis',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 1.2,
    maxWeight: 2.8,
    points: 15,
    badgeColor: '#00838f',
    gradient: 'linear-gradient(135deg, #00acc1 0%, #006064 100%)',
    quote: 'Mè hoa lượn sóng đầm lầy, đầu to béo ngậy!',
    icon: '🐟',
    ttsSummary: 'Cá Mè Hoa lượn sóng đầm lầy, kéo máy câu ríu rít!'
  },
  {
    id: 'troi_den',
    name: 'Cá Trôi Đen',
    species: 'Cirrhinus microlepis',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 1.5,
    maxWeight: 3.5,
    points: 18,
    badgeColor: '#37474f',
    gradient: 'linear-gradient(135deg, #607d8b 0%, #263238 100%)',
    quote: 'Trôi cắn câu phóng như tàu lượn, ghì máy câu kêu ràn rạt!',
    icon: '🐟',
    ttsSummary: 'Cá Trôi Đen lực lưỡng phóng như tàu lượn xé toạc mặt nước!'
  },
  {
    id: 'tai_tuong',
    name: 'Cá Tai Tượng',
    species: 'Osphronemus goramy',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 1.0,
    maxWeight: 2.6,
    points: 16,
    badgeColor: '#6d4c41',
    gradient: 'linear-gradient(135deg, #8d6e63 0%, #4e342e 100%)',
    quote: 'Tai tượng vảy xòe như quạt ba tiêu, giật cực đã tay!',
    icon: '🐟',
    ttsSummary: 'Cá Tai Tượng vảy xòe như cánh quạt, giật cực đã tay!'
  },

  // Tier 2: Quý Hiếm (Rare)
  {
    id: 'chep_vang',
    name: 'Cá Chép Vàng Cát Tường',
    species: 'Cyprinus carpio aureate',
    rarity: 'Quý Hiếm',
    tier: 2,
    minWeight: 2.5,
    maxWeight: 5.8,
    points: 35,
    badgeColor: '#f9a825',
    gradient: 'linear-gradient(135deg, #ffd54f 0%, #f57f17 100%)',
    quote: 'Chép vàng vượt vũ môn hóa rồng, rước đại cát đại lợi về nhà!',
    icon: '🐠',
    ttsSummary: 'Cá Chép Vàng Cát Tường! Vượt vũ môn hóa rồng mang đại cát đại lợi!'
  },
  {
    id: 'tra_khung',
    name: 'Cá Tra Khủng',
    species: 'Pangasius hypophthalmus',
    rarity: 'Quý Hiếm',
    tier: 2,
    minWeight: 4.0,
    maxWeight: 9.8,
    points: 42,
    badgeColor: '#0277bd',
    gradient: 'linear-gradient(135deg, #29b6f6 0%, #01579b 100%)',
    quote: 'Cá tra béo tròn lủn cũn, quẫy đuôi làm sóng dạt đôi bờ!',
    icon: '🐟',
    ttsSummary: 'Cá Tra Khủng béo tròn, quẫy đuôi làm sóng dạt đôi bờ hồ câu!'
  },
  {
    id: 'lang_hoa',
    name: 'Cá Lăng Đốm Hoa',
    species: 'Hemibagrus guttatus',
    rarity: 'Quý Hiếm',
    tier: 2,
    minWeight: 3.2,
    maxWeight: 7.5,
    points: 48,
    badgeColor: '#6a1b9a',
    gradient: 'linear-gradient(135deg, #ab47bc 0%, #4a148c 100%)',
    quote: 'Đặc sản ghềnh thác sông sâu, kéo máy câu rít từng hồi!',
    icon: '🐡',
    ttsSummary: 'Cá Lăng Đốm Hoa quý hiếm, đặc sản ghềnh thác ghì cong ngọn cần!'
  },
  {
    id: 'chim_trang',
    name: 'Cá Chim Trắng Lưỡi Kiếm',
    species: 'Piaractus brachypomus',
    rarity: 'Quý Hiếm',
    tier: 2,
    minWeight: 2.8,
    maxWeight: 6.2,
    points: 40,
    badgeColor: '#00838f',
    gradient: 'linear-gradient(135deg, #26c6da 0%, #006064 100%)',
    quote: 'Tốc độ xé nước như tia chớp, hàm răng sắc bén như thép!',
    icon: '🐠',
    ttsSummary: 'Cá Chim Trắng tốc độ xé nước như tia chớp, giằng co gay cấn!'
  },

  // Tier 3: Cực Phẩm (Epic / Sát Thủ Đầm Lầy)
  {
    id: 'koi_cam_thach',
    name: 'Cá Koi Ngũ Sắc Hoàng Gia',
    species: 'Cyprinus rubrofuscus var.',
    rarity: 'Cực Phẩm',
    tier: 3,
    minWeight: 5.5,
    maxWeight: 13.5,
    points: 85,
    badgeColor: '#d84315',
    gradient: 'linear-gradient(135deg, #ff7043 0%, #bf360c 100%)',
    quote: 'Tuyệt tác tạo hóa! Vảy ngũ sắc lấp lánh như ngọc lục bảo!',
    icon: '🪸',
    ttsSummary: 'Cực phẩm Cá Koi Ngũ Sắc Hoàng Gia! Vảy ngọc lung linh tuyệt mỹ!'
  },
  {
    id: 'tre_hoang_kim',
    name: 'Cá Trê Hoàng Kim Phát Quang',
    species: 'Clarias gariepinus albino',
    rarity: 'Cực Phẩm',
    tier: 3,
    minWeight: 6.5,
    maxWeight: 15.0,
    points: 95,
    badgeColor: '#ef6c00',
    gradient: 'linear-gradient(135deg, #ffa726 0%, #e65100 100%)',
    quote: 'Trê vàng toàn thân rực ánh hoàng kim, vạn người ao ước!',
    icon: '✨',
    ttsSummary: 'Cực phẩm Cá Trê Hoàng Kim Đột Biến! Toàn thân phát quang lấp lánh!'
  },
  {
    id: 'tam_hoang_gia',
    name: 'Cá Tầm Hoàng Gia Hắc Ngự',
    species: 'Acipenser baerii',
    rarity: 'Cực Phẩm',
    tier: 3,
    minWeight: 8.5,
    maxWeight: 19.5,
    points: 110,
    badgeColor: '#283593',
    gradient: 'linear-gradient(135deg, #5c6bc0 0%, #1a237e 100%)',
    quote: 'Hóa thạch sống sông Danube, vương giả của thế giới thủy sinh!',
    icon: '🦈',
    ttsSummary: 'Cực phẩm Cá Tầm Hoàng Gia Hắc Ngự! Vương giả uy phong ngời ngời!'
  },
  {
    id: 'channa_hoang_de',
    name: 'Cá Chuối Hoàng Đế (Channa)',
    species: 'Channa marulioides',
    rarity: 'Cực Phẩm',
    tier: 3,
    minWeight: 4.8,
    maxWeight: 12.0,
    points: 90,
    badgeColor: '#ad1457',
    gradient: 'linear-gradient(135deg, #ec407a 0%, #880e4f 100%)',
    quote: 'Chúa tể săn mồi đầm lầy, mắt rực lửa hoa văn rồng cuộn!',
    icon: '🐊',
    ttsSummary: 'Cực phẩm Cá Chuối Hoàng Đế! Chúa tể đầm lầy với hoa văn rồng cuộn!'
  },

  // Tier 4: Huyền Thoại (Mythic / Leviathan - Thủy Quái)
  {
    id: 'rong_kim_long',
    name: 'Cá Rồng Bối Đầu Vàng (Kim Long Quá Bối)',
    species: 'Scleropages formosus',
    rarity: 'Huyền Thoại',
    tier: 4,
    minWeight: 18.0,
    maxWeight: 38.5,
    points: 280,
    badgeColor: '#ffb300',
    gradient: 'linear-gradient(135deg, #ffe082 0%, #ff8f00 100%)',
    quote: 'BẬC THẦY PHONG THỦY! Kim Long xuất hải, tài lộc vượng khí cuộn trào!',
    icon: '🐉',
    ttsSummary: 'HUYỀN THOẠI XUẤT HIỆN! Cá Rồng Kim Long Quá Bối xuất hải, tài lộc vượng khí ngập tràn!'
  },
  {
    id: 'thuy_quai_ho_sau',
    name: 'Thủy Quái Hồ Sâu (Cá Hô Khổng Lồ)',
    species: 'Catlocarpio siamensis',
    rarity: 'Huyền Thoại',
    tier: 4,
    minWeight: 42.0,
    maxWeight: 96.0,
    points: 380,
    badgeColor: '#c62828',
    gradient: 'linear-gradient(135deg, #ef5350 0%, #b71c1c 100%)',
    quote: 'VUA CỦA CÁC LOÀI CÁ NƯỚC NGỌT! Cần câu cong vút cực hạn, bọt nước tung trời!',
    icon: '🐋',
    ttsSummary: 'THỦY QUÁI HỒ SÂU! Cá Hô Khổng Lồ kéo cong cần titan, cả bến thuyền cùng hò reo!'
  },
  {
    id: 'rua_than_ngoc',
    name: 'Cụ Rùa Vàng Thần Long',
    species: 'Cuora amboinensis aurea',
    rarity: 'Huyền Thoại',
    tier: 4,
    minWeight: 55.0,
    maxWeight: 99.9,
    points: 500,
    badgeColor: '#e65100',
    gradient: 'linear-gradient(135deg, #ffb74d 0%, #bf360c 100%)',
    quote: 'RÙA VÀNG BÁCH NIÊN! Ban phúc trường thọ trăm tuổi, gia đạo bình an phát tài!',
    icon: '🐢',
    ttsSummary: 'ĐẠI CÁT TƯỜNG! Cụ Rùa Vàng Thần Long nổi lên ban phúc trường thọ gia đạo an khang!'
  },

  // ===== BẢN MỚI: 8 cá + 5 rác + 3 đồ hiếm (ảnh do người dùng gen) =====
  { id: 'dieu_hong', name: 'Cá Điêu Hồng', species: 'Oreochromis mossambicus', rarity: 'Phổ Thông', tier: 1, minWeight: 0.4, maxWeight: 3.0, points: 8, badgeColor: '#ef5350', gradient: 'linear-gradient(135deg,#ff8a80,#c62828)', quote: 'Điêu hồng đỏ au, cắn cần là vui!', icon: '🐠', ttsSummary: 'Cá Điêu Hồng đỏ au lên cân!' },
  { id: 'loc_dong', name: 'Cá Lóc Đồng', species: 'Channa striata', rarity: 'Phổ Thông', tier: 1, minWeight: 0.3, maxWeight: 3.5, points: 9, badgeColor: '#8d6e63', gradient: 'linear-gradient(135deg,#a1887f,#4e342e)', quote: 'Lóc đồng lanh lẹ, kéo căng cả cần!', icon: '🐟', ttsSummary: 'Cá Lóc Đồng lanh lẹ quá!' },
  { id: 'basa_re', name: 'Cá Basa Re', species: 'Pangasius bocourti', rarity: 'Quý Hiếm', tier: 2, minWeight: 3.0, maxWeight: 9.0, points: 40, badgeColor: '#90a4ae', gradient: 'linear-gradient(135deg,#cfd8dc,#455a64)', quote: 'Basa bạc sáng, râu dài vờn nước!', icon: '🐟', ttsSummary: 'Cá Basa Re bạc sáng lên cân!' },
  { id: 'chach_lua', name: 'Cá Chạch Lửa', species: 'Mastacembelus erythrotaenia', rarity: 'Quý Hiếm', tier: 2, minWeight: 2.5, maxWeight: 8.0, points: 45, badgeColor: '#ff7043', gradient: 'linear-gradient(135deg,#ffab40,#bf360c)', quote: 'Chạch lửa uốn lượn như dải lụa cháy!', icon: '🔥', ttsSummary: 'Cá Chạch Lửa rực đỏ!' },
  { id: 'hoi_cau_vong', name: 'Cá Hồi Cầu Vồng', species: 'Oncorhynchus mykiss', rarity: 'Cực Phẩm', tier: 3, minWeight: 6.0, maxWeight: 18.0, points: 120, badgeColor: '#ec407a', gradient: 'linear-gradient(135deg,#f48fb1,#6a1b9a)', quote: 'Dải cầu vồng bơi ngang hồ!', icon: '🌈', ttsSummary: 'Cá Hồi Cầu Vồng lấp lánh!' },
  { id: 'mat_trang', name: 'Cá Mặt Trăng', species: 'Mene maculata', rarity: 'Cực Phẩm', tier: 3, minWeight: 5.0, maxWeight: 16.0, points: 130, badgeColor: '#b0bec5', gradient: 'linear-gradient(135deg,#eceff1,#546e7a)', quote: 'Mặt trăng bạc lơ lửng giữa nước!', icon: '🌙', ttsSummary: 'Cá Mặt Trăng bạc lấp lánh!' },
  { id: 'rong_den', name: 'Rồng Đen Ma Vương', species: 'Scleropages formosus', rarity: 'Huyền Thoại', tier: 4, minWeight: 25.0, maxWeight: 90.0, points: 480, badgeColor: '#b71c1c', gradient: 'linear-gradient(135deg,#ff5252,#212121)', quote: 'Vảy đen rực lửa, rồng thật nổi lên!', icon: '🐉', ttsSummary: 'RỒNG ĐEN MA VƯƠNG xuất hiện!' },
  { id: 'ca_voi', name: 'Cá Voi Ông Tổ', species: 'Balaenoptera omurai', rarity: 'Huyền Thoại', tier: 4, minWeight: 30.0, maxWeight: 120.0, points: 500, badgeColor: '#1565c0', gradient: 'linear-gradient(135deg,#64b5f6,#0d47a1)', quote: 'Cả hồ cúi đầu trước ông tổ!', icon: '🐋', ttsSummary: 'CÁ VOI ÔNG TỔ nổi lên!' },

  { id: 'rubber_boot', name: 'Ủng Cao Su Cũ', species: 'Rác hồ câu', rarity: 'Rác', tier: 1, minWeight: 0.5, maxWeight: 2.0, points: 1, badgeColor: '#f9a825', gradient: 'linear-gradient(135deg,#ffd54f,#f57f17)', quote: 'Ai vứt ủng xuống hồ thế nhờ!', icon: '👢', isTrash: true, ttsSummary: 'Ủng cao su cũ lết lên bờ!' },
  { id: 'plastic_bottle', name: 'Chai Nhựa Rỗng', species: 'Rác hồ câu', rarity: 'Rác', tier: 1, minWeight: 0.2, maxWeight: 0.8, points: 1, badgeColor: '#29b6f6', gradient: 'linear-gradient(135deg,#81d4fa,#0277bd)', quote: 'Cá không được, được cái chai!', icon: '🧴', isTrash: true, ttsSummary: 'Chai nhựa rỗng nổi lên!' },
  { id: 'tire', name: 'Lốp Xe Cũ', species: 'Rác hồ câu', rarity: 'Rác', tier: 1, minWeight: 2.0, maxWeight: 5.0, points: 1, badgeColor: '#424242', gradient: 'linear-gradient(135deg,#757575,#212121)', quote: 'Lốp xe này chắc để làm bè!', icon: '🛞', isTrash: true, ttsSummary: 'Lốp xe cũ kéo lên rồi!' },
  { id: 'bucket', name: 'Xô Rách', species: 'Rác hồ câu', rarity: 'Rác', tier: 1, minWeight: 1.0, maxWeight: 3.0, points: 1, badgeColor: '#8d6e63', gradient: 'linear-gradient(135deg,#bcaaa4,#4e342e)', quote: 'Xô rách thì đựng sao được cá!', icon: '🪣', isTrash: true, ttsSummary: 'Cái xô rách lết lên bờ!' },
  { id: 'slipper', name: 'Dép Lê Độc', species: 'Rác hồ câu', rarity: 'Rác', tier: 1, minWeight: 0.2, maxWeight: 0.6, points: 1, badgeColor: '#1e88e5', gradient: 'linear-gradient(135deg,#64b5f6,#0d47a1)', quote: 'Chiếc dép lẻ bơi một mình!', icon: '🩴', isTrash: true, ttsSummary: 'Dép lê độc trôi vào cần!' },

  { id: 'chest', name: 'Rương Gỗ Cổ', species: 'Cổ vật', rarity: 'Huyền Thoại', tier: 4, minWeight: 15.0, maxWeight: 40.0, points: 450, badgeColor: '#6d4c41', gradient: 'linear-gradient(135deg,#a1887f,#3e2723)', quote: 'Rương cổ mở ra, cả hồ reo!', icon: '📦', ttsSummary: 'RƯƠNG GỖ CỔ nổi lên!' },
  { id: 'coin', name: 'Đồng Xu Cổ', species: 'Cổ vật', rarity: 'Cực Phẩm', tier: 3, minWeight: 3.0, maxWeight: 10.0, points: 200, badgeColor: '#f9a825', gradient: 'linear-gradient(135deg,#ffd54f,#ff8f00)', quote: 'Đồng xu rồng vàng, lộc về!', icon: '🪙', ttsSummary: 'Đồng Xu Cổ rồng vàng lấp lánh!' },
  { id: 'vase', name: 'Bình Gốm Cổ', species: 'Cổ vật', rarity: 'Cực Phẩm', tier: 3, minWeight: 8.0, maxWeight: 20.0, points: 210, badgeColor: '#bf5f3a', gradient: 'linear-gradient(135deg,#ffab91,#bf360c)', quote: 'Bình gốm ngàn năm vẫn nguyên!', icon: '🏺', ttsSummary: 'Bình Gốm Cổ nổi lên!' }
];

// Rác xuất hiện ~8% thay vì cá thường
const TRASH_IDS = ['rubber_boot', 'plastic_bottle', 'tire', 'bucket', 'slipper'];

// ============================================================================
// 2. QUẢN LÝ TIẾN TRÌNH VIENEU TTS (WORKER DAEMON)
// ============================================================================
class VieNeuTTSManager {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.status = 'starting';
    this.voice = 'default';
    this.voices = [];
    this.model = 'pnnbao-ump/VieNeu-TTS-v3-Turbo';
    this.pending = new Map();
    this.inflight = new Map();
    this.reqCounter = 0;
    this.buffer = '';
    this.startWorker();
  }

  resolvePythonBin() {
    const winVenvPy = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(winVenvPy)) return winVenvPy;
    const unixVenvPy = path.join(__dirname, '.venv', 'bin', 'python');
    if (fs.existsSync(unixVenvPy)) return unixVenvPy;
    return process.platform === 'win32' ? 'python' : 'python3';
  }

  startWorker() {
    const pyBin = this.resolvePythonBin();
    const scriptPath = path.join(__dirname, 'tts_worker.py');
    const bundledWorker = [
      path.join(__dirname, 'tts', 'tts_worker.exe'),
      path.join(__dirname, 'tts_worker', 'tts_worker.exe'),
      path.join(__dirname, 'dist', 'tts_worker', 'tts_worker.exe'),
      path.join(__dirname, 'tts_worker.exe')
    ].find((candidate) => process.platform === 'win32' && fs.existsSync(candidate));
    this.status = 'loading';
    try {
      this.proc = spawn(bundledWorker || pyBin, bundledWorker ? [] : [scriptPath], {
        cwd: __dirname,
        env: { ...process.env, TEMPLE_APP_ROOT: bundledWorker === path.join(__dirname, 'tts', 'tts_worker.exe') ? path.join(__dirname, 'tts') : __dirname, PYTHONIOENCODING: 'utf-8' },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (_) {
      this.status = 'fallback_webspeech';
      return;
    }

    this.proc.on('error', () => {
      this.ready = false;
      this.status = 'fallback_webspeech';
    });

    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handleWorkerLine(line.trim());
      }
    });

    this.proc.stderr.on('data', (chunk) => { console.error('[VieNeu]', chunk.toString('utf8').trim()); });

    this.proc.on('exit', () => {
      this.ready = false;
      this.status = 'fallback_webspeech';
      for (const [, item] of this.pending) {
        clearTimeout(item.timer);
        item.resolve({ ok: false, error: 'Giọng đọc tạm ngừng, đang dùng giọng dự phòng' });
      }
      this.pending.clear();
    });
  }

  handleWorkerLine(line) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'status') {
        this.status = msg.status;
        this.model = msg.model || this.model;
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'ready') {
        this.ready = true;
        this.status = 'ready';
        this.voice = msg.voice || 'default';
        this.voices = msg.voices || ['default'];
        this.model = msg.model || this.model;
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'result' && msg.id != null) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(msg.id);
          if (msg.ok && msg.audioBase64) {
            try {
              const audio = Buffer.from(msg.audioBase64, 'base64');
              const hash = crypto.createHash('sha256').update(audio).digest('hex');
              const fileName = `speech_${hash}.wav`;
              fs.writeFileSync(path.join(TTS_CACHE_DIR, fileName), audio);
              delete msg.audioBase64;
              msg.url = `/tts-cache/${fileName}`;
            } catch (err) {
              entry.resolve({ ok: false, error: err.message });
              return;
            }
          }
          entry.resolve(msg);
        }
      } else if (msg.type === 'error') {
        this.status = 'fallback_webspeech';
        broadcastNotification('tts.status', this.getStatus());
      }
    } catch (_) {}
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      engine: this.ready ? 'Giọng đọc AI' : 'Giọng đọc dự phòng',
      voice: this.voices.includes(state.settings.ttsVoice) ? state.settings.ttsVoice : this.voice,
      voices: this.voices
    };
  }

  synthesize(text, voiceOverride) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return Promise.resolve({ ok: false, error: 'Empty text' });
    const requestedVoice = voiceOverride || state.settings.ttsVoice || 'default';
    const voice = ['default', 'default'].includes(requestedVoice) ? this.voice : requestedVoice;
    const dedupKey = `${voice}::${cleanText}`;

    if (this.inflight.has(dedupKey)) {
      return this.inflight.get(dedupKey);
    }

    const promise = new Promise((resolve) => {
      if (!this.proc || !this.ready) {
        resolve({ ok: false, fallback: true, text: cleanText, error: 'Giọng đọc chưa sẵn sàng' });
        return;
      }
      const id = ++this.reqCounter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, fallback: true, text: cleanText, error: 'Giọng đọc phản hồi quá lâu' });
      }, 120000);

      this.pending.set(id, { resolve, timer });
      const payload = JSON.stringify({ id, text: cleanText, voice }) + '\n';
      this.proc.stdin.write(payload);
    }).finally(() => {
      this.inflight.delete(dedupKey);
    });

    this.inflight.set(dedupKey, promise);
    return promise;
  }
}

// ============================================================================
// 3. TRẠNG THÁI HỒ CÂU & BẢNG VÀNG CẦN THỦ
// ============================================================================
const DEFAULT_STATE = {
  totalCatches: 0,
  totalWeightKg: 0,
  totalRevenue: 0,
  totalBait: 0,
  hornsBlown: 0,
  lakeCondition: 'Cá Đi Ăn Mạnh 🐟',
  activeFish: null,
  rodState: 'idle', // idle, casting, hooked, reeling, celebrating
  anglers: {},
  recentEvents: [],
  speechPositions: {},
  cauThanHall: [],
  settings: {
    ttsEnabled: true,
    simCatchVoice: 'all',
    ttsVoice: 'default',
    ttsSpeed: 1,
    musicVolume: 0.55,
    ttsVolume: 0.95,
    bgMusicEnabled: true,
    sfxEnabled: true,
    autoSim: false,
    catchRoundDelaySeconds: 6,
    roundParticipants: 5,
    revealMs: 2000,
    twistChance: 0.18,
    guaranteeBig: true,
    aphorismEveryRound: true,
    leaderboardResetMinutes: 60,
    simulatedCreateCount: 5,
    seatIdleMinutes: 10,
    autoSimIntervalMs: 8000
  },
  tiktok: {
    connected: false,
    connecting: false,
    username: 'zenfacts_vn',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

function calculateAnglerTitle(totalWeightKg, catchesCount) {
  if (totalWeightKg >= 60 || catchesCount >= 20) return 'Vua Sát Cá Đại Dương 👑';
  if (totalWeightKg >= 30 || catchesCount >= 12) return 'Bá Chủ Đầm Lầy 🦈';
  if (totalWeightKg >= 15 || catchesCount >= 6) return 'Cần Thủ Chuyên Nghiệp 🐠';
  if (totalWeightKg >= 5 || catchesCount >= 3) return 'Tay Câu Cừ Khôi 🐟';
  return 'Cần Thủ Nhập Môn 🎣';
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      const anglers = Object.fromEntries(Object.entries(saved.anglers || {})
        .filter(([key, person]) => !String(key).startsWith('sim:') && !person?.isSimulated)
        .map(([key, person]) => [key, { ...person, totalRevenue: Number(person.totalRevenue) || 0 }]));
      const savedRevenue = Number(saved.totalRevenue);
      return {
        ...DEFAULT_STATE,
        ...saved,
        totalRevenue: Number.isFinite(savedRevenue) ? savedRevenue : Object.values(anglers).reduce((sum, person) => sum + person.totalRevenue, 0),
        anglers,
        cauThanHall: Array.isArray(saved.cauThanHall) ? saved.cauThanHall : [],
        settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}), ttsVoice: saved.settings?.ttsVoice === 'maichi' ? 'default' : (saved.settings?.ttsVoice || 'default') },
        tiktok: { ...DEFAULT_STATE.tiktok }
      };
    } else if (fs.existsSync(LEGACY_STATE_FILE)) {
      // Migrate from legacy temple state
      const legacy = JSON.parse(fs.readFileSync(LEGACY_STATE_FILE, 'utf8'));
      const migratedAnglers = {};
      if (legacy.devotees) {
        for (const [id, d] of Object.entries(legacy.devotees)) {
          const catches = Math.max(1, Math.floor((d.incense || 1)));
          const weight = +(catches * 2.8).toFixed(1);
          migratedAnglers[id] = {
            name: d.name,
            uniqueId: d.uniqueId || id,
            avatar: d.avatar || '',
            catchesCount: catches,
            totalWeightKg: weight,
            points: d.merit || 50,
            title: calculateAnglerTitle(weight, catches),
            lastWish: d.lastWish || 'Chúc hội cần thủ may mắn lên cá to!',
            bestCatch: { fishName: 'Cá Chép Vàng', weightKg: 4.8 }
          };
        }
      }
      return {
        ...DEFAULT_STATE,
        anglers: migratedAnglers
      };
    }
  } catch (e) {
    console.warn('[State] Không đọc được state, dùng mặc định:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

// Giữ dữ liệu qua các lần mở app; chỉ reset trạng thái tạm của phiên live.
let state = {
  ...(LOCAL_DEMO ? structuredClone(DEFAULT_STATE) : loadState()),
  activeFish: null,
  rodState: 'idle',
  recentEvents: []
};
state.speechPositions = { ...state.speechPositions };
if (LOCAL_DEMO) Object.assign(state.settings, { ttsEnabled: false, bgMusicEnabled: false, aphorismEveryRound: false });
const pondActions = new PondActions(state.pondCutTrees);
catchRoundClock = new CatchRoundClock(Date.now, () => LOCAL_DEMO ? 3000 : 0);
const LIVE_VIEWER_REFRESH_MS = 15000;
const AUDIENCE_PROFILE_DIR = path.join(DATA_DIR, 'tiktok-roster-profile');
let useLiveRoster = LOCAL_DEMO;
let liveViewerCountAt = 0;
let audienceRosterState = { status: 'disconnected', checkedAt: null, namedViewers: 0, anonymousViewers: 0 };
let audienceRosterBusy = false;
let audienceRosterLastAttemptAt = 0;
let audienceAnchor = { roomId: '', id: '' };
function isAnglerPresent(key, person, now) {
  return useLiveRoster ? commentFishing.people.has(key) : isActivePerson(person, now);
}
const pondSeating = new PondSeating(() => state.anglers, state.seatedAnglerIds, 30, isAnglerPresent);
setSeatIdleMinutes(state.settings.seatIdleMinutes);
setInterval(() => {
  if (useLiveRoster) {
    refreshLiveViewers();
    refreshTikTokAudienceRoster();
  }
  else pondSeating.rebalance();
}, LIVE_VIEWER_REFRESH_MS).unref();
setInterval(() => {
  try {
    if (pondSeating.rotateOne()) {
      saveState();
      broadcastNotification('fishing.state', getPublicState());
    }
  } catch (_) {}
}, 60000).unref();
leaderboardResetClock = new LeaderboardResetClock(() => {
  const value = state.settings.leaderboardResetMinutes;
  return Number.isInteger(value) && value >= 1 && value <= 1440 ? value : 60;
});

let saveTimer = null;
function saveState(immediate = false) {
  if (LOCAL_DEMO) return;
  clearTimeout(saveTimer);
  const persist = () => {
    const toSave = {
      totalCatches: state.totalCatches,
      totalWeightKg: state.totalWeightKg,
      totalRevenue: state.totalRevenue,
      totalBait: state.totalBait,
      hornsBlown: state.hornsBlown,
      lakeCondition: state.lakeCondition,
      pondCutTrees: [...pondActions.cutTrees],
      anglers: state.anglers,
      seatedAnglerIds: pondSeating.keys,
      speechPositions: state.speechPositions,
      settings: state.settings
    };
    if (immediate) { fs.writeFileSync(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8'); return; }
    fs.promises.writeFile(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8').catch((e) => {
      console.error('[State] Lỗi lưu file:', e.message);
    });
  };
  if (immediate) persist();
  else saveTimer = setTimeout(persist, 1200);
}

// Lưu dữ liệu khi tắt app / restart để không mất bảng xếp hạng
process.on('exit', () => { try { saveState(true); } catch (_) {} });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    try { saveState(true); } catch (_) {}
    process.exit(0);
  });
}

function getLeaderboard(limit = 20) {
  return Object.values(state.anglers)
    .filter(person => !isSimulatedAngler(person))
    .sort(compareAnglers)
    .slice(0, limit)
    .map((a, index) => ({
      rank: index + 1,
      name: a.name,
      uniqueId: a.uniqueId,
      avatar: a.avatar || '',
      totalWeightKg: a.totalWeightKg || 0,
      totalRevenue: Number(a.totalRevenue) || 0,
      catchesCount: a.catchesCount || 0,
      points: a.points || 0,
      active: isAnglerPresent(a.uniqueId, a, Date.now()),
      title: a.title || 'Cần Thủ Nhập Môn 🎣',
      bestCatch: a.bestCatch || null,
      lastFishName: a.lastFishName || '',
      lastFishKg: a.lastFishKg || 0,
      lastWish: a.lastWish || ''
    }));
}

// Bộ lọc an toàn ký tự & spam
const WEIRD_SPAM_RE = /[\u{12000}-\u{1254F}\uFDFD\u2800-\u28FF\u2580-\u259F]|[\u0300-\u036F]{3,}/u;
const BRACKET_EMOTE_RE = /\[[^\]]{1,24}\]/g;
const ALLOWED_VI_TEXT_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s.,!?]/g;
const ALLOWED_VI_NAME_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s._-]/g;
const BAD_WORDS_RE = /(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|lừa đảo|lừa à|telegram)/i;

function isBlockedSpamOrToxic(rawText) {
  if (!rawText) return true;
  if (WEIRD_SPAM_RE.test(rawText)) return true;
  if (BAD_WORDS_RE.test(rawText)) return true;
  return false;
}

function sanitizeWishText(raw) {
  if (!raw) return '';
  let text = String(raw).normalize('NFKC').replace(BRACKET_EMOTE_RE, ' ').trim();
  text = text.replace(ALLOWED_VI_TEXT_RE, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > 95) text = text.slice(0, 95).trim();
  return text;
}

function sanitizeUserName(raw) {
  if (!raw) return 'Cần Thủ Vô Danh';
  let name = String(raw).normalize('NFKC').replace(BRACKET_EMOTE_RE, ' ').trim();
  name = name.replace(ALLOWED_VI_NAME_RE, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return 'Cần Thủ Ẩn Danh';
  if (name.length > 24) name = name.slice(0, 24).trim();
  return name;
}

const SENSITIVE_SPEECH_NAME_RE = /(^|\s)(?:đá\s+dái|địt|lồn|cặc|đm|vcl|vl|yamate|lừa\s+(?:đảo|à)|telegram)(?=\s|$)/gi;
function sanitizeSpokenUserName(raw) {
  const name = sanitizeUserName(raw).replace(/[._-]+/g, ' ');
  return name.replace(SENSITIVE_SPEECH_NAME_RE, '$1').replace(/\s+/g, ' ').trim() || 'ẩn danh';
}

let interactionSequence = 0;
let joinSequence = 0;
function recordAngler(user, uniqueId, avatar, pointsGained = 10, weightGained = 0, catchesGained = 0, wish = '', caughtFish = null, interactive = true) {
  const key = uniqueId || user || `angler_${Date.now()}`;
  const existing = state.anglers[key] || {
    name: user || 'Cần Thủ',
    uniqueId: key,
    lastJoinedAt: Date.now(),
    lastJoinedOrder: ++joinSequence,
    avatar: avatar || '',
    catchesCount: 0,
    totalWeightKg: 0,
    totalRevenue: 0,
    points: 0,
    giftCoins: 0,
    title: 'Cần Thủ Nhập Môn 🎣',
    bestCatch: null,
    lastWish: ''
  };

  existing.name = user || existing.name;
  if (interactive) {
    existing.lastInteractionAt = Date.now();
    existing.lastInteractionOrder = ++interactionSequence;
  }
  if (avatar) existing.avatar = avatar;
  existing.points += pointsGained;
  existing.catchesCount += catchesGained;
  existing.totalWeightKg = +(existing.totalWeightKg + weightGained).toFixed(1);
  existing.totalRevenue = Number(existing.totalRevenue) || 0;
  existing.title = calculateAnglerTitle(existing.totalWeightKg, existing.catchesCount);
  if (wish) existing.lastWish = wish;

  if (caughtFish) {
    const saleXu = fishSaleXu(caughtFish);
    if (saleXu !== null && !String(key).startsWith('sim:') && existing.isSimulated !== true) {
      existing.totalRevenue += saleXu;
      state.totalRevenue = (Number(state.totalRevenue) || 0) + saleXu;
    }
    existing.lastCatchAt = Date.now();
    if (!existing.bestCatch || (caughtFish.weightKg > (existing.bestCatch.weightKg || 0))) {
      existing.bestCatch = {
        fishName: caughtFish.name,
        weightKg: caughtFish.weightKg,
        rarity: caughtFish.rarity
      };
    }
  }

  state.anglers[key] = existing;
  existing.isSimulated = String(key).startsWith('sim:');
  pondSeating.ensure(key);
  return existing;
}

function registerLiveViewer(params = {}) {
  const user = sanitizeUserName(params.user);
  const uniqueId = String(params.uniqueId || user);
  if (uniqueId.startsWith('sim:')) throw new Error('Mã người xem không hợp lệ');
  const person = recordAngler(user, uniqueId, params.avatar || '', 0, 0, 0, 'Đã vào hồ câu cá', null, false);
  person.lastJoinedAt = Date.now();
  person.lastJoinedOrder = ++joinSequence;
  pondSeating.ensure(uniqueId);
  saveState();
  const publicState = getPublicState();
  broadcastNotification('fishing.state', publicState);
  return { seated: pondSeating.keys.includes(person.uniqueId), state: publicState };
}

function pushEventLog(event) {
  const item = {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    ...event
  };
  state.recentEvents.unshift(item);
  if (state.recentEvents.length > 40) {
    state.recentEvents.pop();
  }
  return item;
}

// Kho lời chúc mừng đa dạng: nghiêm túc, hype, bựa, meme
const CATCH_CONGRATS = [
  (n, f, w) => `Chúc mừng cần thủ ${n} vừa lôi lên con ${f} nặng ${w} ký! Bự quá cả nhà ơi!`,
  (n, f, w) => `Ôi giời ơi, ${n} vừa câu được ${f} ${w} ký! Cần thủ này tay to thật!`,
  (n, f, w) => `${n} ơi là ${n}, giật được ${f} ${w} ký, quá đỉnh!`,
  (n, f, w) => `Bắt được ${f} ${w} ký rồi! ${n} hôm nay ăn lộc hồ này rồi!`,
  (n, f, w) => `${f} ${w} ký đã lên bờ! ${n} câu hay quá, cả hồ vỗ tay!`,
  (n, f, w) => `Nặng ${w} ký! ${f} thuộc về ${n}!`,
  (n, f, w) => `${n} vừa hạ gục ${f} ${w} ký. Hồ này hôm nay không yên rồi!`,
  (n, f, w) => `Trời ơi ${f} ${w} ký! ${n} câu kiểu gì mà ghê vậy trời!`,
  (n, f, w) => `Cần thủ ${n} chính thức ghi danh với ${f} ${w} ký!`,
  (n, f, w) => `${f} ${w} ký! ${n} ơi mở tiệc đi, cả hồ chờ mồi!`,
  (n, f, w) => `Ai bảo hồ này ít cá? ${n} vừa kéo lên ${f} ${w} ký kìa!`,
  (n, f, w) => `${n} câu được ${f} ${w} ký. Tay này chắc tập gym mỗi ngày!`,
  (n, f, w) => `Cả nhà nhìn kìa, ${f} ${w} ký! ${n} làm được rồi!`,
  (n, f, w) => `${n} vừa rinh về ${f} ${w} ký!`,
  (n, f, w) => `Một con ${f} ${w} ký cho ${n}! Cá này chắc nặng hơn cả cái xe máy!`,
  (n, f, w) => `${n} vừa câu được ${f} ${w} ký! Cả hồ rộn ràng luôn!`,
  (n, f, w) => `${f} ${w} ký thuộc về ${n}! Câu hay lắm!`,
  (n, f, w) => `Chúc mừng ${n}! ${f} ${w} ký, quá xuất sắc!`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký! Kéo cũng ra gì đấy chứ!`,
  (n, f, w) => `${f} ${w} ký! ${n} hôm nay may mắn thật!`,
  (n, f, w) => `${n} vừa rinh ${f} ${w} ký! Cả hồ vỗ tay nào!`,
  (n, f, w) => `${f} ${w} ký cho ${n}! Câu khéo quá, ai cũng nể!`,
  (n, f, w) => `${n} câu được ${f} ${w} ký! Tiếp tục phát huy nha!`,
  (n, f, w) => `Tin nóng: ${n} vừa hạ ${f} ${w} ký!`,
  (n, f, w) => `${n} ơi ${f} ${w} ký, cả hồ đang nhìn ${n} kìa!`,
  (n, f, w) => `${n} vừa câu được ${f} ${w} ký! Quá giỏi!`,
  (n, f, w) => `${f} ${w} ký! ${n} hôm nay lên tay thật!`,
  (n, f, w) => `Chúc mừng ${n} với ${f} ${w} ký!`,
  (n, f, w) => `${n} ơi ${f} ${w} ký, câu hay lắm!`,
  (n, f, w) => `${f} ${w} ký về tay ${n}! Cả hồ chúc mừng!`,
  (n, f, w) => `${n} vừa rinh ${f} ${w} ký! Xuất sắc!`
];

// Kho câu "bựa" đặc trưng cho giọng Adam — hài hước, châm biếm nhẹ, đúng chất hồ câu
const ADAM_BUA_LINES = [
  (n, f, w) => `Ơ kìa ${n}, ${f} ${w} ký! Câu kiểu gì mà ghê vậy trời, hay là cá tự chui vào giỏ?`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký lận! Con này nặng hơn cả lòng tự trọng của tui đó nha!`,
  (n, f, w) => `Chúc mừng ${n} nha, ${f} ${w} ký! Nhưng đừng khoe nhiều, kẻo lượt sau cá bé tí lại khóc!`,
  (n, f, w) => `Trời ơi ${f} ${w} ký! ${n} hôm nay chắc ăn cả nồi cơm, ăn xong nhớ câu tiếp nha!`,
  (n, f, w) => `${n} vừa lên ${f} ${w} ký. Cá to thế này chắc nó tự nguyện theo ${n} về nhà!`,
  (n, f, w) => `Ố ồ, ${f} ${w} ký cho ${n}! Cả hồ nhìn kìa, có người hôm nay trúng mánh rồi!`,
  (n, f, w) => `${n} ơi ${f} ${w} ký! Tay này chắc tập gym mỗi ngày, chứ người thường sao kéo nổi!`,
  (n, f, w) => `Chúc mừng ${n} câu được ${f} ${w} ký! Cá này to quá, chắc phải gọi cả xóm ra phụ kéo!`,
  (n, f, w) => `${f} ${w} ký về tay ${n}! Bự quá, tui nói mà cả hồ không tin, giờ tin chưa!`,
  (n, f, w) => `${n} à, ${f} ${w} ký đó nha! Đừng có mà sướng quá rồi quên cả nhà đang chờ nha!`,
  (n, f, w) => `Ui da, ${n} hạ được ${f} ${w} ký! Con cá này chắc cũng bất ngờ vì bị câu trúng!`,
  (n, f, w) => `${n} vừa rinh ${f} ${w} ký! Ai còn chê hồ này ít cá thì mở mắt ra mà nhìn nha!`,
  (n, f, w) => `${n} ơi ${f} ${w} ký! Con này chắc phải gọi cả xóm ra khiêng chứ ${n} một mình sao nổi!`,
  (n, f, w) => `Trời ơi ${f} ${w} ký! ${n} câu kiểu gì mà cá toàn con khủng vậy trời!`,
  (n, f, w) => `${n} vừa hạ ${f} ${w} ký. Cá này chắc nó tự nguyện lên bờ vì nể ${n}!`,
  (n, f, w) => `${f} ${w} ký về tay ${n}! Cả hồ nhìn kìa, có người hôm nay trúng quả đậm!`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký! Cá to thế này chắc phải thay cả cái cần mới kéo nổi!`,
  (n, f, w) => `Chúc mừng ${n} với ${f} ${w} ký! Đừng khoe nhiều kẻo lượt sau cá bé lại tủi!`,
  (n, f, w) => `${f} ${w} ký! ${n} câu được con này chắc tay mỏi rồi, nghỉ chút rồi câu tiếp nha!`,
  (n, f, w) => `${n} vừa lôi lên ${f} ${w} ký! Bự quá, tui nói mà cả hồ không tin, giờ tin chưa!`,
  (n, f, w) => `Ối giời, ${f} ${w} ký cho ${n}! Con cá này chắc cũng bất ngờ vì bị ${n} tóm!`,
  (n, f, w) => `${n} ơi ${f} ${w} ký! Cá to thế, tối nay cả nhà ${n} ăn không hết!`,
  (n, f, w) => `${f} ${w} ký! ${n} hôm nay chắc hợp phong thủy lắm đây, câu đâu trúng đó!`,
  (n, f, w) => `${n} hạ gục ${f} ${w} ký! Con cá này chắc đang tiếc vì thua ${n}!`,
  (n, f, w) => `${n} ơi ${f} ${w} ký! Cá to thế này chắc nó tưởng ${n} là đồng loại nên theo về!`,
  (n, f, w) => `Trời ơi ${f} ${w} ký! ${n} câu được con này chắc do hồ thương ${n} rồi!`,
  (n, f, w) => `${f} ${w} ký về tay ${n}! Cả hồ nhìn mà ghen tị!`,
  (n, f, w) => `${n} vừa hạ ${f} ${w} ký. Con này chắc phải gọi cả họ nhà ${n} ra ăn mừng!`,
  (n, f, w) => `Ối giời ơi, ${f} ${w} ký cho ${n}! Cá to quá, kéo muốn trẹo cả lưng!`,
  (n, f, w) => `${n} ơi ${f} ${w} ký! Cá này chắc nó cũng bất ngờ vì bị ${n} tóm gọn!`
];

// Kho câu cho CÁ KHỦNG (>=30kg) — hoành tráng, kịch tính
const MEGA_FISH_LINES = [
  (n, f, w) => `CHẤN ĐỘNG! ${n} hạ được ${f} ${w} ký! Con này cả năm mới có một!`,
  (n, f, w) => `TRỜI ƠI! ${f} ${w} ký về tay ${n}! Cả hồ nín thở!`,
  (n, f, w) => `${n} vừa lập kỷ lục với ${f} ${w} ký! Quá đỉnh!`,
  (n, f, w) => `CẢ HỒ CÚI ĐẦU! ${n} câu được ${f} ${w} ký, hàng khủng!`,
  (n, f, w) => `${f} ${w} ký! ${n} ơi, con này phải gọi là thủy quái rồi!`,
  (n, f, w) => `${n} hạ gục ${f} ${w} ký! Cả buổi live mới có một con như này!`,
  (n, f, w) => `WOW! ${f} ${w} ký cho ${n}! Cả hồ reo như hội!`,
  (n, f, w) => `${n} vừa câu được ${f} ${w} ký! Đây là con cá trong mơ!`,
  (n, f, w) => `${f} ${w} ký! ${n} ơi, kéo con này chắc gãy cả cần, mà vẫn lên bờ!`,
  (n, f, w) => `KHỦNG! ${n} rinh về ${f} ${w} ký! Cả hồ không tin nổi!`,
  (n, f, w) => `THỦY QUÁI XUẤT HIỆN! ${n} hạ được ${f} ${w} ký!`,
  (n, f, w) => `${f} ${w} ký! ${n} ơi, con này phải cả hồ mới khiêng nổi!`,
  (n, f, w) => `KỶ LỤC MỚI! ${n} câu được ${f} ${w} ký! Cả hồ reo vang!`,
  (n, f, w) => `${n} vừa lập chiến tích với ${f} ${w} ký! Quá khủng!`,
  (n, f, w) => `TRỜI ĐẤT ƠI! ${f} ${w} ký về tay ${n}! Chuyện khó tin!`
];

function buildCatchCongrats(name, fishName, kg, tier) {
  const w = Number(kg) || 0;
  // Chia theo hạng cân: >=30kg dùng câu "khủng"; còn lại bựa/cũ
  let pool;
  if (w >= 30) pool = Math.random() < 0.6 ? MEGA_FISH_LINES : ADAM_BUA_LINES;
  else pool = Math.random() < 0.7 ? ADAM_BUA_LINES : CATCH_CONGRATS;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  let text = pick(name, fishName, kg);
  if (Number(tier) >= 4) text += ' Hàng khủng, cả buổi live mới có một con!';
  else if (Number(tier) >= 3) text += ' Cá xịn đấy cả nhà!';
  return text;
}

// Server tự tổng hợp giọng chúc mừng rồi phát cho mọi màn hình (client không cần gọi /api/tts)
// Giọng đọc chúc mừng: LUÔN là "Adam bựa" — giọng bựa đặc trưng của hồ.
// Nếu engine chưa nạp giọng này thì fallback an toàn để không mất tiếng.
const CATCH_VOICE_NAME = 'Adam bựa';
function pickCatchVoice() {
  try {
    const list = (vieneuTts && Array.isArray(vieneuTts.voices)) ? vieneuTts.voices : [];
    if (list.length && !list.includes(CATCH_VOICE_NAME)) {
      if (list.includes('Adam')) return 'Adam';
      return list.includes('default') ? 'default' : list[0];
    }
  } catch (_) {}
  return CATCH_VOICE_NAME;
}

// Một cá đọc 1.1x; từ hai đến năm cá giảm dần từ 1.5x xuống 1.3x.
function pickRoundCatchRate(fishCount) {
  const rates = [1.1, 1.5, 1.45, 1.4, 1.3];
  return rates[Math.min(rates.length, Math.max(1, Math.trunc(Number(fishCount) || 1))) - 1];
}

// Tốc độ cho các câu cá lẻ và lời cảm ơn khác.
function pickCatchRate(text, fishCount) {
  const n = Number(fishCount) || 1;
  if (n >= 7) return 2.0;
  if (n >= 5) return 1.6;
  if (n >= 3) return 1.3;
  return 1.0;
}

// ============================================================================
// HÀNG ĐỢI TTS TẬP TRUNG — đảm bảo CHỈ MỘT đoạn âm thanh phát tại một thời điểm.
// Mọi nguồn (vòng câu, châm ngôn, autopilot, coordinator, lệnh speak) đều đi qua
// playTts() nên khi đông người câu / nhiều nguồn cùng nói sẽ KHÔNG còn chồng tiếng.
// playTts() trả về Promise resolve sau khi đoạn đó đọc XONG (dùng để canh nhịp).
// ============================================================================
const _ttsQueue = [];
let _ttsActive = false;

function playTts(text, voice, opts = {}) {
  return new Promise((resolve) => {
    const clean = String(text || '').trim();
    if (!clean || state.settings.ttsEnabled === false) { resolve(0); return; }
    _ttsQueue.push({
      text: clean,
      voice: voice || 'default',
      rate: Number(opts.rate) || 1,
      isCatch: opts.isCatch === true,
      roundSequence: opts.roundSequence === true,
      onPlay: opts.onPlay,
      prepared: opts.prepared || null, // audio đã tổng hợp sẵn (tổng hợp song song từ trước)
      resolve
    });
    _pumpTts();
  });
}

async function _pumpTts() {
  if (_ttsActive) return;
  _ttsActive = true;
  try {
    while (_ttsQueue.length) {
      const job = _ttsQueue.shift();
      let playedMs = 0;
      try {
        let r = job.prepared ? await job.prepared : null;
        if (!r || !r.ok || !r.url) {
          try { r = await vieneuTts.synthesize(job.text, job.voice); } catch (_) { r = null; }
        }
        if (r && r.ok && r.url && job.onPlay?.() !== false) {
          broadcastNotification('tts.play', {
            text: job.text,
            voice: r.voice || job.voice,
            url: r.url,
            rate: job.rate,
            isCatch: job.isCatch,
            sequenceId: job.roundSequence ? `round-audio:${crypto.randomUUID()}` : undefined
          });
          const dur = Math.max(1.0, Number(r.durationSec) || (String(job.text).length / 14));
          playedMs = Math.min(15000, (dur / Math.max(0.8, job.rate)) * 1000 + (job.roundSequence ? 0 : 500));
          await sleep(playedMs);
        }
      } catch (_) {}
      job.resolve(playedMs);
    }
  } finally {
    _ttsActive = false;
    // Lưới an toàn: nếu có job được đẩy vào đúng lúc vòng lặp vừa thoát thì chạy tiếp
    if (_ttsQueue.length) _pumpTts();
  }
}

function speakCatchAsync(text, voiceOverride, rateOverride, fishCount) {
  const clean = String(text || '').trim();
  if (!clean) return;
  const voice = voiceOverride || pickCatchVoice();
  const rate = rateOverride || pickCatchRate(clean, fishCount);
  // Lệnh bắt cá trả về ngay, còn âm thanh xếp hàng tuần tự.
  playTts(clean, voice, { rate, isCatch: true });
}

const FISH_LINES = {
  'Cá Bống Cát': {
    cheer: (n, w) => `${n} câu được Cá Bống Cát ${w} ký! Bống mà to vậy là bống thần rồi!`,
    tease: (n, w) => `${n} ơi, Cá Bống Cát ${w} ký. Con này bé bằng ngón chân cái!`
  },
  'Cá Rô Đồng': {
    cheer: (n, w) => `${n} lên Cá Rô Đồng ${w} ký! Rô này chiên giòn là hết sảy!`,
    tease: (n, w) => `${n} được Cá Rô Đồng ${w} ký. Đủ chiên đúng một miếng, ${n} ạ.`
  },
  'Cá Mè Hoa': {
    cheer: (n, w) => `${n} kéo được Cá Mè Hoa ${w} ký! Mè hoa mà nặng thật!`,
    tease: (n, w) => `Cá Mè Hoa ${w} ký cho ${n}. Mè hoa mà bé như cá cơm!`
  },
  'Cá Trôi Đen': {
    cheer: (n, w) => `${n} câu được Cá Trôi Đen ${w} ký! Trôi này nấu canh chua hết ý!`,
    tease: (n, w) => `${n} ơi, Cá Trôi Đen ${w} ký. Con này còn nhẹ hơn cái bát ăn cơm!`
  },
  'Cá Tai Tượng': {
    cheer: (n, w) => `${n} lên Cá Tai Tượng ${w} ký! Con này làm kiểng cũng đẹp!`,
    tease: (n, w) => `${n} được Cá Tai Tượng ${w} ký. Tai tượng mà bé tí, tượng gì bé thế!`
  },
  'Cá Chép Vàng Cát Tường': {
    cheer: (n, w) => `Chúc mừng ${n}! Cá Chép Vàng Cát Tường ${w} ký — năm nay phát tài rồi!`,
    tease: (n, w) => `${n} được Cá Chép Vàng ${w} ký. Vàng đâu chưa thấy, chỉ thấy bé!`
  },
  'Cá Tra Khủng': {
    cheer: (n, w) => `${n} hạ được Cá Tra Khủng ${w} ký! Đúng tên khủng luôn!`,
    tease: (n, w) => `${n} ơi, Cá Tra Khủng ${w} ký. Khủng mà bé hơn con cá rô!`
  },
  'Cá Lăng Đốm Hoa': {
    cheer: (n, w) => `${n} lên Cá Lăng Đốm Hoa ${w} ký! Thịt chắc nịch, ăn là ghiền!`,
    tease: (n, w) => `${n} được Cá Lăng Đốm Hoa ${w} ký. Đốm hoa đẹp mà bé quá!`
  },
  'Cá Chim Trắng Lưỡi Kiếm': {
    cheer: (n, w) => `${n} kéo được Cá Chim Trắng Lưỡi Kiếm ${w} ký! Sắc lẹm luôn!`,
    tease: (n, w) => `${n} ơi, Lưỡi Kiếm ${w} ký. Kiếm này kiếm bằng nhựa rồi!`
  },
  'Cá Koi Ngũ Sắc Hoàng Gia': {
    cheer: (n, w) => `${n} câu được Koi Ngũ Sắc Hoàng Gia ${w} ký! Đại gia phong thủy đây rồi!`,
    tease: (n, w) => `${n} được Koi Ngũ Sắc ${w} ký. Hoàng gia mà bé bằng cá vàng!`
  },
  'Cá Trê Hoàng Kim Phát Quang': {
    cheer: (n, w) => `${n} lên Trê Hoàng Kim ${w} ký! Phát sáng cả khúc sông!`,
    tease: (n, w) => `${n} ơi, Trê Hoàng Kim ${w} ký. Vàng đâu không thấy, chỉ thấy trê con!`
  },
  'Cá Tầm Hoàng Gia Hắc Ngự': {
    cheer: (n, w) => `${n} hạ được Cá Tầm Hoàng Gia ${w} ký! Đẳng cấp hoàng gia thật sự!`,
    tease: (n, w) => `${n} được Cá Tầm Hoàng Gia ${w} ký. Hoàng gia mà bé tí, chắc con nuôi!`
  },
  'Cá Chuối Hoàng Đế (Channa)': {
    cheer: (n, w) => `${n} kéo lên Cá Chuối Hoàng Đế ${w} ký! Hoàng đế channa, uy nghi!`,
    tease: (n, w) => `${n} ơi, Hoàng Đế Channa ${w} ký. Hoàng đế gì bé thế, chưa đăng quang à!`
  },
  'Cá Rồng Bối Đầu Vàng (Kim Long Quá Bối)': {
    cheer: (n, w) => `Trời ơi! ${n} câu được Kim Long Quá Bối ${w} ký! Rồng thật, không phải cá!`,
    tease: (n, w) => `${n} được Kim Long ${w} ký. Rồng mà bé bằng con rắn mối!`
  },
  'Thủy Quái Hồ Sâu (Cá Hô Khổng Lồ)': {
    cheer: (n, w) => `Cả hồ nín thở! ${n} hạ được Thủy Quái Hồ Sâu ${w} ký!`,
    tease: (n, w) => `${n} ơi, Thủy Quái ${w} ký. Quái gì bé thế, quái thai à!`
  },
  'Cụ Rùa Vàng Thần Long': {
    cheer: (n, w) => `PHÚC LỘC ĐẾN RỒI! ${n} câu được Cụ Rùa Vàng Thần Long ${w} ký!`,
    tease: (n, w) => `${n} được Cụ Rùa Vàng ${w} ký. Cụ ơi, cụ bé quá!`
  },

  'Cá Điêu Hồng': {
    cheer: (n, w) => `${n} lên Cá Điêu Hồng ${w} ký! Đỏ au, nhìn là muốn nướng!`,
    tease: (n, w) => `${n} được Điêu Hồng ${w} ký. Đỏ thì có đỏ, mà bé quá!`
  },
  'Cá Lóc Đồng': {
    cheer: (n, w) => `${n} kéo được Cá Lóc Đồng ${w} ký! Lanh quá, giật cả cần!`,
    tease: (n, w) => `${n} ơi, Lóc Đồng ${w} ký. Lanh thì lanh, mà lanh tí hon!`
  },
  'Cá Basa Re': {
    cheer: (n, w) => `${n} câu được Cá Basa Re ${w} ký! Râu dài, bạc sáng cả hồ!`,
    tease: (n, w) => `${n} được Basa Re ${w} ký. Râu dài mà thân ngắn!`
  },
  'Cá Chạch Lửa': {
    cheer: (n, w) => `Chạch Lửa ${w} ký về tay ${n}! Uốn lượn như dải lụa cháy!`,
    tease: (n, w) => `${n} được Chạch Lửa ${w} ký. Lửa đâu chưa thấy, chỉ thấy bé!`
  },
  'Cá Hồi Cầu Vồng': {
    cheer: (n, w) => `${n} lên Cá Hồi Cầu Vồng ${w} ký! Cả dải cầu vồng bơi ngang hồ!`,
    tease: (n, w) => `Hồi Cầu Vồng ${w} ký cho ${n}. Cầu vồng mà ngắn vậy à!`
  },
  'Cá Mặt Trăng': {
    cheer: (n, w) => `${n} kéo được Cá Mặt Trăng ${w} ký! Bạc lấp lánh giữa nước!`,
    tease: (n, w) => `${n} ơi, Cá Mặt Trăng ${w} ký. Trăng này trăng non rồi!`
  },
  'Rồng Đen Ma Vương': {
    cheer: (n, w) => `RỒNG ĐEN MA VƯƠNG ${w} ký về tay ${n}! Vảy đen rực lửa!`,
    tease: (n, w) => `${n} được Rồng Đen ${w} ký. Ma vương mà bé bằng thằn lằn!`
  },
  'Cá Voi Ông Tổ': {
    cheer: (n, w) => `CẢ HỒ CÚI ĐẦU! ${n} hạ được Cá Voi Ông Tổ ${w} ký!`,
    tease: (n, w) => `${n} được Cá Voi Ông Tổ ${w} ký. Ông tổ mà bằng con cá mòi!`
  },

  'Ủng Cao Su Cũ': {
    cheer: (n, w) => `${n} kéo lên Ủng Cao Su ${w} ký! Ai vứt xuống hồ thế nhờ!`,
    tease: (n, w) => `${n} ơi, Ủng Cao Su ${w} ký. Cá không được, được cái ủng!`
  },
  'Chai Nhựa Rỗng': {
    cheer: (n, w) => `Chai Nhựa ${w} ký cho ${n}! Cả hồ cười ra nước mắt!`,
    tease: (n, w) => `${n} vớ được Chai Nhựa ${w} ký. Rỗng cả trong lẫn ngoài!`
  },
  'Lốp Xe Cũ': {
    cheer: (n, w) => `${n} lôi được Lốp Xe ${w} ký! Cái này làm bè luôn được!`,
    tease: (n, w) => `Lốp Xe ${w} ký về tay ${n}. Cá đâu không thấy, chỉ thấy cao su!`
  },
  'Xô Rách': {
    cheer: (n, w) => `${n} kéo lên Xô Rách ${w} ký! Đựng gì cũng tuột mất!`,
    tease: (n, w) => `Xô Rách ${w} ký cho ${n}. Xô rách thì lấy gì đựng cá!`
  },
  'Dép Lê Độc': {
    cheer: (n, w) => `${n} được Dép Lê Độc ${w} ký! Chiếc kia chắc còn đang bơi!`,
    tease: (n, w) => `Dép Lê ${w} ký cho ${n}. Một chiếc thôi, bạn ơi!`
  },

  'Rương Gỗ Cổ': {
    cheer: (n, w) => `KHO BÁU! ${n} mở được Rương Gỗ Cổ ${w} ký, cả hồ reo lên!`,
    tease: (n, w) => `${n} được Rương Gỗ ${w} ký. Rương bé thế, đựng được gì!`
  },
  'Đồng Xu Cổ': {
    cheer: (n, w) => `LỘC VỀ! ${n} vớ được Đồng Xu Cổ ${w} ký, rồng vàng lấp lánh!`,
    tease: (n, w) => `Đồng Xu Cổ ${w} ký cho ${n}. Xu cổ mà nhẹ tênh!`
  },
  'Bình Gốm Cổ': {
    cheer: (n, w) => `${n} kéo lên Bình Gốm Cổ ${w} ký! Ngàn năm vẫn nguyên!`,
    tease: (n, w) => `${n} được Bình Gốm ${w} ký. Cổ thì có cổ, mà bé xíu!`
  }
};

function buildFishLine(fishName, name, kg, isCheer) {
  const entry = FISH_LINES[fishName];
  if (entry && typeof entry[isCheer ? 'cheer' : 'tease'] === 'function') {
    return entry[isCheer ? 'cheer' : 'tease'](name, kg);
  }
  return isCheer
    ? `${name} câu được ${fishName} ${kg} ký!`
    : `${name} ơi, ${fishName} ${kg} ký. Bé quá!`;
}

// Câu châm biếm khi cá quá bé (< 1kg)
const TINY_FISH_SARCASM = [
  (n, f, w) => `${n} ơi, ${w} ký! Con này bé như cá mắm, thả lại hồ đi!`,
  (n, f, w) => `${n} câu được ${f} ${w} ký. Cá này chắc mới đi mẫu giáo.`,
  (n, f, w) => `Ôi ${w} ký! Bé tí mà cũng dám lên bờ, ${n} ạ.`,
  (n, f, w) => `${n} ơi, con này nặng ${w} ký, còn nhẹ hơn cái điện thoại.`,
  (n, f, w) => `${w} ký cho ${n}. Cá này đủ nấu canh cho một mình ${n} ăn thôi.`,
  (n, f, w) => `${n} câu được ${f} ${w} ký. Bé bằng ngón tay út, nhưng cũng là cá!`,
  (n, f, w) => `Trời ơi ${w} ký! ${n} ơi, con này chắc lạc mẹ từ hồi bé.`,
  (n, f, w) => `${n} vừa kéo lên ${w} ký. Cá này chắc chưa kịp lớn đã bị câu.`,
  (n, f, w) => `${n} ơi, ${w} ký! Bé thế này thì thả về nuôi lớn rồi câu lại nha.`,
  (n, f, w) => `${n} câu được ${f} ${w} ký. Con này còn chưa kịp lớn đã bị ${n} tóm rồi!`,
  (n, f, w) => `${w} ký cho ${n}! Cá này nấu canh còn chưa đủ ngọt nữa.`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký. Bé bằng hạt gạo mà cũng đòi lên bờ!`,
  (n, f, w) => `Ôi ${w} ký! ${n} câu được con cá này chắc do nó ngủ quên.`,
  (n, f, w) => `${n} được ${f} ${w} ký. Cá này chắc mới nở hôm qua!`,
  (n, f, w) => `${w} ký! ${n} ơi, con này bé tí, mang về bỏ bể cá cảnh thì hợp hơn.`,
  (n, f, w) => `${n} vớ được ${f} ${w} ký. Bé thế mà cũng cắn câu, gan thật!`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký! Cá này bé đến mức phải soi kính lúp mới thấy.`,
  (n, f, w) => `${w} ký cho ${n}! Con cá này chắc vừa mới cắn câu đã hối hận.`,
  (n, f, w) => `${n} câu được ${f} ${w} ký. Nhỏ nhưng có võ, tiếc là võ cũng nhỏ.`,
  (n, f, w) => `Ôi ${w} ký! ${n} ơi, con này đủ nấu nồi canh cho... con mèo nhà ${n}.`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký. Bé tí teo, chắc nó lạc đường nên lỡ cắn câu.`,
  (n, f, w) => `${w} ký! ${n} vừa câu được con cá mà cân còn chưa nhích kim.`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký. Chụp cận cảnh nha, chụp xa là thấy mỗi cái cần.`,
  (n, f, w) => `${n} kéo lên ${f} ${w} ký. Để cạnh hạt tiêu là có ngay ảnh chụp hai anh em.`,
  (n, f, w) => `${n} vừa câu được ${f} ${w} ký. Con này đi ngang con tép chắc phải gọi bằng anh.`,
  (n, f, w) => `${f} ${w} ký cho ${n}. Phao nhúc nhích một cái, tưởng cá tới hỏi đường.`,
  (n, f, w) => `${n} câu được ${f} ${w} ký. Giỏ cá rộng quá, nó bơi ba vòng vẫn tưởng còn ở hồ.`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký. Lúc kéo lên, cái móc câu chiếm hết khung hình rồi.`
];

// Vật phẩm KHÔNG phải cá (rác: ủng/chai/lốp/xô/dép; cổ vật: bình gốm/xu/rương)
// → luôn bị CHÊ, dù nặng hay nhẹ, dù là con cuối.
function isNonFishItem(fish) {
  if (!fish) return false;
  return fish.isTrash === true
    || fish.species === 'Rác hồ câu'
    || fish.species === 'Cổ vật'
    || fish.rarity === 'Rác';
}

function appendSaleValue(text, fish, readSale = true) {
  let line = String(text || '');
  const mutation = String(fish?.mutation?.name || '').toLocaleLowerCase('vi-VN');
  const fishName = String(fish?.name || '');
  if (mutation) {
    const fishIndex = fishName ? line.indexOf(fishName) : -1;
    line = fishIndex >= 0
      ? `${line.slice(0, fishIndex + fishName.length)} bị ${mutation}${line.slice(fishIndex + fishName.length)}`
      : `${line} Con cá này bị ${mutation}.`;
  }
  if (!readSale) return line;
  const xu = fishSaleXu(fish);
  if (xu === null) return line;
  if (xu === 0) return `${line} Bán được 0 xu.`;
  const saleLines = [
    `Bán được ${xu} xu.`,
    `Chợ thu ${xu} xu.`,
    `Rinh ${xu} xu về túi!`,
    `Bỏ túi ${xu} xu!`,
    `Chốt đơn, nhận ngay ${xu} xu!`,
    `Tiền cá về ví, ${xu} xu!`,
    `Quầy cá trả ${xu} xu.`,
    `Ra chợ đổi được ${xu} xu.`,
    `Mẻ này thu về ${xu} xu.`,
    `Cộng ngay ${xu} xu vào túi!`,
    `Cá lên bờ, ${xu} xu về tay!`,
    `Cân xong, nhận ${xu} xu!`
  ];
  return `${line} ${saleLines[Math.floor(Math.random() * saleLines.length)]}`;
}

// Kho câu chê đồ không phải cá
const NONFISH_TEASE_LINES = [
  (n, f, w) => `${n} ơi, ${f} ${w} ký! Câu cá mà vớ được cái này, coi như ${n} dọn rác giùm cả hồ rồi!`,
  (n, f, w) => `Ôi giời, ${n} kéo lên ${f} ${w} ký! Cá đâu không thấy, chỉ thấy đồ bỏ đi!`,
  (n, f, w) => `${n} được ${f} ${w} ký. Câu cả buổi được cái này, chắc hồ đang chọc ${n} rồi!`,
  (n, f, w) => `${f} ${w} ký về tay ${n}! Thôi thì coi như hồ câu tặng ${n} kỷ niệm!`,
  (n, f, w) => `Chúc mừng ${n}... vớ được ${f} ${w} ký! Cá thì trốn hết, đồ này thì lên bờ!`,
  (n, f, w) => `${n} kéo lên ${f} ${w} ký! Cả hồ cười bò, còn ${n} thì ngơ ngác!`,
  (n, f, w) => `${f} ${w} ký cho ${n}. Cá không cắn, chỉ có cái này cắn câu thôi!`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký. Con cá thật thì lặn mất, đồ này lại nổi lên!`,
  (n, f, w) => `${n} kéo lên ${f} ${w} ký. Cần câu hôm nay kiêm luôn quầy đồ thất lạc.`,
  (n, f, w) => `${f} ${w} ký cho ${n}. Giật cần nghe nặng tay, ai dè nặng lòng.`,
  (n, f, w) => `${n} vớ được ${f} ${w} ký. Bếp đã bật lửa, giờ đành quay sang luộc rau.`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký. Cả hồ tưởng nghe tiếng cá quẫy, hóa ra là tiếng đồ đạc va nhau.`,
  (n, f, w) => `${n} kéo lên ${f} ${w} ký. Lưỡi câu đặt món cá, hồ giao nhầm đơn rồi.`,
  (n, f, w) => `${f} ${w} ký về tay ${n}. Con cá chắc đứng dưới hồ nhìn rồi cười thầm.`
];
function takeSpeechLine(group, lines, positions = state.speechPositions) {
  const position = positions[group];
  const index = Number.isInteger(position) && position >= 0 ? position % lines.length : 0;
  positions[group] = (index + 1) % lines.length;
  return lines[index];
}

function takeCatchTease(fish, name, kg, positions) {
  const item = isNonFishItem(fish);
  if (!item && !(kg > 0 && kg < 1)) return '';
  const line = item
    ? takeSpeechLine('nonFish', NONFISH_TEASE_LINES, positions)
    : takeSpeechLine('tinyFish', TINY_FISH_SARCASM, positions);
  return line(name, fish?.name || 'Cá', kg);
}

// Kho câu VUI VẺ cho cá thật 1–5 ký
const FUN_FISH_LINES = [
  (n, f, w) => `${n} lên ${f} ${w} ký! Cá tươi rói, tối nay có món ngon rồi!`,
  (n, f, w) => `${f} ${w} ký về tay ${n}! Kéo cũng ra gì đấy chứ!`,
  (n, f, w) => `${n} câu được ${f} ${w} ký! Cá này chiên giòn là hết sảy!`,
  (n, f, w) => `Chúc mừng ${n}! ${f} ${w} ký, cỡ này vừa đẹp để khoe cả hồ!`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký! Không to không bé, đúng chuẩn cá ngon!`,
  (n, f, w) => `${f} ${w} ký cho ${n}! Câu khéo thật, cả hồ vỗ tay!`,
  (n, f, w) => `${n} vừa rinh ${f} ${w} ký! Cá này nấu canh chua thì tuyệt!`,
  (n, f, w) => `${f} ${w} ký! ${n} hôm nay tay thơm rồi, câu phát nào ra phát đó!`,
  (n, f, w) => `${n} lên ${f} ${w} ký! Cỡ này nấu canh chua là chuẩn bài!`,
  (n, f, w) => `${f} ${w} ký về tay ${n}! Cá tươi, thịt chắc, quá đã!`,
  (n, f, w) => `Chúc mừng ${n}! ${f} ${w} ký, cỡ này đem chiên giòn thì hết nước chấm!`,
  (n, f, w) => `${n} câu được ${f} ${w} ký! Vừa đẹp, không to không bé, quá hợp!`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký! Cá này đem kho tiêu thì cả nhà khen!`,
  (n, f, w) => `Cả hồ vỗ tay cho ${n} với ${f} ${w} ký! Câu khéo quá!`,
  (n, f, w) => `${n} vừa rinh ${f} ${w} ký! Cá cỡ này là đủ khoe cả buổi live rồi!`,
  (n, f, w) => `${f} ${w} ký cho ${n}! Ăn chắc ngon, câu chắc sướng!`,
  (n, f, w) => `${n} lên ${f} ${w} ký! Cá này làm gỏi thì cả hồ chảy nước miếng!`,
  (n, f, w) => `${f} ${w} ký! ${n} câu hay quá, cả hồ học hỏi nha!`,
  (n, f, w) => `Chúc mừng ${n}! ${f} ${w} ký, cỡ này nướng trui là chuẩn!`,
  (n, f, w) => `${n} vừa rinh ${f} ${w} ký! Cá đẹp, thịt chắc, quá ngon!`,
  (n, f, w) => `${f} ${w} ký cho ${n}! Câu giỏi thật, ai cũng phục!`,
  (n, f, w) => `${n} ơi, ${f} ${w} ký! Cá này đem hấp bia thì tuyệt cú mèo!`
];
function buildFunFishLine(name, fishName, kg) {
  const pick = FUN_FISH_LINES[Math.floor(Math.random() * FUN_FISH_LINES.length)];
  return pick(name, fishName, kg);
}

// Phân bố "dao động mạnh": ít cá nhỏ, nhưng cá khủng xuất hiện thường hơn
function getRandomFishBiased(mapId) {
  const roll = Math.random();
  const tier = roll < 0.25 ? 1 : roll < 0.52 ? 2 : roll < 0.80 ? 3 : 4;
  return getRandomFish(tier, mapId);
}

function getRandomFish(tierFilter, mapId) {
  // 8% vớ phải rác thay vì cá (chỉ lượt bốc tự nhiên)
  if (tierFilter == null && Math.random() < 0.08) {
    const id = TRASH_IDS[Math.floor(Math.random() * TRASH_IDS.length)];
    const trash = FISH_CATALOG.find((f) => f.id === id);
    const kg = +(trash.minWeight + Math.random() * (trash.maxWeight - trash.minWeight)).toFixed(1);
    return { ...trash, weightKg: kg };
  }
  let candidates = [];
  if (tierFilter != null) {
    candidates = FISH_CATALOG.filter((f) => f.tier === tierFilter && !f.isTrash);
  }
  if (!candidates.length) {
    // Weighted random distribution — thiên về cá to hơn cho hấp dẫn
    const roll = Math.random();
    if (roll < 0.50) {
      candidates = FISH_CATALOG.filter((f) => f.tier === 1 && !f.isTrash); // Common 50%
    } else if (roll < 0.78) {
      candidates = FISH_CATALOG.filter((f) => f.tier === 2 && !f.isTrash); // Rare 28%
    } else if (roll < 0.93) {
      candidates = FISH_CATALOG.filter((f) => f.tier === 3 && !f.isTrash); // Epic 15%
    } else {
      candidates = FISH_CATALOG.filter((f) => f.tier === 4); // Mythic 7%
    }
  }

  const chosen = pickFishForMap(candidates, mapId);
  const weight = +(chosen.minWeight + Math.random() * (chosen.maxWeight - chosen.minWeight)).toFixed(1);
  return {
    ...chosen,
    weightKg: weight
  };
}

let publicTunnelUrl = '';
const activeObsClients = new Set();

function rollCatchFish(uniqueId, tierOverride, mapId = pondScenePoll.scene.scenery) {
  let fish = getRandomFish(tierOverride, mapId);
  const prevCatches = Number(state.anglers[uniqueId]?.catchesCount) || 0;
  if (tierOverride == null && prevCatches >= 3) {
    if (Math.random() < 0.58) {
      fish = getRandomFish(1, mapId);
      fish.weightKg = +(0.2 + Math.random() * 0.75).toFixed(2);
      fish.tinyTroll = true;
    } else {
      fish = getRandomFishBiased(mapId);
    }
  }
  return rollFishMutation({ ...fish, mapId }, mapId);
}

function getPublicState() {
  const open = Boolean(pondSession());
  const leaderboard = getLeaderboard(Infinity);
  const seats = pondSeating.snapshot(leaderboard);
  const revenueLeaderboard = leaderboard
    .filter(person => open && person.active)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 20)
    .map((person, index) => ({ ...person, rank: index + 1 }));
  return {
    totalCatches: state.totalCatches,
    totalWeightKg: state.totalWeightKg,
    totalRevenue: Number(state.totalRevenue) || 0,
    totalBait: state.totalBait,
    hornsBlown: state.hornsBlown,
    lakeCondition: state.lakeCondition,
    pondScene: pondScenePoll.snapshot(open),
    pondActions: pondActions.snapshot(),
    demo: LOCAL_DEMO ? { playerId: DEMO_ACTORS[0].uniqueId,
      actors: DEMO_ACTORS.filter(person => commentFishing.people.has(person.uniqueId)) } : null,
    activeFish: state.activeFish,
    rodState: state.rodState,
    leaderboard: leaderboard.slice(0, 20),
    revenueLeaderboard,
    cauThanHall: (state.cauThanHall || []).slice(0, 10),
    ...seats,
    seatedAnglers: seats.seatedAnglers.map(({ giftCoins, likeBait, premiumPending, ...person }) => person),
    recentEvents: state.recentEvents.slice(0, 15),
    settings: state.settings,
    leaderboardResetAt: leaderboardResetClock.resetAt,
    serverNow: Date.now(),
    tiktok: { ...state.tiktok, audienceRoster: { ...audienceRosterState } },
    tts: vieneuTts.getStatus(),
    publicTunnelUrl,
    hasObsClient: activeObsClients.size > 0
  };
}

// ============================================================================
// 4. HÀNH ĐỘNG CÂU CÁ & TƯƠNG TÁC (FISHING ENGINE)
// ============================================================================
const FishingEngine = {
  // 1. Hiệu ứng thả thính
  castBait(params = {}, cosmetic = false) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(50, Number(params.count) || 1));
    const points = cosmetic ? 0 : count;

    if (!cosmetic) state.totalBait += count;
    const angler = cosmetic ? state.anglers[uniqueId] : recordAngler(user, uniqueId, avatar, points, 0, 0);
    const speechUser = sanitizeSpokenUserName(angler.name);

    const event = pushEventLog({
      type: 'castBait',
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      count,
      points,
      title: angler.title,
      ttsText: params.readTts ? `Cần thủ ${speechUser} vừa thả ${count} nắm thính thơm dụ cá!` : ''
    });

    if (!cosmetic) saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 2. Quăng cần / Thả phao chờ cá cắn
  castRod(params = {}, cosmetic = false) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Quăng cần thả phao, cầu hôm nay giỏ đầy ắp cá!';
    const points = cosmetic ? 0 : 5;

    state.rodState = 'casting';
    const angler = cosmetic ? state.anglers[uniqueId] : recordAngler(user, uniqueId, avatar, points, 0, 0, wish);
    const speechUser = sanitizeSpokenUserName(angler.name);

    const ttsText = params.readTts === false
      ? ''
      : `Cần thủ ${speechUser} vung cần quăng phao ra giữa hồ: ${wish}.`;

    const event = pushEventLog({
      type: 'castRod',
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      wish,
      points,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'default'
    });

    if (!cosmetic) saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 3. Giật cần / Bắt cá (Hook Fish)
  hookFish(params = {}, preparedFish = null) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Giật cần lên cá to!';
    const tierOverride = params.tierOverride != null ? Number(params.tierOverride) : null;
    const caughtFish = preparedFish || rollCatchFish(uniqueId, tierOverride);

    state.totalCatches += 1;
    state.totalWeightKg = +(state.totalWeightKg + caughtFish.weightKg).toFixed(1);
    state.activeFish = caughtFish;
    state.rodState = 'hooked';

    const points = caughtFish.points;
    const angler = recordAngler(user, uniqueId, avatar, points, caughtFish.weightKg, 1, wish, caughtFish, !params.fromRound);
    const speechUser = sanitizeSpokenUserName(angler.name);
    angler.lastFishName = caughtFish.name;
    angler.lastFishKg = caughtFish.weightKg;

    const kg = Number(caughtFish.weightKg) || 0;
    const readTts = state.settings.ttsEnabled !== false && params.readTts !== false;
    const tease = readTts ? takeCatchTease(caughtFish, speechUser, kg) : '';
    let ttsText = tease;
    if (!ttsText && readTts) {
      if (shouldReadCatchCongratulations(angler, caughtFish, state.settings, params.readTts)) {
        ttsText = buildCatchCongrats(speechUser, caughtFish.name, caughtFish.weightKg, caughtFish.tier);
        // Cá to: 60% dùng câu riêng của loài cá, 40% dùng câu chúc chung cho đa dạng
        if (kg >= 5 && FISH_LINES[caughtFish.name] && Math.random() < 0.6) {
          ttsText = buildFishLine(caughtFish.name, speechUser, caughtFish.weightKg, true);
        }
      } else if (kg > 0) {
        ttsText = `${speechUser} được ${caughtFish.name} ${kg} ký!`;
      }
    }
    // Câu thêm cho cá to — chỉ tả cảnh kéo cá, không nhắc tim/quà
    if (ttsText && !tease && kg >= 5 && Math.random() < 0.35) {
      const flavor = [
        'Cá khỏe thật, kéo muốn gãy cần!',
        'Nước bắn tung tóe, cả hồ rộn ràng!',
        'Giật mấy lần mới lôi được lên bờ!',
        'Cần cong cả xuống, cá sung thật!',
        'Cả hồ vỗ tay cho pha kéo cá này!',
        'Tay run run mà vẫn lôi lên được!'
      ];
      ttsText += ' ' + flavor[Math.floor(Math.random() * flavor.length)];
    }
    if (ttsText) ttsText = appendSaleValue(ttsText, caughtFish);
    speakCatchAsync(ttsText);

    const event = pushEventLog({
      type: 'hookFish',
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      wish,
      fish: caughtFish,
      weightKg: caughtFish.weightKg,
      saleXu: fishSaleXu(caughtFish),
      points,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'default'
    });

    saveState();
    if (!params.silentEvent) broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // Quà tặng chỉ tạo lời cảm ơn, không thay đổi hồ sơ cần thủ.
  giftThanks(params = {}) {
    const user = sanitizeUserName(params.user);
    const speechUser = sanitizeSpokenUserName(user);
    const giftName = String(params.giftName || 'quà tặng').slice(0, 40);
    const thanksText = `Cảm ơn ${speechUser} đã tặng ${giftName}!`;
    const event = pushEventLog({
      type: 'giftThanks',
      user,
      uniqueId: params.uniqueId || user,
      avatar: params.avatar || '',
      giftName,
      thanksText
    });
    if (state.settings.ttsEnabled !== false && params.readTts !== false) {
      playTts(thanksText, pickCatchVoice(), { rate: pickCatchRate(thanksText) });
    }
    broadcastNotification('fishing.state', getPublicState());
    return { event, state: getPublicState() };
  },

  soundHorn(params = {}, cosmetic = false) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Báo cá! Báo cá! Chúc cả bến thuyền cùng bội thu!';
    const points = cosmetic ? 0 : 15;

    state.hornsBlown += 1;
    const angler = cosmetic
      ? { name: user, uniqueId: uniqueId || user, avatar }
      : recordAngler(user, uniqueId, avatar, points, 0, 0, wish);
    const speechUser = sanitizeSpokenUserName(angler.name);

    const ttsText = params.readTts
      ? `Cần thủ ${speechUser} thổi còi báo cá rộn rã toàn hồ: ${wish}.`
      : '';

    const event = pushEventLog({
      type: 'soundHorn',
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      points,
      wish,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'default'
    });

    saveState();
    if (!params.silentEvent) broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 5. Lệnh thử cá lớn từ bảng điều khiển.
  catchBigFish(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const coins = Math.max(1, Number(params.coins) || 20);
    const tier = [2, 3].includes(params.tierOverride) ? params.tierOverride : coins > 30 ? (Math.random() < 0.5 ? 3 : 4) : 3;
    const caughtFish = rollCatchFish(uniqueId, tier);

    state.totalCatches += 1;
    state.totalWeightKg = +(state.totalWeightKg + caughtFish.weightKg).toFixed(1);
    state.activeFish = caughtFish;
    state.rodState = 'celebrating';

    const points = coins * 15;
    const angler = recordAngler(user, uniqueId, avatar, points, caughtFish.weightKg, 1, params.giftName || 'Dâng Mồi Thượng Hạng', caughtFish);
    angler.giftCoins = (angler.giftCoins || 0) + coins;
    const speechUser = sanitizeSpokenUserName(angler.name);

    const ttsText = !shouldReadCatchCongratulations(angler, caughtFish, state.settings, params.readTts)
      ? ''
      : appendSaleValue(`Mồi thượng hạng! ${buildCatchCongrats(speechUser, caughtFish.name, caughtFish.weightKg, caughtFish.tier)}`, caughtFish);
    speakCatchAsync(ttsText);

    const event = pushEventLog({
      type: 'catchBigFish',
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      coins,
      giftName: params.giftName || 'Mồi Thượng Hạng',
      fish: caughtFish,
      weightKg: caughtFish.weightKg,
      saleXu: fishSaleXu(caughtFish),
      points,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'default'
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 6. Lệnh thử thủy quái từ bảng điều khiển.
  catchLeviathan(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const coins = Math.max(1, Number(params.coins) || 199);
    const caughtFish = rollCatchFish(uniqueId, 4);

    state.totalCatches += 1;
    state.totalWeightKg = +(state.totalWeightKg + caughtFish.weightKg).toFixed(1);
    state.activeFish = caughtFish;
    state.rodState = 'celebrating';
    state.lakeCondition = 'Đại Tiệc Thủy Quái 🐉';

    const points = coins * 30;
    const angler = recordAngler(user, uniqueId, avatar, points, caughtFish.weightKg, 1, params.giftName || 'Đại Lễ Săn Thủy Quái', caughtFish);
    angler.giftCoins = (angler.giftCoins || 0) + coins;
    const speechUser = sanitizeSpokenUserName(angler.name);

    const ttsText = !shouldReadCatchCongratulations(angler, caughtFish, state.settings, params.readTts)
      ? ''
      : appendSaleValue(`CHẤN ĐỘNG HỒ CÂU! Đại cao thủ ${speechUser} vừa bắt được huyền thoại ${caughtFish.name} nặng ${caughtFish.weightKg} ký! ${caughtFish.quote} Cả nhà comment để săn con tiếp theo nha!`, caughtFish);
    speakCatchAsync(ttsText);

    const event = pushEventLog({
      type: 'catchLeviathan',
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      coins,
      giftName: params.giftName || 'Cá Rồng Kim Long',
      fish: caughtFish,
      weightKg: caughtFish.weightKg,
      saleXu: fishSaleXu(caughtFish),
      points,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'default'
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  updateSettings(params = {}) {
    if (params.simulatedCreateCount !== undefined && (!Number.isInteger(params.simulatedCreateCount) || params.simulatedCreateCount < 1 || params.simulatedCreateCount > 30)) throw new Error('Số người tạo phải từ 1 đến 30');
    if (params.leaderboardResetMinutes !== undefined && (!Number.isInteger(params.leaderboardResetMinutes) || params.leaderboardResetMinutes < 1 || params.leaderboardResetMinutes > 1440)) throw new Error('Thời gian reset phải từ 1 đến 1440 phút');
    if (params.catchRoundDelaySeconds !== undefined && (!Number.isInteger(params.catchRoundDelaySeconds) || params.catchRoundDelaySeconds < 1 || params.catchRoundDelaySeconds > 60)) {
      throw new Error('Delay must be an integer from 1 to 60 seconds');
    }
    if (params.seatIdleMinutes !== undefined) {
      if (!Number.isInteger(params.seatIdleMinutes) || params.seatIdleMinutes < 1 || params.seatIdleMinutes > 180) {
        throw new Error('Thời gian giữ ghế phải từ 1 đến 180 phút');
      }
      setSeatIdleMinutes(params.seatIdleMinutes);
    }
    if (params.simCatchVoice !== undefined && !SIM_CATCH_VOICE_MODES.includes(params.simCatchVoice)) {
      throw new Error('Chọn chế độ chúc mừng giả lập hợp lệ');
    }
    if (params.ttsSpeed !== undefined && (typeof params.ttsSpeed !== 'number' || !Number.isFinite(params.ttsSpeed) || params.ttsSpeed < 0.5 || params.ttsSpeed > 2)) {
      throw new Error('Tốc độ đọc phải từ 0.5 đến 2');
    }
    if (params.ttsVoice !== undefined && params.ttsVoice !== 'default' && !vieneuTts.voices.includes(params.ttsVoice)) {
      throw new Error('Giọng đọc không hợp lệ hoặc chưa tải xong');
    }

    state.settings = {
      ...state.settings,
      ...params
    };
    if (params.leaderboardResetMinutes !== undefined) leaderboardResetClock.restart();
    if (typeof params.autoSim === 'boolean') {
      configureAutoSim(params.autoSim);
    }
    saveState(true);
    broadcastNotification('fishing.state', getPublicState());
    return getPublicState();
  },

  resetState() {
    leaderboardResetClock.restart();
    state.totalCatches = 0;
    state.totalWeightKg = 0;
    state.totalRevenue = 0;
    state.totalBait = 0;
    state.hornsBlown = 0;
    state.lakeCondition = 'Nước Tĩnh Lặng 🌊';
    state.activeFish = null;
    state.rodState = 'idle';
    state.anglers = {};
    pondSeating.clear();
    commentFishing.clear();
    pondActions.clearQueue();
    nextFishingRound = null;
    simulationFishing.clear();
    catchRoundClock.reset();
    commentCooldownMap.clear();
    configureAutoSim(false);
    state.recentEvents = [];
    saveState();
    broadcastNotification('fishing.reset', {});
    broadcastNotification('fishing.state', getPublicState());
    return getPublicState();
  }
};

// ============================================================================
// 5. TIKTOK LIVE CONNECTOR & COMMENT PARSER
// ============================================================================
let tiktokConn = null;
function pondSession() {
  return LOCAL_DEMO ? demoSession : state.tiktok.connected ? tiktokConn : null;
}
let nextFishingRound = null;
const commentCooldownMap = new Map();
const giftThanksCooldown = new Map(); // chống lặp cảm ơn quà combo (uniqueId -> timestamp)

function parseViewerComment(commentText, user, uniqueId, avatar) {
  const raw = String(commentText || '').trim();
  if (!raw || isBlockedSpamOrToxic(raw)) return null;
  const comment = sanitizeWishText(raw);
  if (!comment) return null;
  const cleanUser = sanitizeUserName(user);
  const key = String(uniqueId || cleanUser);
  if (key.startsWith('sim:')) return null;
  if (useLiveRoster && !commentFishing.people.has(key)) return null;
  const now = Date.now();
  const last = commentCooldownMap.get(key);
  if (last !== undefined && now - last < 10000) return null;
  commentCooldownMap.delete(key);
  commentCooldownMap.set(key, now);
  if (commentCooldownMap.size > 600) commentCooldownMap.delete(commentCooldownMap.keys().next().value);
  const person = recordAngler(cleanUser, key, avatar || '', 0, 0, 0, comment);
  touchViewer(key);
  commentFishing.comment({ user: person.name, uniqueId: key, avatar: person.avatar, wish: comment });
  const action = { user: person.name, uniqueId: key, avatar: person.avatar, wish: comment, readTts: false };
  if (!pondActions.isAway(key)) {
    if (Math.random() < 0.5) FishingEngine.castRod(action, true);
    else FishingEngine.castBait({ ...action, count: 5 }, true);
  }
  saveState();
  const publicState = getPublicState();
  broadcastNotification('fishing.state', publicState);
  broadcastNotification('fishing.comment', { user: person.name, uniqueId: key, comment: comment.slice(0, 180) });
  return { queued: true, participants: commentFishing.size, state: publicState };
}

// Người đang xem: cập nhật mốc hoạt động cuối
function touchViewer(uniqueId) {
  const key = String(uniqueId || '');
  if (!key) return;
  const a = state.anglers[key];
  if (a) a.lastSeenAt = Date.now();
}
function noteLiveViewer({ user, uniqueId, avatar }) {
  if (!uniqueId || uniqueId.startsWith('sim:')) return;
  const known = commentFishing.people.has(uniqueId);
  const name = sanitizeUserName(user);
  commentFishing.comment({ user: name, uniqueId, avatar });
  if (!known || !state.anglers[uniqueId]) registerLiveViewer({ user: name, uniqueId, avatar });
  touchViewer(uniqueId);
}

function handlePondChat(commentText, { user, uniqueId, avatar }, voterId) {
  const action = parsePondAction(commentText);
  if (action) {
    const accepted = Boolean(pondSession() && uniqueId && !uniqueId.startsWith('sim:') &&
      pondActions.enqueue(action, { uniqueId, user: sanitizeUserName(user) }));
    if (accepted) {
      noteLiveViewer({ user, uniqueId, avatar });
      broadcastNotification('fishing.pondActions', pondActions.snapshot());
    }
    return { kind: 'action', accepted };
  }
  if (pondSession()) {
    const accepted = pondScenePoll.handleChat(commentText, voterId);
    if (accepted !== null) return { kind: 'vote', accepted };
  }
  noteLiveViewer({ user, uniqueId, avatar });
  console.log(`[Chat] ${user}: ${commentText}`);
  return { kind: 'chat', accepted: Boolean(parseViewerComment(commentText, user, uniqueId, avatar)) };
}

function clearLiveViewers() {
  liveViewerCountAt = 0;
  state.tiktok.viewerCount = 0;
  nextFishingRound = null;
  commentFishing.clear();
  pondScenePoll.reset();
  pondActions.clearQueue();
  audienceRosterLastAttemptAt = 0;
  audienceAnchor = { roomId: '', id: '' };
  audienceRosterState = { status: 'disconnected', checkedAt: null, namedViewers: 0, anonymousViewers: 0 };
}

// shortcut: TikTok reports a total, so keep the most recently observed IDs when the total falls.
function refreshLiveViewers() {
  if (!state.tiktok.connected || state.tiktok.viewerCount < 20 || !commentFishing.size) return;
  const now = Date.now();
  const hasFreshCount = liveViewerCountAt > 0 && now - liveViewerCountAt <= LIVE_VIEWER_REFRESH_MS * 2;
  const viewers = [...commentFishing.people.values()];
  const removed = hasFreshCount
    ? viewers.filter(person => person.lastCommentAt <= liveViewerCountAt)
      .sort((a, b) => b.lastCommentAt - a.lastCommentAt).slice(state.tiktok.viewerCount)
    : viewers.filter(person => now - person.lastCommentAt > LIVE_VIEWER_REFRESH_MS);
  if (!removed.length) return;
  for (const person of removed) commentFishing.remove(person.uniqueId);
  broadcastNotification('fishing.state', getPublicState());
}

async function refreshTikTokAudienceRoster() {
  const connection = tiktokConn;
  if (!state.tiktok.connected || state.tiktok.viewerCount >= 20 || !connection || audienceRosterBusy) return;
  const now = Date.now();
  if (now - audienceRosterLastAttemptAt < LIVE_VIEWER_REFRESH_MS) return;
  audienceRosterBusy = true;
  audienceRosterLastAttemptAt = now;
  try {
    const session = await readTikTokSession(AUDIENCE_PROFILE_DIR);
    const roomId = String(state.tiktok.roomId || connection.roomId || '');
    if (!roomId) throw new Error('TikTok room is not ready');
    if (audienceAnchor.roomId !== roomId || !audienceAnchor.id) {
      const info = await connection.fetchRoomInfo(roomId);
      const owner = info?.owner || info?.data?.owner || info?.data?.data?.owner;
      const id = owner?.id_str || owner?.id || owner?.userId || owner?.uid;
      if (!id) throw new Error('TikTok host ID is unavailable');
      audienceAnchor = { roomId, id: String(id) };
    }
    const roster = await fetchRoomAudience(roomId, audienceAnchor.id, session);
    if (connection !== tiktokConn || !state.tiktok.connected) return;

    const present = new Set(roster.viewers.map(viewer => viewer.uniqueId.toLowerCase()));
    for (const viewer of roster.viewers) {
      const existingKey = [...commentFishing.people.keys()].find(key => key.toLowerCase() === viewer.uniqueId.toLowerCase());
      noteLiveViewer({ ...viewer, uniqueId: existingKey || viewer.uniqueId });
    }
    // shortcut: under 20, trust each successful complete roster; use two polls if TikTok omits viewers transiently.
    for (const key of [...commentFishing.people.keys()]) {
      const normalized = key.toLowerCase();
      if (!present.has(normalized)) commentFishing.remove(key);
    }
    audienceRosterState = {
      status: 'verified', checkedAt: Date.now(), namedViewers: roster.viewers.length,
      anonymousViewers: roster.anonymous
    };
    saveState();
    broadcastNotification('fishing.state', getPublicState());
  } catch (err) {
    if (connection !== tiktokConn || !state.tiktok.connected) return;
    const message = String(err?.message || 'Roster check failed');
    audienceRosterState = {
      status: /login/i.test(message) ? 'login-required' : 'unavailable',
      checkedAt: Date.now(), namedViewers: audienceRosterState.namedViewers,
      anonymousViewers: audienceRosterState.anonymousViewers
    };
    console.warn('[TikTok Audience]', message);
    broadcastNotification('fishing.state', getPublicState());
  } finally {
    audienceRosterBusy = false;
  }
}

let roundBusy = false;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Đọc xong mới trả về — thời gian chờ = độ dài audio / tốc độ (đi qua hàng đợi chung)
function speakCatchAndWait(text, fishCount, voiceOverride) {
  if (state.settings.ttsEnabled === false) return Promise.resolve(1500);
  const voice = voiceOverride || pickCatchVoice();
  const rate = pickCatchRate(text, fishCount);
  return playTts(text, voice, { rate, isCatch: true }).then((ms) => ms || 2000);
}

function pickExtraWinners(pool, winner, count) {
  const list = pool.eligible().filter(p => !winner || String(p.uniqueId) !== String(winner.uniqueId));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, count);
}

const APHORISMS = [
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
  'Cái phao dạy mình một điều. Lên xuống cả ngày mà vẫn nổi.',
  'Một gợn sóng đi qua, mặt hồ lại có chỗ cho mây.',
  'Cần câu kéo được cá. Ấm trà kéo được người bạn ngồi thêm một lát.',
  'Chiều bên hồ dài nhất lúc nước còn nóng trong ấm trà.',
  'Phao nằm im, gió vẫn kể chuyện. Nghe được bên nào cũng vui.',
  'Cái giỏ có thể nhẹ tênh, còn buổi chiều thì đầy tiếng cười.'
];
// Giọng vùng miền cho các con cá KHÔNG phải con cuối (Adam bựa để dành cho chúc mừng)
const CATCH_REGIONAL_VOICES = [
  'Quang Sơn', 'Ngọc Trân',
  'Thùy Dung', 'Thái Sơn', 'Minh Triết', 'Mỹ Duyên', 'Đức Trí', 'Kim Thanh', 'Thục Đoan'
];
let catchRegionalIdx = 0;

function nextCatchRegionalVoice() {
  const v = CATCH_REGIONAL_VOICES[catchRegionalIdx % CATCH_REGIONAL_VOICES.length];
  catchRegionalIdx++;
  return v;
}

function prepareRoundAudio(text, voice, connection) {
  return vieneuTts.synthesize(text, voice).then(result => {
    if (result?.ok && result.url && pondSession() === connection) {
      broadcastNotification('fishing.preloadCatchAudio', { url: result.url });
    }
    return result;
  }).catch(() => null);
}

function prepareRoundAphorism(connection) {
  if (state.settings.ttsEnabled === false || state.settings.aphorismEveryRound === false) return null;
  const text = takeSpeechLine('aphorism', APHORISMS);
  const voice = nextCatchRegionalVoice();
  saveState();
  return { text, voice, prepared: prepareRoundAudio(text, voice, connection) };
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const ROUND_EFFECT_LINES = {
  infected: {
    remarks: ['Mẻ này bán được 0 xu.'],
    sales: [() => 'Mẻ này bán được 0 xu.']
  },
  pure: {
    remarks: ['Vảy cá trong veo!'],
    sales: [xu => `Cá tinh khiết, chợ trả ${xu} xu!`]
  },
  lotus: {
    remarks: ['Vảy cá ánh hồng như cánh sen!'],
    sales: [xu => `Cá hương sen bán được ${xu} xu!`]
  },
  dead: {
    remarks: ['Cá hết pin rồi!', 'Nằm im re luôn!', 'Cá nghỉ trước cần thủ rồi!'],
    sales: [xu => `Cá hết pin, chợ thu ${xu} xu.`, xu => `Nằm im re, vẫn được ${xu} xu.`]
  },
  albino: {
    remarks: ['Trắng như tuyết!', 'Trắng như ngọc luôn!', 'Trắng nổi cả hồ!'],
    sales: [xu => `Hàng hiếm, rinh ${xu} xu!`, xu => `Trắng như ngọc, bỏ túi ${xu} xu!`]
  },
  hyper: {
    remarks: ['Quẫy muốn lật xô!', 'Coi chừng nó nhảy!', 'Rung cả giỏ luôn!'],
    sales: [xu => `Quẫy tưng bừng, chợ trả ${xu} xu!`, xu => `Cá còn quẫy, rinh ${xu} xu!`]
  },
  giant: {
    remarks: ['Chật cả giỏ rồi!', 'Kéo hai tay mới nổi!', 'Cong cả cần luôn!'],
    sales: [xu => `Cá khổng lồ, bỏ túi ${xu} xu!`, xu => `Chật cả giỏ, chợ trả ${xu} xu!`]
  }
};

function buildRoundCatchText(user, fish) {
  const speechUser = sanitizeSpokenUserName(user);
  const effectId = fish.mutation?.id;
  const effect = ROUND_EFFECT_LINES[effectId];
  const xu = fishSaleXu(fish);
  const readSale = xu === 0 || (xu !== null && Math.random() < 0.5);
  const fishText = `${fish.name} nặng ${fish.weightKg} ký!`;
  const greeting = `Chúc mừng ${speechUser}, ${appendSaleValue(fishText, fish, readSale && !effect)}`;
  if (readSale) {
    if (!effect) return greeting;
    const saleLine = takeSpeechLine(`roundEffectSale:${effectId}`, effect.sales);
    return `${greeting} ${saleLine(xu)}`;
  }
  const reaction = effect ? takeSpeechLine(`roundEffect:${effectId}`, effect.remarks)
    : isNonFishItem(fish) ? 'Dọn hồ luôn!'
    : fish.weightKg < 1 ? 'Bé xíu à!'
    : fish.weightKg >= 15 ? 'Cong cả cần!'
    : 'Kéo đẹp lắm!';
  return `${greeting} ${reaction}`;
}

function prepareCommentFishingRound() {
  const connection = pondSession();
  if (!connection) return null;
  const mapId = pondScenePoll.scene.scenery;
  refreshLiveViewers();
  const pool = commentFishing;
  if (![...pool.people.keys()].some(id => !pondActions.isAway(id))) return null;

  // Advance rest rounds without adding an empty wait when everyone is resting.
  while (!pool.eligible().length) pool.round();
  const eligible = pool.eligible().length;
  const want = Math.max(1, Math.min(eligible, 5, Number(state.settings.roundParticipants) || 5));
  const lead = pool.round();
  const picks = lead ? [lead] : [];
  const eligiblePeople = pool.eligible();
  const newcomers = eligiblePeople.filter(person => person.isNewcomer)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const regulars = shuffleInPlace(eligiblePeople.filter(person => !person.isNewcomer));
  for (const person of [...newcomers, ...regulars]) {
    if (picks.length >= want) break;
    if (!picks.some(pick => pick.uniqueId === person.uniqueId)) picks.push(person);
  }

  const highlight = state.settings.guaranteeBig !== false ? Math.floor(Math.random() * picks.length) : -1;
  const highlightTier = Math.random() < 0.25 ? 3 : 2;
  const catches = picks.map((person, index) => ({
    person,
    fish: rollCatchFish(person.uniqueId, index === highlight ? highlightTier : null, mapId)
  })).sort((a, b) => a.fish.weightKg - b.fish.weightKg);

  const twistChance = Math.max(0, Math.min(0.6, Number(state.settings.twistChance)));
  const twist = catches.length > 1 && Math.random() < twistChance;
  if (twist) catches.push(catches.shift());

  const voice = state.settings.ttsEnabled !== false ? pickCatchVoice() : null;
  if (voice) {
    for (const item of catches) {
      item.text = buildRoundCatchText(item.person.user, item.fish);
      item.audio = prepareRoundAudio(item.text, voice, connection);
    }
  }
  return { connection, mapId, catches, eligible, twist, voice };
}

async function runCommentFishingRound() {
  if (roundBusy || !pondSession() || (LOCAL_DEMO && !wss.clients.size) || !catchRoundClock.ready()) return;
  roundBusy = true;
  try {
    refreshLiveViewers();
    const round = nextFishingRound?.mapId === pondScenePoll.scene.scenery ? nextFishingRound : prepareCommentFishingRound();
    nextFishingRound = null;
    if (!round || round.connection !== pondSession()) return;

    const isPresent = item => round.connection === pondSession()
      && commentFishing.people.has(item.person.uniqueId) && !pondActions.isAway(item.person.uniqueId);
    const catches = round.catches.filter(isPresent);
    const revealMs = Math.max(600, Math.min(2000, Number(state.settings.revealMs) || 2000));
    const revealed = [];
    let aphorism = null;

    for (const [index, item] of catches.entries()) {
      if (!isPresent(item)) continue;
      const audio = item.audio && state.settings.ttsEnabled !== false ? await item.audio : null;
      refreshLiveViewers();
      if (!isPresent(item)) continue;
      const countAtPlayback = revealed.length + catches.slice(index).filter(isPresent).length;
      let shownAt = null;
      const showCard = () => {
        refreshLiveViewers();
        if (!isPresent(item)) return false;
        const remaining = catches.slice(index).filter(isPresent).length;
        const count = revealed.length + remaining;
        const { event } = FishingEngine.hookFish({
          ...item.person, readTts: false, silentEvent: true, fromRound: true
        }, item.fish);
        commentFishing.caught(item.person.uniqueId);
        const livePerson = commentFishing.people.get(item.person.uniqueId);
        if (livePerson) livePerson.isNewcomer = false;
        revealed.push(event);
        shownAt = Date.now();
        broadcastNotification('fishing.roundReveal', {
          step: true, revealMs, twist: round.twist, count,
          catches: [{
            index: revealed.length, isFinal: remaining === 1, user: event.user,
            uniqueId: event.uniqueId, avatar: event.avatar, weightKg: event.weightKg,
            saleXu: event.saleXu, fish: event.fish
          }]
        });
        if (revealed.length === 1) aphorism = prepareRoundAphorism(round.connection);
        return true;
      };

      if (audio?.ok && audio.url && state.settings.ttsEnabled !== false) {
        await playTts(item.text, round.voice, {
          rate: pickRoundCatchRate(countAtPlayback), isCatch: true, roundSequence: true,
          prepared: Promise.resolve(audio), onPlay: showCard
        });
      }
      if (shownAt === null && !showCard()) continue;
      await sleep(Math.max(0, shownAt + revealMs - Date.now()));
      // Wait for the screen to finish the audio, with the clock's notice timeout as fallback.
      while (pondSession() === round.connection && !catchRoundClock.ready()) await sleep(50);
    }

    if (!revealed.length || round.connection !== pondSession()) return;
    broadcastNotification('fishing.roundCardsDone', {});
    const final = revealed[revealed.length - 1];
    const winners = new Set(revealed.map(event => event.uniqueId));
    const nearMiss = shuffleInPlace(commentFishing.eligible().filter(p => !winners.has(p.uniqueId)))
      .slice(0, round.eligible >= 50 ? 5 : round.eligible >= 25 ? 4 : 2).map(p => p.user);
    broadcastNotification('fishing.round', {
      eligible: round.eligible, chance: biteChance(round.eligible), simulated: false,
      winner: final.user, fish: final.fish, weightKg: final.weightKg, nearMiss
    });
    broadcastNotification('fishing.state', getPublicState());

    if (aphorism && pondSession() === round.connection && state.settings.aphorismEveryRound !== false) {
      await playTts(aphorism.text, aphorism.voice, {
        rate: 1, roundSequence: true, prepared: aphorism.prepared,
        onPlay: () => {
          if (pondSession() !== round.connection) return false;
          nextFishingRound = prepareCommentFishingRound();
        }
      });
    }
  } finally {
    if (LOCAL_DEMO) catchRoundClock.checked();
    roundBusy = false;
  }
}

function extractUserFromEvent(data) {
  const user = data?.nickname || data?.uniqueId || data?.user?.nickname || data?.user?.uniqueId || 'Cần Thủ';
  const uniqueId = String(data?.uniqueId || data?.user?.uniqueId || data?.user?.userId || data?.user?.id || data?.userId || '');
  const list = value => Array.isArray(value) ? value : [value];
  const avatar = [data?.profilePictureUrl, ...list(data?.profilePictureUrls), data?.user?.profilePictureUrl,
    ...list(data?.user?.profilePictureUrls), ...list(data?.user?.avatarLarge?.urlList),
    ...list(data?.user?.avatarMedium?.urlList), ...list(data?.user?.avatarThumb?.urlList),
    ...list(data?.avatarLarge?.urlList), ...list(data?.avatarThumb?.urlList)]
    .find(url => typeof url === 'string' && /^https?:\/\//i.test(url)) || '';
  return { user, uniqueId, avatar };
}

async function resolveTikTokUsername(input) {
  if (!input) return null;
  let str = String(input).trim();
  const atMatch = str.match(/@([a-zA-Z0-9_.-]+)/);
  if (atMatch) return atMatch[1];
  const urlMatch = str.match(/tiktok\.com\/@([a-zA-Z0-9_.-]+)/);
  if (urlMatch) return urlMatch[1];
  return str.replace(/[^a-zA-Z0-9_.-]/g, '');
}

async function connectTikTokLive(usernameOrUrl) {
  if (LOCAL_DEMO) throw new Error('Hồ câu thử chỉ chạy trên máy này.');
  const cleanUser = await resolveTikTokUsername(usernameOrUrl);
  if (!cleanUser) {
    throw new Error('Không tìm thấy @username hợp lệ từ dữ liệu nhập vào');
  }

  if (tiktokConn) {
    const previousConnection = tiktokConn;
    tiktokConn = null;
    try {
      await previousConnection.disconnect();
    } catch (_) {}
  }

  state.tiktok = {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  };
  useLiveRoster = true;
  clearLiveViewers();
  broadcastNotification('fishing.state', getPublicState());

  const signApiKey = loadSignApiKey();
  const connOptions = {
    processInitialData: false,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  };
  if (signApiKey) connOptions.signApiKey = signApiKey;

  const connection = new TikTokLiveConnection(cleanUser, connOptions);
  tiktokConn = connection;

  // Bảo vệ wsClient khỏi emit error không có listener sau khi đóng kết nối
  tiktokConn.on(ControlEvent.WEBSOCKET_CONNECTED, (wsClient) => {
    if (wsClient && typeof wsClient.on === 'function') {
      wsClient.on('error', (err) => {
        console.warn('[TikTok Live WS Error]', err?.message || err);
      });
      const origRemoveAll = wsClient.removeAllListeners.bind(wsClient);
      wsClient.removeAllListeners = function (event) {
        origRemoveAll(event);
        this.on('error', () => {});
        return this;
      };
    }
  });

  tiktokConn.on(ControlEvent.CONNECTED, (roomState) => {
    if (tiktokConn !== connection) return;
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    state.tiktok.lastError = null;
    pondScenePoll.reset();
    console.log(`[TikTok Live] Đã kết nối hồ câu @${cleanUser} (roomId: ${state.tiktok.roomId})`);
    broadcastNotification('fishing.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.DISCONNECTED, () => {
    if (tiktokConn !== connection) return;
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    clearLiveViewers();
    console.log(`[TikTok Live] Đã ngắt kết nối @${cleanUser}`);
    broadcastNotification('fishing.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.ERROR, (err) => {
    if (tiktokConn !== connection) return;
    const errMsg = err?.exception?.message || err?.info || err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
    state.tiktok.lastError = errMsg;
    console.warn('[TikTok Live Warning]', errMsg);
    broadcastNotification('fishing.state', getPublicState());
  });

  tiktokConn.on(WebcastEvent.ROOM_USER, (data) => {
    if (tiktokConn !== connection) return;
    const reported = data?.total ?? data?.viewerCount;
    if (reported == null || reported === '') return;
    const viewerCount = Number(reported);
    if (!Number.isSafeInteger(viewerCount) || viewerCount < 0) return;
    const previousCount = state.tiktok.viewerCount;
    liveViewerCountAt = Date.now();
    state.tiktok.viewerCount = viewerCount;
    broadcastNotification('fishing.viewerCount', { viewerCount });
    if (viewerCount === 0 || viewerCount < previousCount) refreshLiveViewers();
  });

  tiktokConn.on(WebcastEvent.MEMBER, (data) => {
    if (tiktokConn === connection) noteLiveViewer(extractUserFromEvent(data));
  });

  tiktokConn.on(WebcastEvent.CHAT, (data) => {
    if (tiktokConn !== connection) return;
    const person = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    const voterId = data?.user?.userId || data?.user?.id || data?.userId || person.uniqueId;
    handlePondChat(commentText, person, voterId);
  });

  const handleSocialEvent = (data) => {
    const { user } = extractUserFromEvent(data);
    console.log(`[TikTok Social] ${user} follow/share — chỉ ghi nhận, không ảnh hưởng cá.`);
  };

  tiktokConn.on(WebcastEvent.FOLLOW, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SHARE, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SOCIAL, (data) => {
    const text = String(data?.label || '').toLowerCase();
    if (text.includes('follow') || text.includes('share')) {
      handleSocialEvent(data);
    }
  });

  tiktokConn.on(WebcastEvent.GIFT, (data) => {
    if (tiktokConn !== connection) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const giftName = data?.giftName || data?.name || 'Quà Tặng Hồ Câu';
    const diamondCount = Number(data?.diamondCount || 0);
    const repeatCount = Number(data?.repeatCount || 1);
    const totalCoins = Math.max(1, diamondCount * repeatCount);

    console.log(`[TikTok Gift] ${user} tặng ${giftName} (${totalCoins} xu)`);
    // Quà combo chỉ phát lời cảm ơn một lần trong 15 giây cho mỗi người.
    const _now = Date.now();
    const _key = String(uniqueId || user || '');
    const _last = giftThanksCooldown.get(_key) || 0;
    const _speak = _now - _last >= 15000;
    if (_speak) giftThanksCooldown.set(_key, _now);

    FishingEngine.giftThanks({ user, uniqueId, avatar, giftName, readTts: _speak });
  });

  try {
    const roomState = await connection.connect();
    if (tiktokConn !== connection) return state.tiktok;
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    try {
      await ensureLoginBrowser(AUDIENCE_PROFILE_DIR);
      audienceRosterState.status = 'waiting-login';
    } catch (browserError) {
      audienceRosterState.status = 'browser-unavailable';
      console.warn('[TikTok Audience] Login window unavailable:', browserError?.message || browserError);
    }
    refreshTikTokAudienceRoster();
    broadcastNotification('fishing.state', getPublicState());
    return state.tiktok;
  } catch (err) {
    if (tiktokConn !== connection) return state.tiktok;
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    clearLiveViewers();
    state.tiktok.lastError = err?.message || 'Không thể kết nối phòng Live (kiểm tra tài khoản đang phát Live chưa)';
    broadcastNotification('fishing.state', getPublicState());
    throw new Error(state.tiktok.lastError);
  }
}

function disconnectTikTokLive() {
  if (LOCAL_DEMO) throw new Error('Hồ câu thử chỉ chạy trên máy này.');
  const connection = tiktokConn;
  tiktokConn = null;
  if (connection) connection.disconnect().catch(() => {});
  state.tiktok.connected = false;
  state.tiktok.connecting = false;
  clearLiveViewers();
  broadcastNotification('fishing.state', getPublicState());
  return state.tiktok;
}

// ============================================================================
// 6. AUTO-SIMULATION ENGINE (GIẢ LẬP CẦN THỦ TƯƠNG TÁC)
// ============================================================================
let autoSimTimer = null;
const SIM_FIRST_NAMES = ['Minh', 'Tuấn', 'Lan', 'Thảo', 'Hùng', 'Mai', 'Quân', 'Linh', 'Hương', 'Long', 'Nam', 'Ngọc', 'Bình', 'Hạnh', 'Phúc', 'An'];
const SIM_LAST_NAMES = ['Bờ Hồ', 'Săn Cá', 'Cần Tre', 'Thả Phao', 'Câu Vui', 'Giỏ Đầy', 'Cần Máy', 'Mồi Thơm'];

function createSimulatedAnglers(requested = 5) {
  const amount = Math.min(Math.max(0, Math.trunc(Number(requested) || 0)), pondSeating.capacity - pondSeating.keys.filter(Boolean).length);
  for (let index = 0; index < amount; index++) {
    const first = SIM_FIRST_NAMES[Math.floor(Math.random() * SIM_FIRST_NAMES.length)];
    const last = SIM_LAST_NAMES[Math.floor(Math.random() * SIM_LAST_NAMES.length)];
    recordAngler(`${first} ${last}`, `sim:${crypto.randomUUID()}`, '', 0, 0, 0, 'Người câu giả lập');
  }
  return amount;
}

// BOTS ĐÃ BỊ KHOÁ: chỉ người thật đang xem mới được câu cá.
// Giữ hàm để không vỡ chỗ gọi cũ, nhưng tuyệt đối không tạo người giả lập nữa.
function fillSimulatedSeats(params = {}) {
  configureAutoSim(false);
  const publicState = getPublicState();
  broadcastNotification('fishing.state', publicState);
  return { added: 0, botsDisabled: true, state: publicState };
}

function runSingleSimulationStep() {
  if (commentFishing.size) return;
  // Replaced bots never reclaim a real viewer's place or continue fishing.
  const seatedBots = pondSeating.keys.map(key => state.anglers[key]).filter(isSimulatedAngler);
  if (!seatedBots.length) return;
  const person = seatedBots[Math.floor(Math.random() * seatedBots.length)];
  const pick = { user: person.name, uniqueId: person.uniqueId, wish: 'Giả lập quăng cần câu cá', readTts: false };
  const roll = Math.random();
  if (roll < 0.35) {
    FishingEngine.castBait({ ...pick, count: 5 });
  } else if (roll < 0.65) {
    FishingEngine.castRod(pick);
  } else if (roll < 0.90) {
    // Catches are awarded exclusively by the five-second fishing round.
    FishingEngine.castRod(pick);
  } else {
    FishingEngine.soundHorn(pick);
  }
}

function configureAutoSim(enabled) {
  if (autoSimTimer) {
    clearInterval(autoSimTimer);
    autoSimTimer = null;
  }
  // Luôn tắt: không cho bot vào hồ — chỉ người thật đang xem mới được câu.
  state.settings.autoSim = false;
  console.log('[AutoSim] Đã tắt — không dùng bot, chỉ người thật đang xem mới câu.');
  saveState();
  broadcastNotification('fishing.state', getPublicState());
}

// ============================================================================
// 7. BỘ ĐIỀU PHỐI JSON-RPC 2.0 (RPC DISPATCHER)
// ============================================================================
async function handleRpcCall(method, params = {}) {
  if (typeof method === 'string' && method.startsWith('demo.') && !LOCAL_DEMO) {
    throw new Error('Mở hồ câu bằng Chay-Thu-Ho-Cau-V2.bat để chạy thử.');
  }
  if (params.selectedSimulated) {
    const person = state.anglers[params.uniqueId];
    if (!isSimulatedAngler(person) || !pondSeating.keys.includes(params.uniqueId)) throw new Error('Người giả lập đã rời ghế. Hãy chọn lại.');
    params = { ...params, user: person.name, avatar: person.avatar || '' };
  }
  switch (method) {
    case 'demo.chat': {
      const person = DEMO_ACTORS.find(actor => actor.uniqueId === params.uniqueId);
      const text = typeof params.text === 'string' ? params.text.trim() : '';
      if (!person || !commentFishing.people.has(person.uniqueId)) throw new Error('Nhân vật chưa vào hồ thử.');
      if (!text || text.length > 180) throw new Error('Nhập lời chat từ 1 đến 180 ký tự.');
      return handlePondChat(text, person, person.uniqueId);
    }
    case 'demo.guests':
      for (const guest of DEMO_ACTORS.slice(1)) noteLiveViewer(guest);
      return getPublicState();
    case 'demo.map': {
      if (!pondScenePoll.selectMap(params.id)) throw new Error('Khu câu này không có trong bản thử.');
      const scene = pondScenePoll.snapshot(true);
      broadcastNotification('fishing.pondScene', scene);
      return scene;
    }
    case 'demo.reset':
      demoSession = {};
      pondScenePoll = new PondScenePoll();
      pondActions.cutTrees.clear();
      pondActions.effects.clear();
      FishingEngine.resetState();
      noteLiveViewer(DEMO_ACTORS[0]);
      return getPublicState();
    case 'fishing.fillSimulatedSeats':
      return fillSimulatedSeats(params);
    case 'fishing.viewerJoin':
      return registerLiveViewer(params);
    // Fishing Methods
    case 'fishing.castBait':
    case 'temple.incense': // Backward-compatible alias
      return FishingEngine.castBait(params);

    case 'fishing.castRod':
    case 'temple.prayer': // Backward-compatible alias
      return FishingEngine.castRod(params);

    case 'fishing.hookFish':
    case 'temple.fortune':
    case 'temple.drawFortune': // Backward-compatible alias
      return FishingEngine.hookFish(params);

    case 'fishing.giftThanks':
      return FishingEngine.giftThanks(params);

    case 'fishing.soundHorn':
    case 'temple.bell': // Backward-compatible alias
      return FishingEngine.soundHorn(params);

    case 'fishing.catchBigFish':
    case 'temple.giftLotus': // Backward-compatible alias
      return FishingEngine.catchBigFish(params);

    case 'fishing.catchLeviathan':
    case 'temple.grandCeremony': // Backward-compatible alias
      return FishingEngine.catchLeviathan(params);

    case 'fishing.getState':
    case 'temple.getState':
      return getPublicState();

    case 'fishing.getLeaderboard':
    case 'temple.getLeaderboard':
      return getLeaderboard(params.limit || 20);

    case 'fishing.resetState':
    case 'temple.resetMerit':
      return FishingEngine.resetState();

    case 'fishing.setSettings':
    case 'temple.setSettings':
      return FishingEngine.updateSettings(params);

    case 'live.connect':
    case 'fishing.connectTikTok':
    case 'temple.connectTikTok':
      return await connectTikTokLive(params.username);

    case 'live.disconnect':
    case 'fishing.disconnectTikTok':
    case 'temple.disconnectTikTok':
      return disconnectTikTokLive();

    case 'fishing.startAutoSim':
      configureAutoSim(true);
      return getPublicState();

    case 'fishing.stopAutoSim':
      configureAutoSim(false);
      return getPublicState();

    case 'fishing.comment':
      return parseViewerComment(params.comment, params.user, params.uniqueId, params.avatar);

    case 'fishing.speak': {
      const text = String(params.text || '').trim();
      const voice = params.voice || state.settings.ttsVoice || 'default';
      if (!text) return { ok: false, error: 'empty text' };
      // broadcast === false: chỉ tổng hợp trả về, không phát (giữ tương thích)
      if (params.broadcast === false) {
        return await vieneuTts.synthesize(text, voice);
      }
      // The round already has its own interlude. Background speech can resume in an empty pond.
      if (params.broadcast !== true && state.tiktok.connected && commentFishing.size && state.settings.aphorismEveryRound !== false) {
        return { ok: true, skipped: true };
      }
      const rate = Number(params.rate) || Number(state.settings.ttsSpeed) || 1;
      // Tổng hợp trước để giữ nguyên kết quả trả về (ok/url/voice) như cũ,
      // rồi phát qua HÀNG ĐỢI CHUNG → không chồng tiếng với vòng câu/autopilot.
      const synth = await vieneuTts.synthesize(text, voice).catch(() => null);
      await playTts(text, voice, { rate, prepared: Promise.resolve(synth) });
      return synth || { ok: false, text, voice };
    }

    case 'tts.synthesize':
      return await vieneuTts.synthesize(params.text, params.voice);

    case 'live.setAutoSim':
      configureAutoSim(Boolean(params.enabled));
      return getPublicState();
    case 'live.refreshTunnel':
      await startCloudflareTunnel(server.address().port, true);
      return getPublicState();
    case 'client.register':
      return { ok: true };
    case 'tts.status':
      return vieneuTts.getStatus();

    default:
      throw new Error(`Method không tồn tại: ${method}`);
  }
}

// ============================================================================
// 8. EXPRESS SERVER & WEBSOCKET BROADCASTER
// ============================================================================
const app = express();
app.use((req, res, next) => {
  if (LOCAL_DEMO && isPublicRequest(req)) return res.status(403).send('Hồ câu thử chỉ chạy trên máy này.');
  next();
});
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ============================================================================
// 7b. CHẾ ĐỘ CHỈ-XEM CHO NGƯỜI NGOÀI (link HTTPS / tunnel)
//     Người vào từ link công khai chỉ được XEM hồ câu, không được điều khiển.
// ============================================================================
const PUBLIC_RPC_ALLOW = new Set([
  'fishing.getState', 'temple.getState',
  'fishing.getLeaderboard', 'temple.getLeaderboard',
  'tts.status', 'client.register'
]);

function isPrivateHostname(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^127\./.test(h)) return true;
  return false;
}

function isPublicRequest(req) {
  const headers = (req && req.headers) || {};
  // Đi qua Cloudflare tunnel / proxy → chắc chắn là người ngoài
  if (headers['cf-connecting-ip'] || headers['cf-ray'] || headers['x-forwarded-for']) return true;
  const hostname = String(headers.host || '').split(':')[0];
  return !isPrivateHostname(hostname);
}

function denyPublicPage(res, message) {
  res.status(403).type('html').send(
    '<!doctype html><meta charset="utf-8"><title>Chỉ xem</title>' +
    '<body style="font-family:system-ui;background:#0b1220;color:#e8eef7;display:grid;place-items:center;height:100vh;margin:0">' +
    '<div style="text-align:center;max-width:520px;padding:24px">' +
    '<div style="font-size:44px">🔒</div>' +
    '<h2 style="margin:14px 0 8px">Khu vực điều khiển</h2>' +
    '<p style="color:#9fb0c7;line-height:1.6">' + message + '</p>' +
    '</div></body>'
  );
}

// --- PIN bảo vệ trang quản trị ---
const ADMIN_PIN_FILE = path.join(DATA_DIR, 'admin-pin.txt');

function loadAdminPin() {
  try {
    const saved = fs.readFileSync(ADMIN_PIN_FILE, 'utf8').trim();
    if (/^\d{4,10}$/.test(saved)) return saved;
  } catch (_) {}
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  try { fs.writeFileSync(ADMIN_PIN_FILE, pin, 'utf8'); } catch (_) {}
  return pin;
}
// Khoá API Euler Stream (miễn phí) để vượt giới hạn kết nối TikTok
function loadSignApiKey() {
  const env = String(process.env.TIKTOK_SIGN_API_KEY || '').trim();
  if (env) return env;
  try {
    const p = path.join(__dirname, 'data', 'sign-api-key.txt');
    if (fs.existsSync(p)) {
      const key = fs.readFileSync(p, 'utf8').trim();
      if (key) return key;
    }
  } catch (_) {}
  return '';
}

const ADMIN_PIN = loadAdminPin();

function readCookie(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return '';
}

function adminLoginPage(wrongPin) {
  return '<!doctype html><meta charset="utf-8"><title>Khoá quản trị</title>' +
    '<body style="font-family:system-ui;background:#0b1220;color:#e8eef7;display:grid;place-items:center;height:100vh;margin:0">' +
    '<form method="GET" action="/admin" style="text-align:center;max-width:420px;padding:24px">' +
    '<div style="font-size:44px">🔐</div>' +
    '<h2 style="margin:14px 0 6px">Nhập mã PIN</h2>' +
    '<p style="color:#9fb0c7;line-height:1.6;margin:0 0 18px">Trang quản trị đã được khoá.</p>' +
    (wrongPin ? '<p style="color:#ff6b6b;margin:0 0 12px">Mã PIN không đúng</p>' : '') +
    '<input name="pin" inputmode="numeric" autocomplete="off" autofocus ' +
    'style="width:100%;padding:14px;border-radius:10px;border:1px solid #2a3b52;background:#111a26;color:#fff;font-size:22px;text-align:center;letter-spacing:6px" />' +
    '<button style="margin-top:14px;width:100%;padding:12px;border-radius:10px;border:0;background:#f5b82e;color:#1a1200;font-weight:700;font-size:16px;cursor:pointer">Mở khoá</button>' +
    '</form></body>';
}

app.get('/admin', (req, res) => {
  if (isPublicRequest(req)) {
    return denyPublicPage(res, 'Trang này chỉ mở được trên máy đang chạy hồ câu.');
  }

  const pin = String(req.query.pin || '').trim();
  if (pin) {
    if (pin === ADMIN_PIN) {
      res.setHeader('Set-Cookie', `cauca_pin=${encodeURIComponent(ADMIN_PIN)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`);
      return res.redirect('/admin');
    }
    return res.status(401).type('html').send(adminLoginPage(true));
  }

  if (readCookie(req, 'cauca_pin') === ADMIN_PIN) {
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  }

  res.status(401).type('html').send(adminLoginPage(false));
});
app.use('/tts-cache', express.static(TTS_CACHE_DIR, { maxAge: '7d' }));
app.use(express.urlencoded({ extended: true }));

// Tĩnh tài nguyên
// Chặn mọi đường dẫn quản trị khi truy cập từ bên ngoài (kể cả /admin.html tĩnh)
app.use((req, res, next) => {
  if (isPublicRequest(req) && /^\/admin/i.test(req.path || '')) {
    return denyPublicPage(res, 'Trang này chỉ mở được trên máy đang chạy hồ câu.');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/data/tts-cache', express.static(TTS_CACHE_DIR));

// JSON-RPC 2.0 HTTP Endpoint
app.post('/rpc', async (req, res) => {
  const body = req.body;
  if (!body || body.jsonrpc !== '2.0' || !body.method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: body?.id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC 2.0 Request' }
    });
  }

  // Người ngoài (link HTTPS công khai): CHẶN TOÀN BỘ RPC — chỉ được xem qua WebSocket
  if (isPublicRequest(req)) {
    return res.status(403).json({
      jsonrpc: '2.0',
      id: body.id ?? null,
      error: { code: -32003, message: 'Chế độ chỉ xem: không thể điều khiển hồ câu từ bên ngoài.' }
    });
  }

  try {
    const result = await handleRpcCall(body.method, body.params || {});
    return res.json({
      jsonrpc: '2.0',
      id: body.id ?? null,
      result
    });
  } catch (err) {
    return res.status(500).json({
      jsonrpc: '2.0',
      id: body.id ?? null,
      error: { code: -32000, message: err.message || 'Internal RPC Error' }
    });
  }
});

// Danh mục cá API
app.get('/api/fish-catalog', (_req, res) => {
  res.json({ ok: true, catalog: FISH_CATALOG });
});

// VieNeu-TTS HTTP Endpoint (Hải Đăng default)
app.all('/api/tts', async (req, res) => {
  // Chặn hoàn toàn từ internet — giọng chúc mừng đã do server tự tạo và phát
  if (isPublicRequest(req)) {
    return res.status(403).json({ ok: false, error: 'Chế độ chỉ xem' });
  }
  const text = (req.body?.text || req.query?.text || '').trim();
  const voice = (req.body?.voice || req.query?.voice || state.settings.ttsVoice || 'default').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'Thiếu nội dung text cần đọc' });
  }
  const result = await vieneuTts.synthesize(text, voice);
  res.json(result);
});

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('error', (err) => {
  console.warn('[WebSocket Server Error]', err?.message || err);
});

function broadcastNotification(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      if (client.isFishingScreen && method === 'fishing.event' && ['hookFish','catchBigFish','catchLeviathan'].includes(params?.event?.type)) {
        catchRoundClock.notice(client, params.event.id, 'queued');
      }
      if (client.isFishingScreen && method === 'tts.play' && params.sequenceId) {
        catchRoundClock.notice(client, params.sequenceId, 'queued');
      }
      try {
        client.send(payload);
      } catch (err) {
        console.warn('[WS Broadcast Error]', err?.message || err);
      }
    }
  }
}

wss.on('connection', (ws, req) => {
  // Ghi nhớ kết nối này đến từ máy local hay từ link công khai
  ws.isPublic = isPublicRequest(req);
  if (LOCAL_DEMO && ws.isPublic) return ws.close(1008, 'Local demo');

  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'fishing.state',
      params: getPublicState()
    })
  );

  ws.on('close', () => {
    catchRoundClock.disconnect(ws);
    if (activeObsClients.has(ws)) {
      activeObsClients.delete(ws);
      broadcastNotification('fishing.state', getPublicState());
    }
  });

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch (_) {
      return;
    }
    if (!msg || !msg.method) return;

    // Người ngoài chỉ được đọc trạng thái, không được gọi lệnh điều khiển
    if (ws.isPublic && msg.method !== 'client.catchNotice' && msg.method !== 'client.register'
        && !PUBLIC_RPC_ALLOW.has(msg.method)) {
      if (msg.id !== undefined) {
        ws.send(JSON.stringify({
          jsonrpc: '2.0', id: msg.id,
          error: { code: -32003, message: 'Chế độ chỉ xem: không thể điều khiển hồ câu từ bên ngoài.' }
        }));
      }
      return;
    }

    try {
      if (msg.method === 'client.catchNotice') {
        ws.isFishingScreen = true;
        catchRoundClock.notice(ws, msg.params?.id, msg.params?.phase === 'closed' ? 'closed' : 'open');
        return;
      }
      if (msg.method === 'client.register') {
        const isObs = Boolean(msg.params?.isObs);
        ws.isObs = isObs;
        if (isObs) {
          activeObsClients.add(ws);
        } else {
          activeObsClients.delete(ws);
        }
        broadcastNotification('fishing.state', getPublicState());
        if (msg.id !== undefined) {
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { ok: true, isObs } }));
        }
        return;
      }

      const result = await handleRpcCall(msg.method, msg.params || {});
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result
          })
        );
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: err.message || 'RPC Error' }
          })
        );
      }
    }
  });
});

const vieneuTts = new VieNeuTTSManager();

// A parent process with an IPC channel can stop its own server and worker.
if (process.send) {
  process.on('disconnect', () => {
    if (vieneuTts.proc) vieneuTts.proc.kill();
    if (cfTunnelProc) cfTunnelProc.kill();
    server.close();
    process.exit(0);
  });
}

let cfTunnelProc = null;
let cfDownloading = false;

async function ensureCloudflaredBinary(cfPath) {
  if (fs.existsSync(cfPath) && fs.statSync(cfPath).size > 1000000) {
    return true;
  }
  if (process.platform !== 'win32' || cfDownloading) return false;
  cfDownloading = true;
  try {
    console.log('[Tunnel] Đang tự động tải công cụ tạo link HTTPS (cloudflared.exe)...');
    const url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
    const resp = await fetch(url, { redirect: 'follow' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    await fs.promises.writeFile(cfPath, buf);
    console.log('[Tunnel] Đã tải xong cloudflared.exe!');
    cfDownloading = false;
    return true;
  } catch (err) {
    console.warn('[Tunnel] Không thể tự tải cloudflared.exe:', err.message);
    cfDownloading = false;
    return false;
  }
}

async function startCloudflareTunnel(localPort, forceRestart = false) {
  if (LOCAL_DEMO) return;
  const cfPath = process.env.CAUCA_CLOUDFLARED_PATH || path.join(__dirname, 'cloudflared.exe');

  if (forceRestart && cfTunnelProc) {
    try {
      cfTunnelProc.kill();
    } catch (_) {}
    cfTunnelProc = null;
    publicTunnelUrl = '';
    broadcastNotification('fishing.state', getPublicState());
  }

  const hasBin = await ensureCloudflaredBinary(cfPath);
  if (!hasBin) return;

  try {
    cfTunnelProc = spawn(cfPath, ['tunnel', '--url', `http://127.0.0.1:${localPort}`, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const onChunk = (chunk) => {
      const text = chunk.toString('utf8');
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && match[0] && !publicTunnelUrl) {
        publicTunnelUrl = `${match[0]}/?obs=1`;
        console.log(`============================================================`);
        console.log(`🌐 LINK HTTPS CHO TIKTOK LIVE STUDIO (DÁN VÀO NGUỒN LIÊN KẾT):`);
        console.log(`👉 ${publicTunnelUrl}`);
        console.log(`============================================================`);
        broadcastNotification('fishing.state', getPublicState());
      }
    };

    cfTunnelProc.stdout.on('data', onChunk);
    cfTunnelProc.stderr.on('data', onChunk);
    cfTunnelProc.on('error', () => {});
  } catch (_) {}
}

function startAutopilot() {
  try {
    const candidates = [
      path.join(__dirname, '..', '..', '..', 'live-autopilot.js'),
      path.join(__dirname, '..', '..', 'live-autopilot.js')
    ];
    const script = candidates.find((file) => fs.existsSync(file));
    if (!script) return;
    const nodeExe = path.join(__dirname, 'runtime', 'node.exe');
    const exe = fs.existsSync(nodeExe) ? nodeExe : process.execPath;
    const child = spawn(exe, [script], {
      cwd: path.dirname(script),
      windowsHide: true,
      stdio: 'ignore',
      detached: true
    });
    child.unref();
    console.log('🔊 Autopilot châm ngôn: đã khởi động tự động');
  } catch (err) {
    console.warn('[Autopilot] Không khởi động được:', err?.message || err);
  }
}

function startServer(portToTry) {
  const onError = (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = Number(portToTry) + 1;
      console.warn(`[Server] Cổng ${portToTry} đang bận, tự động chuyển sang cổng ${nextPort}...`);
      server.removeListener('error', onError);
      startServer(nextPort);
    } else {
      console.error('[Server Error]', err);
    }
  };
  server.once('error', onError);
  // Chỉ lắng nghe trên máy này (127.0.0.1) — chặn hoàn toàn truy cập từ LAN/WiFi
  server.listen(portToTry, '127.0.0.1', () => {
    server.removeListener('error', onError);
    const actualPort = server.address().port;
    if (LOCAL_DEMO) {
      demoSession = {};
      pondScenePoll.reset();
      noteLiveViewer(DEMO_ACTORS[0]);
    }
    if (state.settings.autoSim && !autoSimTimer) configureAutoSim(true);
    console.log(`============================================================`);
    console.log(LOCAL_DEMO ? '🎣 HỒ CÂU CHẠY THỬ TRÊN MÁY NÀY' : '🧊 HỒ CÂU CÁ TIKTOK LIVE RPC ĐÃ KHỞI ĐỘNG');
    console.log(`📺 Màn hình Live (9:16 OBS): http://localhost:${actualPort}`);
    console.log(`🎛️ Bảng điều khiển RPC Admin: http://localhost:${actualPort}/admin`);
    console.log(`🔌 JSON-RPC 2.0 Endpoint   : http://localhost:${actualPort}/rpc (ws://localhost:${actualPort}/ws)`);
    console.log(`============================================================`);
    if (process.argv.includes('--open') && process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '', `http://localhost:${actualPort}`], { stdio: 'ignore', detached: true }).unref();
    }
    if (process.argv.includes('--cloudflare')) {
      startCloudflareTunnel(actualPort);
    }
    if (!LOCAL_DEMO && process.env.CAUCA_DISABLE_AUTOPILOT !== '1') startAutopilot();
  });
}

function resetLeaderboardOnDeadline() {
  if (!leaderboardResetClock.due()) return;

  // TRƯỚC KHI XOÁ: lưu người đứng đầu vào đền Thần Câu Cá
  const champion = Object.values(state.anglers)
    .filter(p => !isSimulatedAngler(p)
      && Number(p.totalWeightKg) > 0
      && !/^(gt_|gtx_|gtest|gift_test|thinh_|troll_|tiny_|tt\d|chuan_)/i.test(String(p.uniqueId || ''))
      && !/^(Dai Gia|Nha Hao|Test|Troll Test|Thu Thinh|Dai Thinh)/i.test(String(p.name || '')))
    .sort((a, b) => (Number(b.totalWeightKg) || 0) - (Number(a.totalWeightKg) || 0))[0];
  if (champion) {
    if (!Array.isArray(state.cauThanHall)) state.cauThanHall = [];
    state.cauThanHall.push({
      name: champion.name,
      kg: +(Number(champion.totalWeightKg) || 0).toFixed(1),
      catches: Number(champion.catchesCount) || 0,
      crownedAt: Date.now()
    });
    state.cauThanHall.sort((a, b) => b.kg - a.kg);
    state.cauThanHall = state.cauThanHall.slice(0, 20);
  }

  for (const person of Object.values(state.anglers)) {
    person.totalWeightKg = 0; person.totalRevenue = 0; person.points = 0; person.catchesCount = 0; person.giftCoins = 0;
    person.bestCatch = null; delete person.lastCatchAt;
    person.title = calculateAnglerTitle(0, 0);
  }
  state.totalCatches = 0; state.totalWeightKg = 0; state.totalRevenue = 0; state.totalBait = 0; state.hornsBlown = 0;
  state.activeFish = null; state.rodState = 'idle'; state.recentEvents = [];
  commentFishing.restUntil.clear(); simulationFishing.restUntil.clear();
  pondSeating.rebalance();
  saveState();
  broadcastNotification('fishing.leaderboardReset', { resetAt: leaderboardResetClock.resetAt });
  broadcastNotification('fishing.state', getPublicState());
}
setInterval(resetLeaderboardOnDeadline, 1000).unref();
setInterval(() => {
  const live = Boolean(pondSession());
  if (pondScenePoll.update() || (live && Date.now() - lastPondSceneBroadcastAt >= 15000)) {
    const scene = pondScenePoll.snapshot(live);
    lastPondSceneBroadcastAt = scene.serverNow;
    broadcastNotification('fishing.pondScene', scene);
  }
}, 1000).unref();
setInterval(() => {
  const { changed, cut } = pondActions.update(id => Boolean(pondSession() && commentFishing.people.has(id)));
  if (changed) broadcastNotification('fishing.pondActions', pondActions.snapshot());
  if (cut) saveState(true);
  runCommentFishingRound();
}, 250).unref();
startServer(Number(PORT));
