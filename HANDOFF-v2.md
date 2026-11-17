# HANDOFF — CauCaOnline v2 (tài liệu bàn giao cho AI/dev tiếp theo)

> Cập nhật: 09/11/2026. Đọc hết file này trước khi sửa. Brief thiết kế gốc: `C:\Users\annoy\Downloads\brief-caucaonline-v2.md` (đã được đính chính). File này ghi lại **thực trạng code + việc đã làm + việc còn lại**.

---

## 1. Bối cảnh & mục tiêu
- Game: **TikTok LIVE câu cá** (`cau ca chill`), tài khoản **eggvn2007**.
- Người xem **vào live hoặc comment** là tự động vào danh sách câu → hệ thống bốc ngẫu nhiên → lật thẻ cá → đọc chúc mừng → BXH.
- **Tài khoản đã bị nhiều vi phạm**: 7 hạn chế trước đó + "tương tác giả/lừa lọc" (08/11) + "Nội dung sao chép" (09/11, trừ 1 điểm uy tín). → **Ưu tiên số 1 là AN TOÀN POLICY**, sau đó mới tới tính năng.
- Có **2 bản chạy**:
  - `D:\5 caucavancan\CauCaOnline` = **bản chính** (ổn định, dùng cho live thật). **KHÔNG sửa bản này.**
  - `D:\5 caucavancan\CauCaOnline-v2` = **bản dev** (mình đang làm). Chạy song song được (dùng chung model/deps qua junction).

## 2. Kiến trúc
| Thành phần | Vai trò |
|---|---|
| `_internal/app/server.js` (~2800 dòng) | Server chính: kết nối TikTok (`tiktok-live-connector`), vòng câu, TTS (`vieneuTts` → `tts_worker.exe`), JSON-RPC `/rpc`, WebSocket `/ws`, tunnel Cloudflare. |
| `live-autopilot.js` (thư mục gốc `D:\5 caucavancan`) | Process riêng: mỗi 30s đọc châm ngôn/câu hỏi/BXH qua RPC `fishing.speak`. **Server tự spawn khi boot.** |
| `live-coordinator.js` | Process riêng (nhắc nhở). Không tự spawn (tùy chọn). |
| `public/index.html` | Khung 9:16 (1080×1920) + HUD. |
| `public/js/live.js` | Logic chính client: WebSocket, render BXH, nút bấm, connect TikTok. |
| `public/js/audio.js` | Nhạc nền (5 MP3), TTS playback, ducking (hạ nhạc khi đọc). |
| `public/js/pond-scene.js` | Vẽ 30 ghế quanh hồ oval. |
| `lib/pond-seating.js`, `lib/comment-fishing.js`, `lib/catch-round-clock.js` | Ghế ngồi / danh sách câu / nhịp vòng. |

- **Junction** (Windows): `CauCaOnline-v2/_internal/app/{node_modules,runtime,tts}` trỏ về bản chính → v2 nhẹ (~96MB), không copy 1GB model.
- v2 có `data/` **riêng** (state tách biệt).

## 3. Quy trình vận hành chuẩn (đã chốt với user)
1. Mở livestream TikTok.
2. Bật app: double-click **`Chay-CauCa-V2.bat`** trên Desktop (`C:\Users\annoy\OneDrive\Desktop`). File này tự tắt server cũ ở cổng 3001 rồi chạy v2.
3. App gen **link HTTPS** (Cloudflare tunnel) → user copy vào **OBS browser source**.
4. Nhập `@eggvn2007` → bấm **Kết nối**.
5. → **Tự chạy hết**: autopilot đọc, vòng câu + chúc mừng (giọng Adam bựa), nhạc nền. (SFX sắp có.)

## 4. ĐÃ LÀM (thực trạng code)

### 4.1. An toàn policy (quan trọng nhất)
- **`live-coordinator.js`**: đã **viết lại toàn bộ MESSAGES** — bỏ hết câu "comment/follow/quà → cá". Giờ chỉ nói về không khí hồ + luật chơi.
- **`server.js` handler LIKE**: **bỏ `addLikeBait`** (thả tim KHÔNG còn cộng "thính"/làm cá to). Chỉ còn tiếng còi (cosmetic).
- **`server.js` handler FOLLOW/SHARE (`handleSocialEvent`)**: **bỏ `notePremium`** (follow/share KHÔNG còn đặt trước cá xịn). Chỉ ghi nhận.
- **Quà tặng**: chỉ cảm ơn, KHÔNG cho cá (giữ nguyên từ trước).

### 4.2. TTS / giọng đọc
- **Hàng đợi TTS tập trung** (`playTts` / `_pumpTts` trong server.js): chỉ 1 audio phát 1 lúc. Mọi nguồn (vòng câu, châm ngôn, autopilot, RPC speak) đều đi qua.
- **Giọng chúc mừng = `Adam bựa`** (`pickCatchVoice`).
- **Kho câu theo hạng cân** (trong server.js):
  - `TINY_FISH_SARCASM` (~22) — cá <1kg (châm biếm).
  - `FUN_FISH_LINES` (~22) — cá 1–5kg (vui vẻ).
  - `ADAM_BUA_LINES` (~30) + `CATCH_CONGRATS` (~31) — cá ≥5kg (bựa/khen).
  - `MEGA_FISH_LINES` (~15) — cá ≥30kg (hoành tráng).
  - `NONFISH_TEASE_LINES` (8) — rác/bình gốm/xu/rương → **luôn chê**.
- **`buildLine`**: chia theo cân nặng; `isNonFishItem()` nhận diện đồ không phải cá.
- **Pre-gen trước khi lật thẻ**: tổng hợp sẵn câu thẻ đầu + cuối (+ cá >40kg) TRƯỚC `roundReveal`; chỉ `await` câu thẻ ĐẦU để giảm delay (engine ~5s/câu).
- **Đọc thẻ**: thẻ ĐẦU TIÊN + thẻ CUỐI CÙNG; nếu có cá >40kg chưa nằm trong 2 thẻ đó thì đọc thêm.

### 4.3. BXH / cảm ơn / ghế
- **`live-autopilot.js` PERSONAL mode**: chỉ đọc người **`active`** (đang có mặt); fallback `seatedAnglers`; nếu top 0kg → đọc châm ngôn (tránh "0 ký").
- **Cảm ơn quà 1 lần** (`giftThanksCooldown` trong handler GIFT, server.js): quà combo chỉ đọc cảm ơn 1 lần/15s, vẫn cộng đủ xu.
- **Thời gian giữ ghế**: `state.settings.seatIdleMinutes = 1` (đã set qua RPC, lưu bền). Ai không tương tác 1 phút → mất ghế.

### 4.4. UI mobile-safe
- **BXH dời từ đáy lên GÓC PHẢI TRÊN** (`.hud-right-leaderboard` position absolute top:100 right:20 width:320, trong `pond-scene.css`). Tránh bị TikTok che đáy.
- **Bỏ 3 thẻ "quà"** (HỒ CÂU/CẦN THỦ/THƯ GIÃN) ở đáy (bị che + trông như kêu gọi quà).
- **Ẩn khung hướng dẫn to** giữa hồ (`.pinned-guide { display:none }`).
- **Hồ giữ nguyên kích thước** (đã thử thu nhỏ nhưng bị "seam" xấu → revert).

### 4.5. v2
- **`doConnectTikTok`** (v2 live.js): kết nối xong → **tự bật âm thanh + nhạc + TTS** (nếu là nguồn phát) → "bấm Kết nối là mọi thứ tự chạy".
- Launcher `Chay-CauCa-V2.bat` (v2 + Desktop).
- BUILD cache-bust: v2 = `2026-11-09-v2a`.

## 5. CHƯA LÀM / ROADMAP (ưu tiên giảm dần)
1. **SFX** (sắp có) — thêm hiệu ứng âm thanh (cá quẫy, chuông, còi...) qua `audio.js`.
2. **Thời tiết + cá đột biến** (kiểu Grow a Garden): mưa/sét/cầu vồng, cá Ướt/Sốc điện/Cầu vồng x2–x25 giá. Tạo biến thiên chống "nội dung lặp".
3. **Kinh tế cá**: câu → bán tự động ra xu → cộng `totalRevenue` → **BXH doanh thu** (3 BXH luân phiên: số lượng / kg / doanh thu). Bỏ hẳn BXH quà.
4. **Ghế avatar thật** + layout mobile-safe hơn (avatar thay chấm số).
5. **Trạng thái Pause** rõ ràng (khi host vắng → dừng nhận lệnh, hiện màn tạm dừng).
6. **Gộp autopilot + coordinator vào server** (1 process duy nhất) nếu muốn "1 cái chạy hết" triệt để.
7. **SFX/âm thanh khi cá lớn** + hiệu ứng.

## 6. RỦI RO POLICY — BẮT BUỘC tuân thủ
- **Host phải CÓ MẶT + facecam + nói liên tục**. Vắng mặt → **Pause LIVE**. Đây là lỗi bị phạt 09/11 (treo máy).
- **Không** gắn like/comment/quà với kết quả/thưởng (cả chữ trên màn hình LẪN lời đọc).
- **Không** BXH quà / vinh danh theo quà.
- **Không** tín hiệu hiện diện giả (giọng AI lặp làm host duy nhất).
- **Không** QR/link/thông tin nền tảng thứ ba trên màn hình.
- **Không** tài khoản phụ / tool mồi phòng.

## 7. File & tham số quan trọng
- Server: `CauCaOnline-v2/_internal/app/server.js` — sửa ở đây (v2).
- Autopilot: `D:\5 caucavancan\live-autopilot.js` (dùng chung cho cả 2 bản! vì server spawn từ `../../../live-autopilot.js`).
- Coordinator: `D:\5 caucavancan\live-coordinator.js`.
- Client v2: `CauCaOnline-v2/_internal/app/public/{index.html, js/live.js, js/audio.js, js/pond-scene.js, css/*}`.
- State: `CauCaOnline-v2/_internal/app/data/fishing-state.json`.
- Backup an toàn: `D:\5 caucavancan\backup-20261109-155325\` (bản trước khi sửa nhiều).

## 8. Chạy / test
- Chạy v2: double-click `Chay-CauCa-V2.bat` (Desktop) → mở `http://localhost:3001`.
- Chạy trực tiếp (dev): `cd CauCaOnline-v2/_internal/app && ./runtime/node.exe server.js` (cổng mặc định 3001; đổi bằng env `PORT`).
- Kiểm tra nhanh: `curl -s -X POST http://127.0.0.1:3001/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tts.status","params":{}}'`.
- **Lưu ý**: `live-autopilot.js` hardcode cổng **3001**. Nếu chạy v2 ở cổng khác thì phải sửa cổng trong autopilot.

## 9. Quy tắc làm việc (user yêu cầu)
- KHÔNG đoán API/đường dẫn — đọc source thật trước.
- Sửa từng việc nhỏ, không gộp.
- Cần user "OK" trước khi xóa/ghi đè file.
- Comment trong code viết tiếng Việt.
- **Làm trên bản v2**, giữ bản chính an toàn.
