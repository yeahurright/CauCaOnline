const { isSimulatedAngler } = require('./pond-seating');
const SIM_CATCH_VOICE_MODES = ['large', 'off', 'all'];
const LARGE_FISH_KG = 5;
// Chỉ đọc chúc mừng khi cá NẶNG HƠN mốc này (kg)
const CONGRATS_MIN_KG = 5;

function shouldReadCatchCongratulations(person, fish, settings = {}, requested = true) {
  if (!(Number(fish?.tier) >= 2)) return false;
  if (!(Number(fish?.weightKg) > CONGRATS_MIN_KG)) return false;
  if (requested === false) return false;
  if (!isSimulatedAngler(person)) return true;
  const mode = settings.simCatchVoice || 'all';
  if (mode === 'off') return false;
  if (mode === 'large') return Number(fish?.weightKg) >= LARGE_FISH_KG;
  return true;
}

module.exports = { shouldReadCatchCongratulations, SIM_CATCH_VOICE_MODES, LARGE_FISH_KG, CONGRATS_MIN_KG };
