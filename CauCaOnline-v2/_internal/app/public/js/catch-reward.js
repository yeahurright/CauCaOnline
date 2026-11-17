/* Catch-card artwork is independent of the fish swimming in the pond. */
(() => {
  const fishTiles = {
    bong_cat: 0, ro_dong: 1, me_hoa: 2, troi_den: 3,
    tai_tuong: 4, chep_vang: 5, tra_khung: 6, lang_hoa: 7,
    koi_cam_thach: 8, tre_hoang_kim: 9, tam_hoang_gia: 10,
    channa_hoang_de: 11, rong_kim_long: 12, thuy_quai_ho_sau: 13,
    rua_than_ngoc: 15
  };
  // Ảnh mới do người dùng gen, đã tách nền trong suốt
  const NEW_FISH_ART = [
    'dieu_hong', 'loc_dong', 'basa_re', 'chach_lua',
    'hoi_cau_vong', 'mat_trang', 'rong_den', 'ca_voi',
    'rubber_boot', 'plastic_bottle', 'tire', 'bucket',
    'slipper', 'chest', 'coin', 'vase'
  ];
  const art = document.getElementById('catchIcon');
  const avatar = document.getElementById('catchAnglerAvatar');
  const fallback = document.getElementById('catchAvatarFallback');
  const artwork = new Map();
  for (const path of ['/assets/fish_reward_atlas.png', '/assets/fish_pomfret_reward.png']) {
    const img = new Image();
    img.src = path;
    artwork.set(path, img);
  }
  function avatarUrl(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    try {
      const url = new URL(raw, window.location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch (_) { return null; }
  }
  function render(event) {
    const fish = event.fish || {};
    if (art) {
      const token = {};
      art.renderToken = token;
      art.textContent = '';
      art.dataset.fishId = fish.id || '';
      art.dataset.effect = fish.mutation?.id || '';
      art.classList.toggle('effect-dead', fish.mutation?.id === 'dead');
      art.classList.toggle('effect-albino', fish.mutation?.id === 'albino');
      art.classList.toggle('effect-giant', fish.mutation?.id === 'giant');
      art.setAttribute('role', 'img');
      art.setAttribute('aria-label', [fish.name || 'Cá vừa câu được', fish.mutation?.name].filter(Boolean).join(' — '));
      if (NEW_FISH_ART.includes(fish.id)) {
        // Dùng thẻ <img> thật — ổn định hơn background-image
        art.classList.add('has-art');
        art.style.backgroundImage = 'none';
        art.innerHTML = `<img class="catch-art-img" src="/assets/new_fish/${fish.id}.png" alt="">`;
      } else if (fish.id === 'chim_trang') {
        art.classList.add('has-art');
        art.style.backgroundImage = 'url("/assets/fish_pomfret_reward.png")';
        art.style.backgroundSize = 'contain';
        art.style.backgroundPosition = 'center';
      } else if (Object.hasOwn(fishTiles, fish.id)) {
        const tile = fishTiles[fish.id];
        art.style.backgroundImage = 'url("/assets/fish_reward_atlas.png")';
        art.style.backgroundSize = '400% 400%';
        art.style.backgroundPosition = `${tile % 4 * 100 / 3}% ${Math.floor(tile / 4) * 100 / 3}%`;
      } else {
        art.classList.remove('has-art');
        art.style.backgroundImage = 'none';
        art.textContent = fish.icon || '🐟';
      }
      const path = fish.id === 'chim_trang' ? '/assets/fish_pomfret_reward.png'
        : Object.hasOwn(fishTiles, fish.id) ? '/assets/fish_reward_atlas.png' : null;
      if (path) {
        let img = artwork.get(path);
        if (!img) { img = new Image(); img.src = path; artwork.set(path, img); }
        const background = art.style.backgroundImage;
        const show = () => {
          if (art.renderToken !== token) return;
          art.style.backgroundImage = background;
          art.textContent = '';
        };
        if (img.complete && img.naturalWidth > 0) show();
        else {
          art.style.backgroundImage = 'none';
          art.textContent = fish.icon || '🐟';
          img.addEventListener('load', show, { once: true });
        }
      }
    }
    if (!avatar || !fallback) return;
    const name = String(event.user || 'Cần thủ');
    fallback.textContent = name.trim().split(/\s+/).slice(-2).map(part => Array.from(part)[0] || '').join('').toUpperCase() || '🎣';
    fallback.hidden = false;
    avatar.hidden = true;
    avatar.alt = `Ảnh đại diện của ${name}`;
    avatar.onload = () => { avatar.hidden = false; fallback.hidden = true; };
    avatar.onerror = () => { avatar.hidden = true; fallback.hidden = false; };
    const url = avatarUrl(event.avatar);
    if (url) avatar.src = url;
    else avatar.removeAttribute('src');
  }
  window.CatchRewardVisuals = { render };
})();
