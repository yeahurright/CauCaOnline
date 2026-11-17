const commonEffects = [
  { id: 'albino', name: 'Bạch tạng', multiplier: 4, percent: 1 },
  { id: 'hyper', name: 'Tăng động', multiplier: 0.5, percent: 10 },
  { id: 'giant', name: 'Đột biến kích thước', multiplier: 2, percent: 5 }
];
const mapFishing = {
  still: {
    dead: 55, special: { id: 'infected', name: 'Nhiễm bệnh', multiplier: 0, percent: 15 },
    favorites: ['loc_dong', 'ro_dong', 'troi_den', 'tra_khung', 'tre_hoang_kim', 'rong_den']
  },
  spring: {
    dead: 12, special: { id: 'pure', name: 'Tinh khiết', multiplier: 1.5, percent: 18 },
    favorites: ['bong_cat', 'chach_lua', 'lang_hoa', 'hoi_cau_vong', 'tam_hoang_gia', 'rong_kim_long']
  },
  lotus: {
    dead: 18, special: { id: 'lotus', name: 'Hương Sen', multiplier: 1.8, percent: 18 },
    favorites: ['me_hoa', 'chep_vang', 'dieu_hong', 'koi_cam_thach', 'mat_trang', 'rua_than_ngoc']
  }
};
const profiles = new Map(Object.entries(mapFishing).map(([id, fishing]) => [id, {
  favorites: fishing.favorites,
  effects: [{ id: 'dead', name: 'Chết', multiplier: 0.1, percent: fishing.dead }, fishing.special, ...commonEffects]
}]));

// Giá xu/kg đã chia 10 theo bảng giá; chỉ cá thật nhận hiệu ứng.
const PRICE_PER_KG = {
  bong_cat: 2, ro_dong: 2.4, me_hoa: 2.8, tai_tuong: 3.2,
  dieu_hong: 3.4, troi_den: 3.6, loc_dong: 4,
  chep_vang: 6, chim_trang: 6.8, lang_hoa: 7.6,
  chach_lua: 8.4, basa_re: 9.2, tra_khung: 10,
  channa_hoang_de: 15, mat_trang: 16, koi_cam_thach: 17,
  hoi_cau_vong: 18.5, tre_hoang_kim: 19.5, tam_hoang_gia: 21,
  rong_kim_long: 22, rong_den: 24, thuy_quai_ho_sau: 26,
  rua_than_ngoc: 28, ca_voi: 30
};

function pickFishForMap(candidates, mapId, random = Math.random) {
  const favorites = profiles.get(mapId)?.favorites || [];
  const weights = candidates.map(fish => favorites.includes(fish.id) ? 3 : 1);
  let ticket = random() * weights.reduce((sum, weight) => sum + weight, 0);
  return candidates.find((_, index) => (ticket -= weights[index]) < 0) || candidates.at(-1);
}

function rollFishMutation(fish, mapId, random = Math.random) {
  if (!fish || fish.isTrash || fish.species === 'Rác hồ câu' || fish.species === 'Cổ vật' || fish.rarity === 'Rác') return fish;
  const { effects } = profiles.get(mapId) || profiles.get('still');
  let ticket = random() * 100;
  const effect = effects.find(({ percent }) => (ticket -= percent) < 0);
  if (!effect) return fish;
  const { id, name, multiplier } = effect;
  return { ...fish, mutation: { id, name, multiplier } };
}

function fishSaleXu(fish) {
  if (!fish) return null;
  const price = Object.hasOwn(PRICE_PER_KG, fish.id) ? PRICE_PER_KG[fish.id] : null;
  if (price === null || !Number.isFinite(fish.weightKg) || fish.weightKg <= 0) return null;
  const value = fish.mutation?.multiplier;
  const parsed = value == null || value === '' ? 1 : Number(value);
  const multiplier = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
  const scaled = Math.round(price * 10) * Math.round(fish.weightKg * 100) * Math.round(multiplier * 10);
  return Math.floor((scaled + 5000) / 10000);
}

module.exports = { fishSaleXu, rollFishMutation, pickFishForMap };

