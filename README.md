# 🌿 Enviro+ Air Quality Monitor

Raspberry Pi 4B + Pimoroni Enviro+ (PIM458) → Supabase → Vercel Dashboard

## Architecture

```
┌─────────────────┐     HTTPS POST      ┌──────────────┐     Query       ┌──────────────┐
│  Raspberry Pi   │ ──────────────────→  │   Supabase   │ ←────────────── │   Vercel      │
│  + Enviro+      │    every 60s         │   PostgreSQL │   + Realtime    │   Dashboard   │
│  (sensor_reader)│                      │   (free tier)│   subscription  │   (Next.js)   │
└─────────────────┘                      └──────────────┘                 └──────────────┘
```

## Sensors Tracked

| Sensor    | Measures                    | Unit    |
|-----------|-----------------------------|---------|
| BME280    | Temperature, Pressure, Humidity | °C, hPa, % |
| LTR-559   | Light, Proximity            | lux     |
| MICS6814  | Oxidising, Reducing, NH₃ gas | kΩ     |
| MEMS mic  | Noise level                 | amplitude |
| PMS5003*  | PM1.0, PM2.5, PM10          | µg/m³  |

*PMS5003 sold separately

---

## Setup Guide

### Step 1: Supabase

1. Go to [supabase.com](https://supabase.com) → Create free project
2. Go to **SQL Editor** → Paste & run `supabase/schema.sql`
3. Go to **Settings → API** → Copy:
   - **Project URL** (e.g. `https://xxx.supabase.co`)
   - **`anon` public key** (for dashboard)
   - **`service_role` key** (for Raspberry Pi — keep secret!)
4. Go to **Database → Replication** → Enable realtime for `sensor_readings` table

### Step 2: Raspberry Pi

```bash
# SSH into your Pi
ssh pi@raspberrypi.local

# Clone/copy the raspberry-pi folder
mkdir ~/enviro-monitor && cd ~/enviro-monitor
# Copy sensor_reader.py, .env.example, requirements.txt here

# Install Pimoroni Enviro+ library
curl -sSL https://get.pimoroni.com/enviroplus | bash
# Reboot when prompted

# Install Python dependencies
pip3 install -r requirements.txt

# Configure environment
cp .env.example .env
nano .env
# → Set your SUPABASE_URL and SUPABASE_SERVICE_KEY

# Test single reading
python3 sensor_reader.py --interval 0
# You should see sensor values printed

# Run continuously (every 60 seconds + LCD display)
python3 sensor_reader.py --interval 60 --lcd

# Set up auto-start on boot
sudo cp enviro-monitor.service /etc/systemd/system/
sudo systemctl enable enviro-monitor
sudo systemctl start enviro-monitor
sudo systemctl status enviro-monitor
```

### Step 3: Vercel Dashboard

```bash
# On your development machine
cd dashboard

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# → Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# Test locally
npm run dev
# Open http://localhost:3000

# Deploy to Vercel
npm i -g vercel
vercel
# → Follow prompts
# → Add environment variables in Vercel dashboard:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## Project Structure

```
enviro-monitor/
├── raspberry-pi/
│   ├── sensor_reader.py          # Main sensor reading script
│   ├── .env.example              # Environment template
│   ├── requirements.txt          # Python dependencies
│   └── enviro-monitor.service    # Systemd service (auto-start)
├── supabase/
│   └── schema.sql                # Database schema + RLS policies
├── dashboard/
│   ├── app/
│   │   ├── layout.js             # Root layout
│   │   ├── globals.css           # Tailwind + custom styles
│   │   └── page.js               # Main dashboard (all-in-one)
│   ├── lib/
│   │   └── supabase.js           # Supabase client
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── .env.local.example
└── README.md
```

## Tips

- **Temperature offset**: BME280 reads ~3-5°C high because of Pi CPU heat. Compensate in code:
  ```python
  cpu_temp = float(open('/sys/class/thermal/thermal_zone0/temp').read()) / 1000
  adjusted = raw_temp - ((cpu_temp - raw_temp) / 2.5)
  ```
- **Supabase free tier**: 500MB storage, 2GB transfer/month — more than enough for sensor data
- **Vercel free tier**: Perfect for this use case, auto-deploys from GitHub
- **Realtime**: The dashboard uses Supabase Realtime, so new readings appear automatically
