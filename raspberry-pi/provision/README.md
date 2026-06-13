# Provision Pi cho venue mới

Tự cấu hình 1 Raspberry Pi mới cho 1 venue: WiFi, ACR music detection, device_id,
giờ mở cửa, timezone, hostname, screen sharing, và row trong Supabase `device_settings`.

---

## Bước 1 — Chuẩn bị secret (chỉ làm 1 lần)

Copy template và điền key thật (file `venue_secrets.env` đã được `.gitignore`, KHÔNG commit):

```bash
cd raspberry-pi/provision
cp venue_secrets.env.example venue_secrets.env
nano venue_secrets.env      # điền Supabase + ACRCloud key
```

> Bỏ qua bước này cũng được — khi chạy, script sẽ tự hỏi từng key.

## Bước 2 — Đưa file lên Pi mới

Cách A — clone repo trên Pi (khuyên dùng, line-ending chuẩn LF):
```bash
git clone <repo-url> ~/am-project
cp ~/am-project/raspberry-pi/provision/venue_secrets.env ~/am-project/raspberry-pi/provision/ 2>/dev/null || true
cd ~/am-project/raspberry-pi/provision
```

Cách B — scp từ máy Windows (nhớ copy cả `music_detector_auto.py` ở thư mục cha):
```powershell
scp -i $env:USERPROFILE\.ssh\am_pi -r C:\AM\raspberry-pi am@<IP-Pi>:/home/am/
```
rồi trên Pi: `cd ~/raspberry-pi/provision`

## Bước 3 — Chạy script

```bash
bash provision_venue_pi.sh
```

Script sẽ hỏi lần lượt:

| Mục | Ví dụ |
|---|---|
| DEVICE_ID | `rpi-robbies-01` |
| Display name | `AM4` |
| Venue name | `Robbies Bar` |
| Location trong venue | `Main Bar` (có thể bỏ trống) |
| Hostname | `rosie1` |
| Temp compensation factor | `2.25` (Enter = mặc định) |
| Timezone | `Pacific/Auckland` (Enter = mặc định) |
| Bật screen sharing? | `y` / `N` |
| WiFi SSID + Password quán | `ENZO` / `••••` |
| Giờ mở cửa từng ngày (Mon→Sun) | nhập `open close`, vd `9 22`; để trống = đóng |

Có màn **xác nhận** trước khi áp dụng. Script sẽ hỏi mật khẩu `sudo` khi cần.

## Sau khi chạy

- **Gắn board Enviro+** → sensor mới có data (lỗi I2C nếu chưa gắn là bình thường).
- Mang Pi tới quán, bật lên → tự nối WiFi quán đã khai.
- Nếu chọn bật screen sharing: script cài `rpi-connect` full + Desktop Autologin và hỏi **reboot**.
  Sau reboot, nếu Pi Connect báo chưa đăng nhập thì chạy `rpi-connect signin` (mở link liên kết tài khoản).

## Kiểm tra nhanh

```bash
systemctl is-active music-detector-auto enviro-monitor   # active
systemctl is-active bpm-monitor music-recognition        # inactive (đã tắt)
tail -f ~/AM_logs/music_detector_auto/music_detector_auto.log
```

---

## Script làm gì

1. Thêm WiFi quán (NetworkManager, autoconnect priority 10)
2. Ghi `~/.env` (ACR + Supabase + device_id + venue) và `~/enviro-monitor/.env`
3. Deploy `music_detector_auto.py` + patch `SCHEDULE` theo giờ quán
4. Bật `music-detector-auto`, TẮT `bpm-monitor` (ambience beat) & `music-recognition` (AudD)
5. Set timezone + hostname
6. Upsert `device_settings` (display_name, location=venue) trên Supabase
7. (tùy chọn) Screen sharing: `rpi-connect` full + Desktop Autologin + reboot

Secret KHÔNG nhúng trong script — đọc theo thứ tự: `venue_secrets.env` → `~/.env` sẵn có → hỏi.
