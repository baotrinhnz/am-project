# Music Recognise — Architecture

> Last updated: 2026-03-16

---

## Diagram tổng thể

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    Next.js Dashboard (Vercel)                        │  │
│   │                                                                      │  │
│   │  page.js                                                             │  │
│   │  ┌──────────────────┐    click     ┌────────────────────────────┐   │  │
│   │  │ 🎵 Music          │ ──────────▶  │  MusicDetections.js        │   │  │
│   │  │  Recognise button │             │  (history panel)            │   │  │
│   │  └──────────────────┘             │                              │   │  │
│   │                                   │  ┌──────────────────────┐    │   │  │
│   │                                   │  │ 🎤 Listen Now button  │    │   │  │
│   │                                   │  └──────────┬───────────┘    │   │  │
│   │                                   └─────────────┼────────────────┘   │  │
│   │                                                 │ open modal          │  │
│   │                                                 ▼                     │  │
│   │                              ┌──────────────────────────────────┐    │  │
│   │                              │  MusicListeningModalNew.js       │    │  │
│   │                              │                                   │    │  │
│   │                              │  [Device selector]                │    │  │
│   │                              │  idle → listening → thinking      │    │  │
│   │                              │         → success / error         │    │  │
│   │                              └───────────────┬──────────────────┘    │  │
│   │                                              │ POST /api/detect-music │  │
│   │                                              ▼                        │  │
│   │                              ┌──────────────────────────────────┐    │  │
│   │                              │  /api/detect-music/route.js      │    │  │
│   │                              │  (Next.js Server Route)          │    │  │
│   │                              │                                   │    │  │
│   │                              │  1. INSERT device_commands        │    │  │
│   │                              │  2. Poll status (max 30s)         │    │  │
│   │                              │  3. Return song / error           │    │  │
│   │                              └───────────────┬──────────────────┘    │  │
│   └──────────────────────────────────────────────┼────────────────────────┘  │
└──────────────────────────────────────────────────┼─────────────────────────┘
                                                   │
                              ┌────────────────────┴──────────────────────┐
                              │              SUPABASE (Cloud DB)           │
                              │                                            │
                              │   ┌──────────────────┐                    │
                              │   │  device_commands  │  ◀── INSERT        │
                              │   │  ─────────────── │     (dashboard)    │
                              │   │  id               │                    │
                              │   │  device_id        │  ──▶ SELECT        │
                              │   │  command          │     (Pi polls)     │
                              │   │  status           │                    │
                              │   │  result           │  ◀── UPDATE        │
                              │   │  created_at       │     (Pi writes)    │
                              │   └──────────────────┘                    │
                              │                                            │
                              │   ┌──────────────────┐                    │
                              │   │ music_detections  │  ◀── INSERT        │
                              │   │  ─────────────── │     (Pi writes)    │
                              │   │  device_id        │                    │
                              │   │  title / artist   │  ──▶ SELECT        │
                              │   │  album            │     (dashboard     │
                              │   │  spotify_url      │      history)      │
                              │   │  detected_at      │                    │
                              │   └──────────────────┘                    │
                              └────────────────────┬──────────────────────┘
                                                   │
                              ┌────────────────────┴──────────────────────┐
                              │         RASPBERRY PI 4B + Enviro+          │
                              │                                            │
                              │  music_manual_trigger_rotation.py          │
                              │  ┌────────────────────────────────────┐   │
                              │  │  Main loop (poll every 2s)          │   │
                              │  │                                     │   │
                              │  │  SELECT pending commands            │   │
                              │  │       │                             │   │
                              │  │       ▼ found                       │   │
                              │  │  UPDATE status → "processing"       │   │
                              │  │       │                             │   │
                              │  │       ▼                             │   │
                              │  │  music_recognizer_with_rotation.py  │   │
                              │  │  ┌───────────────────────────────┐  │   │
                              │  │  │ _find_mems_device()           │  │   │
                              │  │  │   arecord -l → find adau7002  │  │   │
                              │  │  │   → plughw:2,0                │  │   │
                              │  │  │                               │  │   │
                              │  │  │ record_audio_mems()           │  │   │
                              │  │  │   arecord S16_LE mono 48kHz   │  │   │
                              │  │  │   duration: 10s               │  │   │
                              │  │  │   → music_recordXXX.wav       │  │   │
                              │  │  │                               │  │   │
                              │  │  │ recognize_music()             │  │   │
                              │  │  │   check file size > 0         │  │   │
                              │  │  │   POST multipart WAV          │  │   │
                              │  │  └───────────┬───────────────────┘  │   │
                              │  │              │                       │   │
                              │  │              ▼                       │   │
                              │  │  INSERT music_detections             │   │
                              │  │  UPDATE status → "completed"/"failed"│   │
                              │  └────────────────────────────────────┘   │
                              │                                            │
                              │  Hardware: MEMS mic ICS-43434 (adau7002)   │
                              │  Audio: ALSA plughw (kernel format conv)   │
                              │  Storage: ~/Music_for_delete/ (max 10 WAV) │
                              │  Service: music-recognition.service        │
                              │           (systemd, enabled, auto-start)   │
                              └────────────────────────────────────────────┘
```

---

## Tổng quan luồng

```
User (Dashboard)
    │
    │  Click "Listen Now"
    ▼
[Next.js API]  POST /api/detect-music
    │
    │  INSERT command {status: "pending"}
    ▼
[Supabase]  device_commands table
    │
    │  Poll every 2s
    ▼
[Raspberry Pi]  music_manual_trigger_rotation.py
    │
    │  record 10s WAV
    ▼
[ALSA / MEMS mic]  adau7002 → plughw:2,0
    │
    │  upload WAV (multipart)
    ▼
[AudD API]  api.audd.io
    │
    │  song data
    ▼
[Supabase]  music_detections table
    │
    │  UPDATE command {status: "completed"}
    ▼
[Next.js API]  poll → return result
    │
    ▼
[Dashboard]  hiển thị tên bài / Spotify / Apple Music
```

---

## Folder Tree

```
c:\AM\
├── raspberry-pi/                          # Code chạy trên Pi
│   ├── music_recognizer_with_rotation.py  # Module nhận diện nhạc
│   ├── music_manual_trigger_rotation.py   # Service chính (systemd entry point)
│   ├── music-recognition.service          # systemd unit file
│   ├── setup_music_autostart.sh           # Script cài & enable service lần đầu
│   ├── .env                               # Credentials (không commit)
│   └── requirements.txt                   # Python dependencies
│
├── dashboard/                             # Next.js web app (Vercel)
│   ├── app/
│   │   ├── page.js                        # Main dashboard, chứa "Music Recognise" button
│   │   └── api/
│   │       └── detect-music/
│   │           └── route.js              # API endpoint trigger detection
│   └── components/
│       ├── MusicDetections.js            # Panel lịch sử nhạc đã detect
│       └── MusicListeningModalNew.js     # Modal animation + device selector + status
│
└── documentation/
    └── Music_Recognise_Architecture.md   # File này
```

---

## Vai trò từng file

### Raspberry Pi

#### `music_recognizer_with_rotation.py`
Module core xử lý audio và gọi AudD API.

**Chức năng chính:**
- `_find_mems_device()` — tìm MEMS mic theo tên device (`adau7002`) trong output của `arecord -l`, trả về `plughw:X,Y`. Không hardcode card number để tránh bị mất device sau reboot.
- `record_audio_mems()` — gọi `arecord` với `plughw`, format S16_LE mono 48kHz, ghi thẳng ra file WAV cuối (không qua temp file). Không cần convert Python.
- `recognize_music(audio_file)` — kiểm tra file size trước (báo lỗi nếu = 0), upload WAV lên AudD API bằng multipart, parse kết quả.
- `get_next_filename()` — quản lý rotation: giữ tối đa 10 file WAV trong `~/Music_for_delete/`, xóa file cũ nhất khi đầy.

**Ghi chú kỹ thuật:**
- Dùng `plughw` thay vì `hw` → ALSA tự xử lý format conversion ở kernel level
- Upload multipart (`files={'file': f}`) thay vì base64 → nhỏ hơn, đúng chuẩn AudD REST

---

#### `music_manual_trigger_rotation.py`
Service entry point, chạy liên tục, lắng nghe lệnh từ Supabase.

**Chức năng chính:**
- Khởi tạo kết nối Supabase và `MusicRecognizer`
- `poll_for_commands()` — query `device_commands` table tìm record `status=pending` của device này
- `process_command(command)` — xử lý lệnh `detect_music`:
  1. Update status → `processing`
  2. Gọi `record_audio_mems()`
  3. Gọi `recognize_music()`
  4. INSERT vào `music_detections`
  5. Update status → `completed` hoặc `failed` kèm error message
- `run()` — main loop, poll mỗi 2 giây, `Restart=always` do systemd handle crash

**Flow xử lý lỗi:**
- Recording fail → status `failed`, error: "Recording failed"
- File rỗng → status `failed`, error: "Recording failed: file is empty (0 bytes)"
- AudD không nhận ra → status `failed`, error: "No music detected"
- Exception bất kỳ → status `failed`, error: exception message

---

#### `music-recognition.service`
systemd unit file, quản lý vòng đời service trên Pi.

```ini
After=network-online.target    # Đợi có mạng thật (IP + DNS) rồi mới start
Wants=network-online.target    # Kéo network-online vào dependency
Restart=always                 # Tự restart nếu crash
RestartSec=10                  # Đợi 10s trước khi restart
```

Dùng `After=network-online.target` (không phải `network.target`) để đảm bảo kết nối Supabase thành công ngay lần đầu, không bị fail rồi retry.

---

#### `setup_music_autostart.sh`
Script chạy một lần để cài service lên Pi mới hoặc sau khi update service file.

```bash
sudo cp music-recognition.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable music-recognition   # Auto-start sau reboot
sudo systemctl start music-recognition
```

---

### Dashboard

#### `app/page.js` — Main Dashboard
Chứa state `musicSectionOpen` và button **🎵 Music Recognise** trong header.

- Click button → toggle `musicSectionOpen`
- Khi `true` → render `<MusicDetections>` ngay dưới header, trước stats cards
- Truyền `devices` (list device IDs từ sensor_readings) và `deviceSettings` xuống `MusicDetections`

---

#### `app/api/detect-music/route.js` — API Endpoint
Server-side Next.js route, trung gian giữa dashboard và Pi.

**Flow:**
1. Nhận `POST { deviceId }`
2. INSERT vào `device_commands` → `{ command: "detect_music", status: "pending" }`
3. Poll mỗi 1 giây, tối đa 30 lần (30 giây timeout):
   - Nếu command `completed` → query `music_detections` lấy bài vừa detect
   - Nếu command `failed` → return error
4. Return `{ success: true, song: {...} }` hoặc `{ success: false, error: "..." }`

**Demo mode:** Nếu `device_commands` table lỗi → trả về bài demo ngẫu nhiên (test không cần Pi).

---

#### `components/MusicDetections.js` — Music History Panel
Panel hiển thị lịch sử các bài nhạc đã detect.

- Fetch 10 bài gần nhất từ `music_detections` (không filter device → hiển thị tất cả)
- Realtime subscription INSERT → tự cập nhật khi có bài mới
- Button **🎤 Listen Now** → mở `MusicListeningModal`
- Hover song item → hiển thị `SongDetailsModal` tooltip

---

#### `components/MusicListeningModalNew.js` — Detection Modal
Modal trung tâm của UX nhận diện nhạc.

**States:**
| State | UI |
|-------|----|
| `idle` | Mic icon, hướng dẫn, "Listen Now" button |
| `listening` | Animation ping xanh + 🎤, "I am listening to the music", Cancel |
| `thinking` | Animation ping xanh + 🤔, "I am thinking...", Cancel |
| `success` | Check xanh, tên bài + artist, link Spotify / Apple Music, Close |
| `error` | Icon cảnh báo, error message rõ ràng trong box đỏ, Try Again + Close |

**Logic 2 phase:**
- `listening` → `thinking` tự động sau 10 giây (đúng với recording duration trên Pi)
- Dùng `AbortController` để Cancel ngắt fetch ngay lập tức

**Device selector:** Dropdown chọn Pi device nằm ngay trong modal. Nếu không có device → "Listen Now" disabled.

---

## Database Tables liên quan

### `device_commands`
Hàng đợi lệnh từ dashboard xuống Pi.

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | UUID | Primary key |
| `device_id` | string | ID của Pi (`rpi-enviro-01`) |
| `command` | string | `detect_music` |
| `status` | string | `pending` → `processing` → `completed` / `failed` |
| `result` | JSONB | Song data hoặc error message |
| `created_at` | timestamp | Thời điểm tạo |
| `processed_at` | timestamp | Thời điểm Pi xử lý xong |

### `music_detections`
Lưu lịch sử bài nhạc đã nhận diện được.

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | UUID | Primary key |
| `device_id` | string | ID Pi |
| `title` | string | Tên bài |
| `artist` | string | Nghệ sĩ |
| `album` | string | Album |
| `spotify_url` | string | Link Spotify |
| `apple_music_url` | string | Link Apple Music |
| `audio_file` | string | Path file WAV trên Pi |
| `detected_at` | timestamp | Thời điểm detect |

---

## Config & Credentials

### Pi — `raspberry-pi/.env`
```env
SUPABASE_URL=https://hqdfdbgupnfgxfxfdvjn.supabase.co
SUPABASE_SERVICE_KEY=<service role key>
DEVICE_ID=rpi-enviro-01
AUDD_API_TOKEN=<audd token>
```

### Dashboard — `dashboard/.env.local`
```env
NEXT_PUBLIC_SUPABASE_URL=https://hqdfdbgupnfgxfxfdvjn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

---

## Deploy

### Update code lên Pi
```python
# Dùng paramiko (xem Utilities/ssh_pi.py)
sftp.put('raspberry-pi/music_recognizer_with_rotation.py', '/home/am/music_recognizer_with_rotation.py')
sftp.put('raspberry-pi/music_manual_trigger_rotation.py', '/home/am/music_manual_trigger_rotation.py')
ssh.exec_command('sudo systemctl restart music-recognition')
```

### Update service file
```bash
sudo cp /home/am/music-recognition.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart music-recognition
```

### Check logs
```bash
tail -f /home/am/music_service.log
sudo journalctl -u music-recognition -f
```
