(() => {
  const button = document.getElementById('btnResetFishing');
  if (!button) return;
  button.addEventListener('click', async () => {
    if (!window.confirm('Xóa toàn bộ người câu, cá, điểm, bảng xếp hạng và nhóm dự câu? Giả lập sẽ dừng. Cài đặt giọng đọc được giữ lại.')) return;
    button.disabled = true;
    try {
      const response = await fetch('/rpc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'fishing.resetState', params: {} })
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error?.message || 'Không thể reset hồ câu');
      window.location.reload();
    } catch (error) {
      window.alert(error.message);
      button.disabled = false;
    }
  });
})();
