const { ANOMALIES, RUBY_SALE_PERCENT } = require('./pond-anomalies');
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
  },
  bay: {
    dead: 12, special: { id: 'tidal', name: 'Ánh Biển', multiplier: 1.5, percent: 18 },
    favorites: ['ca_com_bien', 'ca_nuc_bien', 'muc_ong_bien', 'ca_ngu_bien']
  }
};
const profiles = new Map(Object.entries(mapFishing).map(([id, fishing]) => [id, {
  favorites: fishing.favorites,
  effects: [{ id: 'dead', name: 'Chết', multiplier: 0.1, percent: fishing.dead }, fishing.special, ...commonEffects]
}]));

// Giá xèng/kg đã chia 10 theo bảng giá; chỉ cá thật nhận hiệu ứng.
const PRICE_PER_KG = {
  bong_cat: 2, ro_dong: 2.4, me_hoa: 2.8, tai_tuong: 3.2,
  dieu_hong: 3.4, troi_den: 3.6, loc_dong: 4,
  chep_vang: 6, chim_trang: 6.8, lang_hoa: 7.6,
  chach_lua: 8.4, basa_re: 9.2, tra_khung: 10,
  channa_hoang_de: 15, mat_trang: 16, koi_cam_thach: 17,
  hoi_cau_vong: 18.5, tre_hoang_kim: 19.5, tam_hoang_gia: 21,
  rong_kim_long: 22, rong_den: 24, thuy_quai_ho_sau: 26,
  rua_than_ngoc: 28, ca_voi: 30,
  ca_com_bien: 2.2, ca_nuc_bien: 4.0, sao_bien: 6.5, muc_ong_bien: 9,
  ca_ngu_bien: 17, ca_kiem_bien: 20, ca_map_dau_bua: 27, ca_nha_tang: 30
};

function pickFishForMap(candidates, mapId, random = Math.random) {
  const favorites = profiles.get(mapId)?.favorites || [];
  const weights = candidates.map(fish => favorites.includes(fish.id) ? 3 : 1);
  let ticket = random() * weights.reduce((sum, weight) => sum + weight, 0);
  return candidates.find((_, index) => (ticket -= weights[index]) < 0) || candidates.at(-1);
}

function fishEffectsForMap(mapId) {
  return (profiles.get(mapId) || profiles.get('still')).effects;
}

const daylight = { label: 'Cá khỏe hơn', badEffect: .75 };
const inlandWeather = {
  sun: daylight,
  rain: { label: 'Cá nặng hơn', weight: 1.08 },
  mist: { label: 'Dễ gặp cá hiếm', rareChance: .12 }
};
const seaWeather = {
  sun: daylight,
  rain: { label: 'Cá to hơn · dễ gãy cần', weight: 1.14, rodRisk: 1.15 },
  mist: { label: 'Dễ gặp cá Ánh Biển', specialBoost: 8 }
};

function weatherPerkForMap(mapId, weather) {
  const perks = mapId === 'bay' ? seaWeather : inlandWeather;
  return Object.hasOwn(perks, weather) ? perks[weather] : null;
}

function isNonFishItem(fish) {
  return Boolean(fish && (fish.isTrash || fish.species === 'Rác hồ câu' || fish.species === 'Cổ vật' || fish.rarity === 'Rác'));
}

function rollFishMutation(fish, mapId, random = Math.random, bonuses = null, weatherPerk = null) {
  if (!fish || isNonFishItem(fish)) return fish;
  const effects = fishEffectsForMap(mapId);
  let ticket = random() * 100;
  const bloomEffect = effects[1].multiplier > 1 ? effects[1].id : 'giant';
  for (const { id, name, multiplier, percent } of effects) {
    let chance = percent;
    if (bonuses?.has('clean') && (id === 'dead' || id === 'infected')) chance *= .88;
    if (bonuses?.has('water') && id === bloomEffect) chance += 4;
    if (id === 'dead' || id === 'infected') chance *= weatherPerk?.badEffect ?? 1;
    if (id === effects[1].id) chance += weatherPerk?.specialBoost ?? 0;
    ticket -= chance;
    if (ticket < 0) return { ...fish, mutation: { id, name, multiplier } };
  }
  return fish;
}

function rollAnomalyEffect(fish, anomalyId, random = Math.random) {
  if (!fish || isNonFishItem(fish) || !Object.hasOwn(ANOMALIES, anomalyId)) return fish;
  const roll = random();
  if (roll >= .99) return fish;
  const [common, rare] = ANOMALIES[anomalyId].effects;
  const anomalyEffect = roll < .09 ? rare : common;
  const affected = { ...fish, anomalyId, anomalyEffect };
  if (anomalyEffect.safeRod) delete affected.rodBroken;
  return affected;
}

function fishSaleXu(fish) {
  if (!fish) return null;
  const price = Object.hasOwn(PRICE_PER_KG, fish.id) ? PRICE_PER_KG[fish.id] : null;
  if (price === null || !Number.isFinite(fish.weightKg) || fish.weightKg <= 0) return null;
  const value = (fish.anomalyEffect || fish.mutation)?.multiplier;
  const parsed = value == null || value === '' ? 1 : Number(value);
  const multiplier = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
  const scaled = Math.round(price * 10) * Math.round(fish.weightKg * 100) * Math.round(multiplier * 10);
  const salePercent = fish.rubyBonus ? RUBY_SALE_PERCENT : 100;
  const weightPercent = fish.weightKg > 10 ? 30 : 100;
  return Math.floor((scaled * salePercent * weightPercent + 50_000_000) / 100_000_000);
}

module.exports = { fishSaleXu, isNonFishItem, rollFishMutation, rollAnomalyEffect, pickFishForMap, fishEffectsForMap, weatherPerkForMap };

