(() => {
  const reset = document.getElementById('btnResetFishing');
  if (!reset) return;
  const panel = document.createElement('div');
  panel.style.cssText = 'margin:12px 0;display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px';
  panel.innerHTML = `
    <label for="catchRoundDelaySeconds">Thời gian mỗi lần câu được cá (giây)</label>
    <input id="catchRoundDelaySeconds" type="number" min="1" max="60" step="1" value="15" required style="width:75px;padding:8px">
    <label for="giftVideoDelaySeconds">Độ trễ video LIVE cho lời cảm ơn quà (giây)</label>
    <input id="giftVideoDelaySeconds" type="number" min="0" max="120" step="0.1" value="0" required style="width:75px;padding:8px">
    <button type="button" id="saveRoundDelay">Lưu thời gian</button>
    <span id="roundDelayStatus" role="status"></span>`;
  reset.insertAdjacentElement('afterend', panel);
  const inputs = [...panel.querySelectorAll('input')];
  const button = panel.querySelector('button'), status = panel.querySelector('[role=status]');
  button.className = reset.className;
  let saving = false, dirty = false;
  for (const input of inputs) input.addEventListener('input', () => { dirty = true; });
  async function refresh() {
    if (saving || dirty || inputs.includes(document.activeElement)) return;
    try {
      const response = await fetch('/api/state');
      const state = await response.json();
      if (saving || dirty || inputs.includes(document.activeElement)) return;
      for (const input of inputs) input.value = state.settings?.[input.id] ?? input.defaultValue;
    } catch (_) {}
  }
  button.addEventListener('click', async () => {
    if (!inputs.every(input => input.reportValidity())) return;
    saving = true; button.disabled = true;
    try {
      const response = await fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({jsonrpc:'2.0', id:Date.now(), method:'fishing.setSettings',
          params:Object.fromEntries(inputs.map(input => [input.id, input.valueAsNumber]))}) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error?.message || 'Không lưu được');
      dirty = false; status.textContent = 'Đã lưu thời gian câu và độ trễ cảm ơn quà.';
    } catch (error) { status.textContent = error.message; }
    finally { saving = false; button.disabled = false; }
  });
  refresh(); setInterval(refresh, 3500);
  for (const input of inputs) input.addEventListener('change', () => { if (input.checkValidity()) button.click(); });

  const closeButton = document.getElementById('btnClosePond');
  const demoButton = document.getElementById('btnDemoSaleRound');
  const closeStatus = document.getElementById('closePondStatus');
  if (!closeButton || !demoButton || !closeStatus) return;
  async function runRound(method, isClosing) {
    closeButton.disabled = true;
    demoButton.disabled = true;
    closeStatus.textContent = isClosing ? 'Đang chốt hồ, chờ lời chào cuối…' : 'Đang chạy lượt bán cá mẫu…';
    try {
      const response = await fetch('/rpc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method })
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error?.message || 'Không chạy được lượt câu.');
      closeStatus.textContent = isClosing
        ? `Đã chốt hồ với ${data.result.count} thẻ. Đã phát lời chào cuối.`
        : `Đã lật ${data.result.count} thẻ. Xem xèng trên thẻ cá và BXH doanh thu.`;
      closeButton.disabled = isClosing;
      demoButton.disabled = isClosing;
    } catch (error) {
      closeStatus.textContent = error.message;
      const state = await fetch('/api/state').then(response => response.json()).catch(() => null);
      closeButton.disabled = Boolean(state && state.closingPhase !== 'open');
      demoButton.disabled = closeButton.disabled;
    }
  }
  closeButton.addEventListener('click', () => runRound('fishing.closePond', true));
  demoButton.addEventListener('click', () => runRound('fishing.demoSaleRound', false));
})();
