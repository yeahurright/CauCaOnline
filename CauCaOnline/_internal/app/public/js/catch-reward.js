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
    'slipper', 'chest', 'coin', 'vase',
    'ca_com_bien', 'ca_nuc_bien', 'sao_bien', 'muc_ong_bien',
    'ca_ngu_bien', 'ca_kiem_bien', 'ca_map_dau_bua', 'ca_nha_tang'
  ];
  window.PondCatchArtIds = NEW_FISH_ART;
  function renderMini(element, fish) {
    element.textContent = '';
    if (NEW_FISH_ART.includes(fish.id) || fish.id === 'chim_trang') {
      const image = document.createElement('img');
      image.src = fish.id === 'chim_trang' ? '/assets/fish_pomfret_reward.png' : `/assets/new_fish/${fish.id}.png`;
      image.alt = '';
      image.onerror = () => { element.textContent = fish.icon || '🐟'; };
      element.append(image);
    } else if (Object.hasOwn(fishTiles, fish.id)) {
      const tile = fishTiles[fish.id];
      element.style.backgroundImage = 'url(/assets/fish_reward_atlas.png)';
      element.style.backgroundSize = '400% 400%';
      element.style.backgroundPosition = `${tile % 4 * 100 / 3}% ${Math.floor(tile / 4) * 100 / 3}%`;
    } else element.textContent = fish.icon || '🐟';
  }
  const art = document.getElementById('catchIcon');
  const stage = document.getElementById('catchArtStage');
  const avatar = document.getElementById('catchAnglerAvatar');
  const fallback = document.getElementById('catchAvatarFallback');
  const artwork = new Map();
  const tailOnRight = new Set([
    'basa_re', 'dieu_hong', 'hoi_cau_vong', 'loc_dong', 'mat_trang', 'rong_den', 'ca_voi',
    'ca_com_bien', 'ca_nuc_bien', 'muc_ong_bien', 'ca_ngu_bien', 'ca_kiem_bien', 'ca_map_dau_bua', 'ca_nha_tang'
  ]);
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
  function setAvatar(image, initials, name, raw) {
    const url = avatarUrl(raw);
    initials.textContent = name.trim().split(/\s+/).slice(-2).map(part => Array.from(part)[0] || '').join('').toUpperCase() || '🎣';
    image.onload = () => { image.hidden = false; initials.hidden = true; };
    image.onerror = () => { image.hidden = true; initials.hidden = false; };
    if (image.getAttribute('src') !== url) {
      image.hidden = true;
      initials.hidden = false;
      if (url) image.src = url;
      else image.removeAttribute('src');
    }
  }
  function render(event) {
    const fish = event.fish || {};
    if (art) {
      const token = {};
      const effect = (fish.anomalyEffect || fish.mutation)?.id || '';
      const hasImage = NEW_FISH_ART.includes(fish.id);
      const tile = fishTiles[fish.id];
      stage.querySelector('.catch-bleed-mask')?.remove();
      art.renderToken = token;
      art.textContent = '';
      art.dataset.fishId = fish.id || '';
      art.dataset.effect = effect;
      stage.dataset.backdrop = event.type === 'rodBreak' ? '' : effect;
      stage.classList.toggle('has-seascape-art', Boolean(fish.ocean && hasImage));
      art.classList.toggle('has-art', hasImage || fish.id === 'chim_trang');
      if (effect === 'bleeding' && event.type !== 'rodBreak') {
        const mask = document.createElement('span');
        mask.className = 'catch-bleed-mask';
        mask.setAttribute('aria-hidden', 'true');
        const right = tailOnRight.has(fish.id);
        mask.style.setProperty('--bleed-x', right ? '72%' : '31%');
        mask.style.setProperty('--bleed-y', fish.id === 'chach_lua' ? '38%' : '53%');
        if (hasImage) {
          mask.style.maskImage = `url("/assets/new_fish/${fish.id}.png")`;
        } else if (fish.id === 'chim_trang') {
          mask.style.maskImage = 'url("/assets/fish_pomfret_reward.png")';
        } else if (Number.isInteger(tile)) {
          mask.style.maskImage = 'url("/assets/fish_reward_atlas.png")';
          mask.style.maskSize = '400% 400%';
          mask.style.maskPosition = `${tile % 4 * 100 / 3}% ${Math.floor(tile / 4) * 100 / 3}%`;
        }
        if (mask.style.maskImage) stage.append(mask);
      }
      art.classList.toggle('effect-dead', effect === 'dead');
      art.classList.toggle('effect-albino', effect === 'albino');
      art.classList.toggle('effect-giant', effect === 'giant');
      art.setAttribute('role', 'img');
      art.setAttribute('aria-label', [fish.name || 'Cá vừa câu được', fish.anomalyEffect?.name, fish.mutation?.name].filter(Boolean).join(' — '));
      if (hasImage) {
        // Dùng thẻ <img> thật — ổn định hơn background-image
        art.style.backgroundImage = 'none';
        art.innerHTML = `<img class="catch-art-img" src="/assets/new_fish/${fish.id}.png" alt="">`;
      } else if (fish.id === 'chim_trang') {
        art.style.backgroundImage = 'url("/assets/fish_pomfret_reward.png")';
        art.style.backgroundSize = 'contain';
        art.style.backgroundPosition = 'center';
      } else if (Number.isInteger(tile)) {
        art.style.backgroundImage = 'url("/assets/fish_reward_atlas.png")';
        art.style.backgroundSize = '400% 400%';
        art.style.backgroundPosition = `${tile % 4 * 100 / 3}% ${Math.floor(tile / 4) * 100 / 3}%`;
      } else {
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
    avatar.alt = `Ảnh đại diện của ${name}`;
    setAvatar(avatar, fallback, name, event.avatar);
  }
  window.CatchRewardVisuals = { render, renderMini, setAvatar };
})();
