(() => {
  const reset = document.getElementById('btnResetFishing');
  if (!reset) return;
  const panel = document.createElement('div');
  panel.style.cssText = 'margin:12px 0;display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px';
  panel.innerHTML = '<label for="catchRoundDelaySeconds">Thời gian mỗi lần câu được cá (giây)</label><input id="catchRoundDelaySeconds" type="number" min="1" max="60" step="1" value="15" style="width:75px;padding:8px"><button type="button" id="saveRoundDelay">Lưu thời gian</button><span id="roundDelayStatus" role="status"></span>';
  reset.insertAdjacentElement('afterend', panel);
  const input = panel.querySelector('input'), button = panel.querySelector('button'), status = panel.querySelector('[role=status]');
  button.className = reset.className;
  let saving = false, dirty = false;
  input.addEventListener('input', () => { dirty = true; });
  async function refresh() {
    if (saving || dirty || document.activeElement === input) return;
    try {
      const response = await fetch('/api/state');
      const state = await response.json();
      if (!saving && !dirty && document.activeElement !== input) input.value = state.settings?.catchRoundDelaySeconds ?? 15;
    } catch (_) {}
  }
  button.addEventListener('click', async () => {
    if (!input.reportValidity()) return;
    saving = true; button.disabled = true;
    try {
      const response = await fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({jsonrpc:'2.0', id:Date.now(), method:'fishing.setSettings', params:{catchRoundDelaySeconds:Number(input.value)}}) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error?.message || 'Không lưu được');
      dirty = false; status.textContent = 'Đã lưu. Chỉ tính thời gian chờ sau khi thông báo đóng.';
    } catch (error) { status.textContent = error.message; }
    finally { saving = false; button.disabled = false; }
  });
  refresh(); setInterval(refresh, 3500);
  input.addEventListener('change', () => { if (input.checkValidity()) button.click(); });
})();
