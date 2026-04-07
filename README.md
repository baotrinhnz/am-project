# Ambience Monitor (AM)

A Raspberry Pi-based ambient environment monitoring system that continuously tracks environmental conditions, detects ambient music BPM, and identifies songs on demand — all synced to a Supabase cloud database.

---

## Hardware

- **Raspberry Pi** (rpi-enviro-01)
- **Pimoroni Enviro+** board:
  - BME280 — temperature, humidity, pressure
  - LTR559 — light (lux)
  - MICS6814 — gas (oxidising, reducing, NH3)
  - ADAU7002 MEMS microphone (I2S)
- Network: WiFi (192.168.1.214)

---

## Services

Three systemd services run continuously on the Pi:

### 1. `sensor-reader` — Environmental Sensor

**File:** `~/enviro-monitor/sensor_reader.py`

Reads all Enviro+ sensors every 60 seconds and pushes to Supabase.

| Parameter | Value |
| --- | --- |
| Interval | 60 seconds |
| Device ID | `rpi-enviro-01` |
| Supabase table | `sensor_readings` |
| Temperature compensation | factor × 2.25 |

Sensors collected: temperature (CPU-compensated), humidity, pressure, lux, gas (oxidising/reducing/NH3), noise level, PM2.5.

Noise reading is skipped when `bpm_monitor` is actively recording (checks `/tmp/mic_in_use.lock`).

---

### 2. `bpm-monitor` — Ambient BPM Detection

**File:** `~/bpm_monitor.py`

Continuously records 5-second audio clips from the MEMS mic and calculates ambient BPM using aubio beat detection.

| Parameter | Value |
| --- | --- |
| Record duration | 5 seconds |
| Sleep between samples | 10 seconds |
| Mic device | `plughw:adau7002` |
| Supabase tables | `bpm_readings`, `device_settings` |

Uses `/tmp/mic_in_use.lock` to signal mic ownership to other services. Yields mic to music recognition if `/tmp/music_detection_active.lock` is set.

---

### 3. `music-recognition` — On-Demand Song Identification

**Files:** `~/music_manual_trigger_rotation.py`, `~/music_recognizer_with_rotation.py`

Polls Supabase `device_commands` table for `listen_music` commands. When triggered, records 20 seconds of audio and sends to AudD API for song identification. Result is saved to `music_detections` table.

| Parameter | Value |
| --- | --- |
| Record duration | 10 seconds |
| Mic device | `plughw:adau7002` |
| Max saved recordings | 10 files (rotation) |
| Save folder | `~/Music_for_delete/` |
| Filename format | `music_listen_###_YYYYMMDD_HHMMSS.wav` |
| Supabase tables | `device_commands`, `music_detections` |
| Recognition API | AudD (`api.audd.io`) |

---

## Microphone Coordination

All three services share one MEMS microphone. Coordination via lock files:

| Lock file | Held by | Meaning |
| --- | --- | --- |
| `/tmp/mic_in_use.lock` | `bpm_monitor` | BPM is currently recording |
| `/tmp/music_detection_active.lock` | `music_recognizer` | Music recognition wants the mic |

- `bpm_monitor` checks `music_detection_active.lock` before recording — waits if set
- `sensor_reader` checks `mic_in_use.lock` before noise reading — skips if busy
- `music_recognizer` sets `music_detection_active.lock`, waits up to 6s for `mic_in_use.lock` to clear

---

## Logs

All logs are centralised under `~/AM_logs/`:

```text
~/AM_logs/
├── sensor_reader/
│   └── sensor_reader.log
├── bpm_monitor/
│   └── bpm_monitor.log
└── music_recognition/
    ├── music_service.log
    └── music_detection_log.txt
```

---

## Configuration

**Files:** `~/.env` and `~/enviro-monitor/.env`

```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=<service_role_key>
DEVICE_ID=rpi-enviro-01
AUDD_API_TOKEN=<token>
TEMP_COMPENSATION_FACTOR=2.25
```

---

## Supabase Tables

| Table | Used by |
| --- | --- |
| `sensor_readings` | sensor-reader (write) |
| `bpm_readings` | bpm-monitor (write) |
| `device_settings` | bpm-monitor (read) |
| `device_commands` | music-recognition (poll & update) |
| `music_detections` | music-recognition (write) |

---

## Service Management

```bash
# Status
sudo systemctl status sensor-reader bpm-monitor music-recognition

# Restart a service
sudo systemctl restart sensor-reader

# View logs
tail -f ~/AM_logs/sensor_reader/sensor_reader.log
tail -f ~/AM_logs/bpm_monitor/bpm_monitor.log
tail -f ~/AM_logs/music_recognition/music_service.log
tail -f ~/AM_logs/music_recognition/music_detection_log.txt
```

---

## Folder Structure

```text
c:\AM\
│
├── raspberry-pi/
│   ├── sensor_reader.py                     # Enviro+ sensor monitor (always-on service)
│   ├── bpm_monitor.py                       # Ambient BPM detection (always-on service)
│   ├── music_recognizer_with_rotation.py    # Audio recording + AudD fingerprinting
│   ├── music_manual_trigger_rotation.py     # Supabase command listener (always-on service)
│   ├── .env                                 # Pi environment variables
│   └── ForDelete/                           # Archived old scripts
│
├── dashboard/
│   ├── app/
│   │   ├── page.js                          # Main dashboard page
│   │   └── api/
│   │       └── detect-music/route.js        # Music detection API endpoint
│   ├── components/
│   │   ├── MusicDetections.js               # Last 8 detected songs list
│   │   ├── MusicListeningModal.js           # Detect music modal + result display
│   │   ├── BpmWidget.js                     # Ambient beat rate chart
│   │   └── MusicBpmWidget.js                # Music BPM widget
│   ├── lib/
│   │   └── supabase.js                      # Supabase client
│   └── next.config.js                       # Build version (days since 2026-01-01)
│
├── supabase/
│   └── migrations/
│       ├── create_music_detections_table.sql
│       ├── create_device_commands_table.sql
│       └── 001_device_settings.sql
│
├── utilities/
│   └── ssh_pi.py                            # SSH helper (legacy)
│
├── Unuse/                                   # Archived files
│
├── README.md                                # Project overview (English)
├── README_VI.md                             # Project overview (Vietnamese)
└── FOLDER_STRUCTURE.md                      # This structure
```

---

## Deploy

SSH key: `~/.ssh/am_pi`

```bash
# Connect
ssh -i ~/.ssh/am_pi am@192.168.1.214

# Copy .env to Pi
scp -i ~/.ssh/am_pi raspberry-pi/.env am@192.168.1.214:/home/am/.env
scp -i ~/.ssh/am_pi raspberry-pi/.env am@192.168.1.214:/home/am/enviro-monitor/.env
```
