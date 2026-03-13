# Ambience Monitor - System Architecture

## Overview
Real-time environmental monitoring system using Raspberry Pi with Enviro+ sensor board, storing data in Supabase, and visualizing on a Next.js dashboard hosted on Vercel.

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RASPBERRY PI 4B                                 │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │                   Enviro+ PIM458 Board                         │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │     │
│  │  │  BME280  │  │ LTR-559  │  │MICS6814 │  │  MEMS    │      │     │
│  │  │          │  │          │  │  Gas    │  │  Mic     │      │     │
│  │  │ Temp     │  │ Light    │  │ Sensor  │  │ (Noise)  │      │     │
│  │  │ Humidity │  │ Proximity│  │         │  │          │      │     │
│  │  │ Pressure │  │          │  │         │  │          │      │     │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │     │
│  │       │             │              │              │           │     │
│  │       └─────────────┴──────────────┴──────────────┘           │     │
│  │                          I²C Bus                              │     │
│  └───────────────────────────┬───────────────────────────────────┘     │
│                              │                                         │
│  ┌───────────────────────────▼───────────────────────────────────┐     │
│  │              sensor_reader.py (Python)                         │     │
│  │  • Reads sensors every 60s                                     │     │
│  │  • CPU temperature compensation (factor: 0.88)                 │     │
│  │  • Logs: raw temp, CPU temp, compensated temp                 │     │
│  │  • systemd service (auto-start on boot)                       │     │
│  └───────────────────────────┬───────────────────────────────────┘     │
│                              │                                         │
│                              │ HTTPS POST                              │
│                              │ (JSON payload)                          │
└──────────────────────────────┼─────────────────────────────────────────┘
                               │
                               │
                               ▼
                ┌──────────────────────────────┐
                │      SUPABASE CLOUD          │
                │  ┌────────────────────────┐  │
                │  │   PostgreSQL Database  │  │
                │  │                        │  │
                │  │  Table: sensor_readings│  │
                │  │  Columns:              │  │
                │  │  • id (bigserial)      │  │
                │  │  • device_id (text)    │  │
                │  │  • temperature (real)  │  │
                │  │  • humidity (real)     │  │
                │  │  • pressure (real)     │  │
                │  │  • lux (real)          │  │
                │  │  • noise_level (real)  │  │
                │  │  • gas_* (real)        │  │
                │  │  • recorded_at (ts)    │  │
                │  │                        │  │
                │  │  Table: device_settings│  │
                │  │  • device_id           │  │
                │  │  • display_name        │  │
                │  │  • location            │  │
                │  │  • note                │  │
                │  └────────────────────────┘  │
                │                              │
                │  Real-time Subscriptions     │
                │  (WebSocket)                 │
                └──────────────┬───────────────┘
                               │
                               │ Supabase Client SDK
                               │ (Real-time updates)
                               │
                               ▼
                ┌──────────────────────────────┐
                │      VERCEL HOSTING          │
                │  ┌────────────────────────┐  │
                │  │   Next.js 14 App       │  │
                │  │   (React Dashboard)    │  │
                │  │                        │  │
                │  │  Components:           │  │
                │  │  • 5 Stat Cards        │  │
                │  │  • 8 Individual Charts │  │
                │  │  • 4 Grouped Charts    │  │
                │  │  • System Info Panel   │  │
                │  │  • Settings Modal      │  │
                │  │  • Theme Toggle        │  │
                │  │                        │  │
                │  │  Features:             │  │
                │  │  • Real-time updates   │  │
                │  │  • Light/Dark theme    │  │
                │  │  • Device selector     │  │
                │  │  • Time range filter   │  │
                │  │  • Responsive design   │  │
                │  └────────────────────────┘  │
                │                              │
                │  URL: am-beta-ten.vercel.app │
                └──────────────┬───────────────┘
                               │
                               │ HTTPS
                               │
                               ▼
                        ┌──────────────┐
                        │     USER     │
                        │   (Browser)  │
                        └──────────────┘
```

---

## Data Flow

### 1. Data Collection (Raspberry Pi)
```
Sensors → I²C Bus → sensor_reader.py → Supabase
   ↓
BME280:        Temperature (with CPU compensation)
               Humidity
               Pressure
LTR-559:       Light (lux)
               Proximity
MICS6814:      Gas (Oxidising, Reducing, NH₃)
MEMS Mic:      Noise level
```

### 2. Temperature Compensation Algorithm
```
Raw Temp (BME280) → 41.69°C (affected by CPU heat)
CPU Temp          → 60.37°C
                     ↓
Compensation Formula: compensated = raw - ((cpu - raw) / factor)
                     ↓
Compensated Temp  → 20.47°C (actual room temperature)

Factor: 0.88 (calibrated for ~22°C environment)
```

### 3. Data Storage (Supabase)
```
sensor_reader.py
    ↓
HTTP POST request (JSON)
    ↓
Supabase REST API
    ↓
PostgreSQL INSERT
    ↓
Real-time Broadcast (WebSocket)
```

### 4. Data Visualization (Dashboard)
```
User opens dashboard
    ↓
Next.js loads
    ↓
Supabase Client connects
    ↓
Initial data fetch (last 24h)
    ↓
Subscribe to real-time updates
    ↓
Charts auto-update on new data
```

---

## Technology Stack

### Hardware
- **Raspberry Pi 4B** - Main compute unit
- **Pimoroni Enviro+ (PIM458)** - Sensor HAT board
  - BME280 (Temperature, Humidity, Pressure)
  - LTR-559 (Light, Proximity)
  - MICS6814 (Gas sensor)
  - MEMS Microphone (Noise)

### Backend (Raspberry Pi)
- **Python 3**
- **Libraries**:
  - `enviroplus` - Sensor drivers
  - `supabase-py` - Database client
  - `sounddevice`, `numpy` - Audio processing
  - `python-dotenv` - Configuration
- **systemd** - Service management (auto-start)

### Database
- **Supabase** (PostgreSQL)
- **Features**:
  - Real-time subscriptions
  - Row Level Security (RLS)
  - REST API
  - WebSocket support

### Frontend
- **Next.js 14.2.35** (App Router)
- **React 18**
- **Recharts** - Data visualization
- **Tailwind CSS** - Styling
- **Custom hooks**:
  - `useDeviceSettings` - Device configuration
- **Features**:
  - Server-Side Rendering (SSR)
  - Static Generation
  - Real-time updates

### Hosting
- **Vercel** - Frontend hosting
- **Features**:
  - Auto-deploy from git
  - Edge Network (CDN)
  - Environment variables
  - SSL/HTTPS

---

## Key Features

### 1. Real-time Monitoring
- New sensor readings every 60 seconds
- Automatic dashboard updates via WebSocket
- Live indicator shows connection status

### 2. Temperature Compensation
- Corrects CPU heat interference
- Configurable factor (default: 0.88)
- Logs raw, CPU, and compensated values

### 3. Multi-device Support
- Track multiple Raspberry Pi devices
- Custom display names and locations
- Device-specific notes with tooltips
- Filter by device or view all

### 4. Flexible Visualization
- **5 Stat Cards**: Latest values at a glance
- **8 Individual Charts**: Per-sensor time series
- **4 Grouped Charts**: Related sensors combined
- **System Info**: Metrics and activity graph

### 5. User Experience
- **Light/Dark Theme**: Toggle between modes
- **Time Ranges**: 1H, 6H, 24H, 7D, 30D
- **Responsive Design**: Mobile-friendly
- **Settings Modal**: Configure devices

---

## Configuration Files

### Raspberry Pi: `~/enviro-monitor/.env`
```env
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...
DEVICE_ID=rpi-enviro-01
TEMP_COMPENSATION_FACTOR=0.88
```

### Dashboard: `dashboard/.env.local`
```env
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
```

---

## Database Schema

### Table: `sensor_readings`
```sql
CREATE TABLE sensor_readings (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  temperature REAL,
  humidity REAL,
  pressure REAL,
  lux REAL,
  proximity REAL,
  noise_level REAL,
  gas_oxidising REAL,
  gas_reducing REAL,
  gas_nh3 REAL,
  pm1 REAL,
  pm25 REAL,
  pm10 REAL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recorded_at ON sensor_readings(recorded_at DESC);
CREATE INDEX idx_device_id ON sensor_readings(device_id);
```

### Table: `device_settings`
```sql
CREATE TABLE device_settings (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  location TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Deployment

### Raspberry Pi Setup
```bash
# 1. Clone repository
git clone [repo-url]
cd raspberry-pi

# 2. Install dependencies
pip3 install --break-system-packages enviroplus supabase-py sounddevice numpy

# 3. Configure environment
cp .env.example .env
nano .env  # Add credentials

# 4. Install systemd service
sudo cp enviro-monitor.service /etc/systemd/system/
sudo systemctl enable enviro-monitor
sudo systemctl start enviro-monitor

# 5. Check status
systemctl status enviro-monitor
journalctl -u enviro-monitor -f
```

### Dashboard Deployment
```bash
# 1. Install dependencies
cd dashboard
npm install

# 2. Configure Vercel
vercel login
vercel link  # Link to project "am"

# 3. Add environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY

# 4. Deploy
vercel --prod
```

---

## Monitoring & Logs

### Raspberry Pi Logs
```bash
# Follow service logs
journalctl -u enviro-monitor.service -f

# Recent logs
journalctl -u enviro-monitor.service -n 50

# Filter by Reading
journalctl -u enviro-monitor.service | grep Reading
```

### Expected Log Output
```
2026-03-04 13:42:18 [INFO] Reading: temp=20.47°C (raw=41.69°C, cpu=60.37°C)
                            hum=12.94% press=1021.29 hPa lux=567.34 pm25=None
2026-03-04 13:42:18 [INFO] ✓ Pushed to Supabase (id: 833)
```

---

## Performance Metrics

### System Info Panel
- **Data Points**: Total readings in selected time range
- **Update Rate**: Readings per hour
- **Active Devices**: Number of connected Pi devices
- **Time Range**: Current filter (1H-30D)

### Resource Usage (Raspberry Pi)
- **CPU**: ~0.5% average
- **Memory**: ~50MB Python process
- **Network**: ~1KB per reading (every 60s)
- **Storage**: Data stored in Supabase only

---

## URLs & Access

- **Production Dashboard**: https://am-beta-ten.vercel.app
- **Supabase Project**: https://hqdfdbgupnfgxfxfdvjn.supabase.co
- **Raspberry Pi**: 10.0.1.243 (local network)

---

## Future Enhancements

- [ ] Email/SMS alerts for abnormal readings
- [ ] Historical data export (CSV/JSON)
- [ ] Air quality index (AQI) calculation
- [ ] PMS5003 sensor integration (PM2.5, PM10)
- [ ] Weather API integration for comparison
- [ ] Mobile app (React Native)
- [ ] Multi-location support
- [ ] Data analytics & trends

---

**Last Updated**: 2026-03-04
**Version**: 1.0.0
**Author**: BaoT
