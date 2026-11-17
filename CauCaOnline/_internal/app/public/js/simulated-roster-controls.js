(() => {
  const select = document.getElementById('rpcSimulatedAngler');
  if (!select) return;
  const count = document.getElementById('simulatedCount');
  let saving = false, dirty = false;
  const status = document.createElement('small');
  status.setAttribute('role','status');
  count?.insertAdjacentElement('afterend',status);
  count?.addEventListener('input',()=>{dirty=true;});
  count?.addEventListener('change',async()=>{
    if (!count.reportValidity()) return;
    const value = Number(count.value);
    saving=true;
    try {
      const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method:'fishing.setSettings',params:{simulatedCreateCount:value}})});
      const data=await response.json();
      if(!response.ok || data.error) throw new Error(data.error?.message || 'Không lưu được');
      if(Number(count.value)===value) dirty=false;
      status.textContent='Đã tự lưu số người tạo.';
    } catch(error) {status.textContent=error.message;}
    finally {saving=false;}
  });
  let roster = [];
  function update(state) {
    if(count && !saving && !dirty && document.activeElement!==count) count.value=state.settings?.simulatedCreateCount ?? 5;
    roster = (state.seatedAnglers || []).filter(p => p.isSimulated || String(p.uniqueId).startsWith('sim:'));
    const previous = select.value;
    const signature = JSON.stringify(roster.map(p => [p.uniqueId,p.name,p.seatIndex]));
    if (select.dataset.roster === signature) return;
    select.dataset.roster = signature;
    select.replaceChildren(new Option('Tạo / dùng tên nhập bên trên', ''));
    for (const person of roster) select.add(new Option(`${person.name} · Ghế ${person.seatIndex + 1}`, person.uniqueId));
    select.value = roster.some(p => p.uniqueId === previous) ? previous : '';
  }
  async function refresh() {
    try { update(await (await fetch('/api/state')).json()); } catch (_) {}
  }
  window.FishingSimulationControls = { update, selected: () => roster.find(p => p.uniqueId === select.value) || null };
  refresh(); setInterval(refresh, 2000);
})();
