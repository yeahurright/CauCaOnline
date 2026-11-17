(() => {
  const anchor = document.getElementById('btnResetFishing');
  if (!anchor) return;
  const panel = document.createElement('div');
  panel.style.cssText = 'margin:12px 0;display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px';
  panel.innerHTML = '<label for="leaderboardResetMinutes">Tự reset bảng xếp hạng (phút)</label><input id="leaderboardResetMinutes" type="number" min="1" max="1440" step="1" value="60" style="width:80px;padding:8px"><button id="saveLeaderboardReset" type="button">Lưu thời gian reset</button><strong class="leaderboard-countdown"></strong><span id="leaderboardResetStatus" role="status"></span>';
  anchor.insertAdjacentElement('afterend', panel);
  const input=panel.querySelector('input'), button=panel.querySelector('button'), status=panel.querySelector('[role=status]');
  button.className=anchor.className;
  const header=document.querySelector('.hud-lb-header');
  if(header) header.insertAdjacentHTML('afterend','<div class="leaderboard-countdown" style="color:#fff3a4;font-size:19px;font-weight:700"></div>');
  let deadline=0, offset=0, dirty=false, saving=false;
  function update(state) {
    if (state.leaderboardResetAt) deadline=state.leaderboardResetAt;
    if (state.serverNow) offset=state.serverNow-Date.now();
    if (!dirty && !saving && document.activeElement!==input) input.value=state.settings?.leaderboardResetMinutes ?? 60;
    tick();
  }
  function tick() {
    const seconds=Math.max(0,Math.ceil((deadline-Date.now()-offset)/1000));
    const text=deadline ? `Reset sau ${[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(v=>String(v).padStart(2,'0')).join(':')}` : 'Đang tải đếm ngược…';
    document.querySelectorAll('.leaderboard-countdown').forEach(el=>el.textContent=text);
  }
  async function refresh() { try { update(await (await fetch('/api/state')).json()); } catch (_) {} }
  input.addEventListener('input',()=>{dirty=true;});
  button.addEventListener('click',async()=>{
    if(!input.reportValidity()) return;
    saving=true;button.disabled=true;
    try {
      const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method:'fishing.setSettings',params:{leaderboardResetMinutes:Number(input.value)}})});
      const data=await response.json();
      if(!response.ok||data.error) throw new Error(data.error?.message||'Không lưu được');
      dirty=false;update(data.result);status.textContent='Đã lưu, bắt đầu đếm lại từ thời gian mới.';
    } catch(error) {status.textContent=error.message;}
    finally {saving=false;button.disabled=false;}
  });
  let bannerTimer;
  window.addEventListener('fishing-leaderboard-reset',()=>{
    let banner=document.getElementById('leaderboardResetNotice');
    const frame=document.querySelector('.catch-modal-overlay')?.parentElement;
    if(!banner && frame) {
      banner=document.createElement('div');banner.id='leaderboardResetNotice';banner.setAttribute('role','status');
      banner.style.cssText='position:absolute;left:90px;right:90px;top:44%;z-index:60;padding:28px;border:3px solid #ffd455;border-radius:22px;background:#082b2af5;color:#fff3a4;text-align:center;font:bold 30px/1.5 sans-serif';
      frame.appendChild(banner);
    }
    if(banner) {banner.textContent='⏱ HẾT GIỜ — BẢNG XẾP HẠNG ĐÃ RESET. BẮT ĐẦU VÒNG MỚI!';banner.hidden=false;clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>{banner.hidden=true;},8000);}
    status.textContent='Bảng xếp hạng đã reset. Vòng mới bắt đầu.';refresh();
  });
  window.addEventListener('fishing-public-state',event=>update(event.detail));
  refresh();setInterval(refresh,5000);setInterval(tick,1000);
  input.addEventListener('change',()=>{if(input.checkValidity()) button.click();});
})();
