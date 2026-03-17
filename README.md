# AM — Ambience Monitor

A Raspberry Pi–based ambient environment monitor with live music detection. Sensor data and detected songs are streamed to a Next.js dashboard via Supabase.

---

## Hardware

| Component | Detail |
|-----------|--------|
| Raspberry Pi 4 | Host device |
| Pimoroni Enviro+ | Temperature, humidity, pressure, light, noise |
| ADAU7002 MEMS mic | I2S microphone for music detection |

---

## Architecture

```
Raspberry Pi
├── sensor_reader.py          → reads Enviro+ every 60s → Supabase sensor_readings
└── music_manual_trigger_rotation.py
        ↕ polls device_commands (Supabase)
        └── music_recognizer_with_rotation.py
                → arecord 10s (48kHz S32_LE, plughw:adau7002)
                → AudD API fingerprint
                → Supabase music_detections

Dashboard (Vercel / Next.js)
├── Reads sensor_readings, music_detections in real-time
├── Detect Music button → inserts device_commands → Pi picks up
└── Displays: temperature, humidity, pressure, light, noise, music
```

---

## Pi Services

| Service | Script | Purpose |
|---------|--------|---------|
| `enviro-monitor.service` | `sensor_reader.py` | Continuously reads Enviro+ sensors |
| `music-recognition.service` | `music_manual_trigger_rotation.py` | Polls Supabase for detect commands |

```bash
# Status
sudo systemctl status enviro-monitor
sudo systemctl status music-recognition

# Restart
sudo systemctl restart music-recognition
```

---

## Audio

- Device: `plughw:adau7002` (name-based, survives reboot card renumbering)
- Format: `48kHz S32_LE stereo` — native I2S rate for ADAU7002 on Pi
- Post-processing: `sox norm -3` before AudD upload

**PipeWire note:** PipeWire auto-starts as a user service. It does not block `plughw:` direct ALSA access at 48kHz.

---

## Supabase Tables

| Table | Writer | Reader |
|-------|--------|--------|
| `sensor_readings` | sensor_reader.py | Dashboard |
| `music_detections` | music_manual_trigger_rotation.py | Dashboard |
| `device_commands` | Dashboard API | music_manual_trigger_rotation.py |
| `device_settings` | Manual / Dashboard | Pi services |

---

## Dashboard

- **URL:** Deployed on Vercel
- **Stack:** Next.js 14, Tailwind CSS, Recharts, Supabase JS
- **Key components:**
  - `SensorWidget` — temperature, humidity, pressure, light, noise
  - `MusicDetections` — last 8 detected songs
  - `MusicListeningModal` — trigger detection, show result
  - `BpmWidget` — ambient beat rate chart (reads from `bpm_readings`)

```bash
cd dashboard
npm run dev      # localhost:3000
npm run build    # production build
```

---

## Music Detection Flow

1. User clicks **Detect Music** in dashboard
2. Dashboard calls `POST /api/detect-music` → inserts `device_commands` record
3. Pi polls every 2s, picks up command
4. Pi records 10s audio → uploads to AudD API
5. **If detected:** saves to `music_detections`, marks command `completed`
6. **If AudD can't fingerprint** (noisy/quiet): command `failed`, error = `no_fingerprint`
7. **If AudD has no match** (Vietnamese songs etc.): command `failed`, error = `no_match`
8. Dashboard API reads result → shows song or appropriate message

---

## Deploy to Pi

```bash
# Copy file
scp -i ~/.ssh/am_pi raspberry-pi/<file>.py am@192.168.1.214:/home/am/<file>.py

# Restart service
ssh -i ~/.ssh/am_pi am@192.168.1.214 "sudo systemctl restart music-recognition"
```

---

## Environment Variables

### Pi (`raspberry-pi/.env`)
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
AUDD_API_TOKEN=
DEVICE_ID=rpi-enviro-01
```

### Dashboard (`dashboard/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```
