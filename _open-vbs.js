// Khoi dong server Ho Ca tach roi (qua wscript -> VBS -> sh.Run detached).
// Kieu nay song doc lap, khong bi kill khi task/turn ket thuc.
const { spawn } = require('child_process');
try {
  const c = spawn('wscript.exe', ['D:\\5 caucavancan\\Khoi-Dong-Lai-Server.vbs'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  c.unref();
  console.log('wscript spawned pid', c.pid);
} catch (e) {
  console.log('spawn error:', e.message);
}
