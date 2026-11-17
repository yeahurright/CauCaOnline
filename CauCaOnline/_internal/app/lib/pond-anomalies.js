const ANOMALIES = {
  eclipse: {
    name: 'Nhật thực', perk: 'Vảy Bóng Đen · ×3 xèng, cần bất gãy',
    announcement: 'Nhật thực tới rồi! Cả hồ tối sầm. Câu được Vảy Bóng Đen là bán gấp ba xèng!',
    effects: [
      { id: 'suffocated', name: 'Chết Ngạt', multiplier: 0, description: 'Bán được 0 xèng.' },
      { id: 'shadow-scale', name: 'Vảy Bóng Đen', multiplier: 3, description: 'Giá bán nhân ba. Cần không thể gãy.', safeRod: true }
    ]
  },
  'blood-moon': {
    name: 'Trăng Máu', perk: 'Vảy Hồng Ngọc · ×3 xèng, thêm lộc',
    announcement: 'Trăng Máu lên rồi! Nhìn mặt nước đỏ kìa. Ai câu được Vảy Hồng Ngọc thì bán gấp ba xèng!',
    effects: [
      { id: 'bleeding', name: 'Chảy Máu', multiplier: 0, description: 'Bán được 0 xèng.' },
      { id: 'ruby-scale', name: 'Vảy Hồng Ngọc', multiplier: 3, description: 'Giá bán nhân ba. Hai con bán được tiếp theo thêm ba mươi phần trăm.' }
    ]
  },
  aurora: {
    name: 'Cực quang', perk: 'Vảy Lăng Kính · ×3 xèng, bảo đảm cá lớn',
    announcement: 'Cực quang xuất hiện rồi! Nhìn trời xanh tím kìa. Vảy Lăng Kính bán gấp ba xèng!',
    effects: [
      { id: 'blinded', name: 'Mù Lòa', multiplier: 0, description: 'Bán được 0 xèng.' },
      { id: 'prism-scale', name: 'Vảy Lăng Kính', multiplier: 3, description: 'Giá bán nhân ba. Cá thưởng kế tiếp nặng hơn mười ký.' }
    ]
  }
};

const anomalyEffects = Object.entries(ANOMALIES).flatMap(([anomalyId, event]) =>
  event.effects.map(effect => ({ ...effect, anomalyId })));

module.exports = { ANOMALIES, anomalyEffects, ANOMALY_DURATION_MS: 30_000, RUBY_SALE_PERCENT: 130, PRISM_MIN_KG: 10.1 };
