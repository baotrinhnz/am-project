# Provision Pi cho venue mới

Tự cấu hình 1 Raspberry Pi mới cho 1 venue: WiFi, ACR music detection, device_id,
giờ mở cửa, timezone, hostname, và row trong Supabase `device_settings`.

## Chuẩn bị (1 lần)
Copy template secret và điền key thật (KHÔNG commit file này):
```bash
cp venue_secrets.env.example venue_secrets.env
nano venue_secrets.env     # điền Supabase + ACRCloud key
```
> Bỏ qua bước này cũng được — script sẽ tự hỏi từng key khi chạy.

## Chạy trên Pi mới
Copy cả thư mục `raspberry-pi/` (gồm `provision/` và `music_detector_auto.py`) lên Pi, rồi:
```bash
cd ~/raspberry-pi/provision     # nơi chứa script
bash provision_venue_pi.sh
```
Script sẽ hỏi: `DEVICE_ID`, display name (AM#), venue, hostname, temp comp,
timezone, **SSID/password WiFi quán**, và **giờ mở cửa từng ngày**.

## Sau khi chạy
- Gắn board Enviro+ → sensor mới có data.
- Mang Pi tới quán, bật lên → tự nối WiFi quán đã khai.
- Muốn screen sharing qua Pi Connect: `sudo raspi-config nonint do_boot_behaviour B4` rồi reboot.

## Script làm gì
1. Thêm WiFi quán (NetworkManager, autoconnect priority 10)
2. Ghi `~/.env` (ACR + Supabase + device_id + venue) và `~/enviro-monitor/.env`
3. Deploy `music_detector_auto.py` + patch `SCHEDULE` theo giờ quán
4. Bật `music-detector-auto`, TẮT `bpm-monitor` (ambience beat) & `music-recognition` (AudD)
5. Set timezone + hostname
6. Upsert `device_settings` (display_name, location=venue) trên Supabase
