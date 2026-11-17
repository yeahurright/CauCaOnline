(() => {
  const panel = document.getElementById('speechControls');
  if (!panel) return;
  panel.innerHTML = `
    <div class="speech-test"><input id="speechTestText" type="text" aria-label="Nội dung đọc thử" value="Mời bạn ghé hồ câu! Chúc bạn câu được cá lớn." maxlength="160" /><button id="speechTestButton" type="button">▶ Đọc thử</button></div>
    <label for="ttsVoiceSelect">🎙 Chọn giọng đọc</label>
    <select id="ttsVoiceSelect" disabled><option>Đang tải giọng đọc…</option></select>
    <span id="ttsVoiceStatus" class="speech-status" role="status" aria-live="polite"></span>
    <div class="speech-speed-label"><label for="ttsSpeed">Tốc độ giọng đọc</label><output id="ttsSpeedValue" for="ttsSpeed">1.00×</output></div>
    <input id="ttsSpeed" type="range" min="0.5" max="2" step="0.05" value="1" />
    <div class="speech-range-labels"><span>Chậm · 0.5×</span><span>Nhanh · 2×</span></div>
    <audio id="speechPreview" controls preload="none" aria-label="Nghe thử giọng đọc"></audio>`;
  const select = panel.querySelector('#ttsVoiceSelect');
  const status = panel.querySelector('#ttsVoiceStatus');
  const speed = panel.querySelector('#ttsSpeed');
  const output = panel.querySelector('#ttsSpeedValue');
  const preview = panel.querySelector('#speechPreview');
  const button = panel.querySelector('#speechTestButton');
  let editingSpeed = false;
  let pendingSaves = 0;
  let saveQueue = Promise.resolve();
  function displaySpeed(value) {
    output.value = `${Number(value).toFixed(2)}×`;
    preview.playbackRate = Number(value);
    preview.preservesPitch = true;
  }
  function showSelection() {
    status.textContent = `Đang dùng: ${select.selectedOptions[0]?.textContent || 'giọng mặc định'}. Lựa chọn được lưu tự động.`;
  }
  async function refresh() {
    if (pendingSaves || editingSpeed) return;
    try {
      const response = await fetch('/api/state');
      if (!response.ok) throw new Error('Không tải được cài đặt giọng đọc.');
      const { tts, settings } = await response.json();
      if (pendingSaves || editingSpeed) return;
      speed.value = String(settings?.ttsSpeed || 1);
      displaySpeed(speed.value);
      const voices = tts?.voices || [];
      select.disabled = !tts?.ready || !voices.length;
      if (select.disabled) {
        status.textContent = 'Giọng đọc đang khởi động. Vui lòng chờ một chút.';
        return;
      }
      const values = ['default', ...voices];
      if (JSON.stringify([...select.options].map(o => o.value)) !== JSON.stringify(values)) {
        select.replaceChildren(...values.map(v => new Option(v === 'default' ? 'Mặc định (Hải Đăng)' : v, v)));
      }
      select.value = voices.includes(tts.voice) ? tts.voice : 'default';
      showSelection();
    } catch (error) { status.textContent = error.message; }
  }
  function save(params) {
    pendingSaves++;
    status.textContent = 'Đang lưu…';
    saveQueue = saveQueue.then(async () => {
      const response = await fetch('/rpc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'fishing.setSettings', params })
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error?.message || 'Không lưu được cài đặt.');
      showSelection();
    }).catch(error => { status.textContent = error.message; }).finally(() => { pendingSaves--; });
  }
  select.addEventListener('change', () => save({ ttsVoice: select.value }));
  speed.addEventListener('input', () => { editingSpeed = true; displaySpeed(speed.value); });
  speed.addEventListener('change', () => { editingSpeed = false; save({ ttsSpeed: Number(speed.value) }); });
  button.addEventListener('click', async () => {
    const text = panel.querySelector('#speechTestText').value.trim();
    if (!text) { status.textContent = 'Nhập nội dung để đọc thử.'; return; }
    button.disabled = true;
    button.textContent = 'Đang tạo…';
    preview.pause();
    try {
      const response = await fetch('/api/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: select.value })
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.url) throw new Error('Chưa tạo được giọng đọc. Vui lòng thử lại.');
      preview.src = data.url;
      displaySpeed(speed.value);
      try { await preview.play(); } catch (_) { status.textContent = 'Âm thanh đã sẵn sàng. Nhấn phát để nghe.'; }
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; button.textContent = '▶ Đọc thử'; }
  });
  refresh();
  setInterval(refresh, 3500);
})();
