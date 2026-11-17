# HỒ CÂU CÁ ONLINE — BẢN CHUẨN

Cập nhật: 08/11/2026

---

## 1. PHÂN BIỆT HAI NÚT VÀ BẬT LIVE

- **`1 - BAT SERVER + MO HO CAU`**: dùng khi bắt đầu. Khởi động server V2, đợi server sẵn sàng rồi tự mở trang hồ trong Chrome riêng.
- **`2 - CHI MO TRANG HO CAU`**: chỉ mở lại trang hồ ở Chrome khi server đang chạy. Nút này không bật server và không tạo link HTTPS mới.

### Bật live
1. Bấm nút **1**, đợi trang hồ mở và link HTTPS hiện ra.
2. Bấm **Copy** cạnh link HTTPS, dán vào nguồn Link/Browser trong TikTok LIVE Studio.
3. Bấm **Go Live** trong TikTok LIVE Studio.
4. Quay lại trang hồ, bấm **Kết Nối** và đợi trạng thái kết nối.

Nếu chỉ đóng tab Chrome, bấm nút **2** để mở lại. Nếu server vừa khởi động lại, lấy link HTTPS mới và cập nhật trong TikTok LIVE Studio.

---

## 2. LUẬT CHƠI (số liệu chuẩn)

### Comment = vào danh sách câu
- Mỗi **6 giây** bốc 1 người
- Comment lần đầu → **100% trúng cá to** (tier 2–3)
- Comment liên tục trong 15 giây → **3 vé** thay vì 1 vé
- Trượt 3 lượt liên tiếp → **ép trúng** lượt sau
- 1 người tối đa thắng **2 lượt liên tiếp**

### Thả tim = ném thính
| Tim tích | Cá to thêm | Nâng độ hiếm |
|---|---|---|
| 100 | +20% | 18% |
| 250 | +50% | 45% |
| **500 (tối đa)** | **+100% (gấp đôi)** | **90%** |

Thính **dùng một lần rồi mất** — thả tim lại để tích tiếp.

### Quà tặng = cá to ngay
| Quà | Cá nhận |
|---|---|
| 1–30 xu | tier 3 (4,8–19,5 kg) |
| Trên 30 xu (dưới 100) | 50% tier 3 · 50% tier 4 |
| Săn Thủy Quái hoặc quà **≥ 100 xu** | 100% tier 4 (18–99,9 kg) |
| Follow / Chia sẻ | tier 2 hoặc 3 |

### Ghế ngồi
- **Top 10** theo kg → giữ ghế cố định
- **20 ghế xoay** → người vào live gần nhất
- Không tương tác **10 phút** → mất ghế
- **Hàng chờ** hiện trên màn hình (tính người tương tác 3 phút gần nhất)

> Người không có ghế **vẫn câu được cá** — ghế chỉ để tranh top.

---

## 3. GIỌNG ĐỌC

| Loại | Nội dung |
|---|---|
| Chúc mừng cá **> 5 kg** | 15 mẫu câu đa dạng, ưu tiên cao nhất |
| Chúc mừng cá **≤ 5 kg** | Câu ngắn 3–5 giây |
| Châm ngôn | Tự động mỗi 30 giây: 18 câu, xoay 12 giọng × 4 tốc độ (khoảng 2/3 lượt là châm ngôn, còn lại nhắc nhở/nhân vật) |
| Nhân vật | Mỗi 2 phút — ông cụ miền Trung, anh Tây, cô Mai Anh... |

**Chỉ 1 câu phát tại một thời điểm** trên mỗi màn hình; đóng tab thừa để tránh chồng tiếng.

---

## 4. ÂM THANH

- **Nhạc nền**: 5 bài piano không lời, âm lượng **30%**
- Tự hạ xuống 9% khi có giọng đọc
- **Còi**: 1 tiếng mỗi lần, âm lượng nhỏ
- Ghi nguồn vào mô tả video: *Music: Kevin MacLeod (incompetech.com) — CC BY 4.0*

---

## 5. HIỆU ỨNG HÌNH ẢNH

Cá từ **10 kg** trở lên có hiệu ứng, to dần theo cân nặng:

| Kg | Vòng sóng | Thời gian |
|---|---|---|
| 10 | 140px | 1,0s |
| 30 | 205px | 1,3s |
| 50 | 270px | 1,6s |
| 90+ | 400px | 2,1s |

Màu chuyển từ vàng → đỏ cam khi cá to hơn.

---

## 6. BẢNG XẾP HẠNG

Tự xoay 2 chế độ mỗi 12 giây:
- 👑 **Vua Sát Cá** — xếp theo tổng kg
- 🎁 **Top Quà Tặng** — xếp theo xu

Reset tự động mỗi **60 phút** — xóa cả kg lẫn xu quà để 2 bảng sạch.

---

## 7. BẢO MẬT

| Lớp | Trạng thái |
|---|---|
| LAN / WiFi | Chặn — chỉ 127.0.0.1 |
| `/admin*` từ internet | 403 |
| `/rpc` từ internet | 403 |
| `/api/tts` từ internet | 403 |
| Trang quản trị | PIN **854710** |
| Micro | Tắt `Mic/Aux` trong OBS (không phải toàn Windows) |

Người ngoài chỉ **xem được hình**, không điều khiển được gì.

---

## 8. SỰ CỐ THƯỜNG GẶP

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| Không ai câu được cá | App chưa kết nối TikTok | Nhắn "live rồi" |
| `Rate Limited` | Mở lại app quá nhiều lần trong 1 giờ | Chờ ~1 giờ, đừng restart |
| Link không vào được | Tunnel chưa sẵn sàng | Chờ 30 giây, hoặc nhắn "link mới" |
| Giọng đọc chồng nhau | 2 tab cùng mở | Đóng tab Chrome, chỉ để LIVE Studio |
| Trang hiện bản cũ | Cache | Chờ 15 giây, trang tự tải lại |
| Châm ngôn không đọc | App vừa mở, chưa vào live | Chờ kết nối TikTok; autopilot tự chạy khi có người xem |

---

## 9. QUY TẮC VÀNG

> **Gom hết thay đổi → sửa một lần → restart một lần.**
>
> Mỗi lần restart vừa đổi link HTTPS, vừa **tiêu một lượt quota kết nối TikTok**.
> Restart quá nhiều trong 1 giờ sẽ bị chặn 1 giờ.
>
> 💾 Restart **không còn xóa** điểm/BXH. Đồng hồ reset 60 phút sẽ đếm lại từ lúc mở app.
> File dữ liệu: `CauCaOnline\_internal\app\data\fishing-state.json` — copy file này để backup.

