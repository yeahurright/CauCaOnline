(() => {
  const select = document.getElementById('simCatchVoice');
  const status = document.getElementById('simCatchVoiceStatus');
  if (!select) return;
  let saving = false;
  const descriptions = {
    large: 'Chỉ chúc mừng người giả lập khi cá từ 5 kg trở lên.',
    off: 'Tắt lời chúc mừng của người giả lập.',
    all: 'Chúc mừng cá tier 2 trở lên của người giả lập; tier 1 chỉ hiện thông báo.'
  };
  async function refresh() {
    if (saving || document.activeElement === select) return;
    try {
      const response = await fetch('/api/state');
      if (!response.ok) throw new Error('Không tải được cài đặt.');
      const state = await response.json();
      if (saving || document.activeElement === select) return;
      select.value = state.settings?.simCatchVoice || 'all';
      status.textContent = descriptions[select.value];
    } catch (error) { status.textContent = error.message; }
  }
  select.addEventListener('change', async () => {
    saving = true;
    select.disabled = true;
    status.textContent = 'Đang lưu…';
    try {
      const response = await fetch('/rpc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'fishing.setSettings', params: { simCatchVoice: select.value } })
      });
      const reply = await response.json();
      if (!response.ok || reply.error) throw new Error(reply.error?.message || 'Không lưu được cài đặt.');
      status.textContent = `${descriptions[select.value]} Đã lưu.`;
    } catch (error) { status.textContent = error.message; }
    finally { saving = false; select.disabled = false; }
  });
  refresh();
  setInterval(refresh, 3500);
})();
