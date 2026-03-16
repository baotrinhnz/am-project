# 🍓 Raspberry Pi Setup Guide - Enviro+ (PIM458)

## 📋 Prerequisites

- Raspberry Pi 4B with Raspberry Pi OS installed
- Pimoroni Enviro+ (PIM458) HAT attached
- Internet connection (WiFi or Ethernet)
- SSH access to the Pi

---

## 🚀 Step-by-Step Installation

### Step 1: Connect to Raspberry Pi via SSH

```bash
ssh pi@raspberrypi.local
# Default password: raspberry (change it after first login!)
```

### Step 2: Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### Step 3: Install Enviro+ Library (Official Pimoroni Installer)

```bash
curl -sSL https://get.pimoroni.com/enviroplus | bash
```

**Important:**
- This will ask if you want to install examples - press **Y**
- It will ask to reboot - press **Y**
- After reboot, SSH back in

### Step 4: Create Project Directory

```bash
mkdir -p ~/enviro-monitor
cd ~/enviro-monitor
```

### Step 5: Copy Files from Your Computer

On your **Windows computer**, run:

```bash
# From c:\am directory
scp raspberry-pi/sensor_reader.py pi@raspberrypi.local:~/enviro-monitor/
scp raspberry-pi/.env.example pi@raspberrypi.local:~/enviro-monitor/
scp raspberry-pi/requirements.txt pi@raspberrypi.local:~/enviro-monitor/
```

**Alternative:** Use WinSCP or copy manually

### Step 6: Install Python Dependencies

Back on the **Raspberry Pi**:

```bash
cd ~/enviro-monitor
pip3 install -r requirements.txt
```

### Step 7: Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

Edit the file with your Supabase credentials:

```env
SUPABASE_URL=https://hqdfdbgupnfgxfxfdvjn.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxZGZkYmd1cG5mZ3hmeGZkdmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ3NzMwNCwiZXhwIjoyMDg4MDUzMzA0fQ.671KyrF-pjUhd_ubv4qHOK5u-E_2j-lIP9Q6dgwTOLU
DEVICE_ID=rpi-enviro-01
```

Press `Ctrl+X`, then `Y`, then `Enter` to save.

### Step 8: Test Single Reading

```bash
python3 sensor_reader.py --interval 0
```

Expected output:
```
2026-03-03 12:00:00 [INFO] Starting Enviro+ Monitor | device=rpi-enviro-01
2026-03-03 12:00:00 [INFO] Supabase: connected
2026-03-03 12:00:00 [INFO] Sensors: real
2026-03-03 12:00:00 [INFO] Reading: temp=22.5°C hum=45.2% press=1013.2 hPa...
2026-03-03 12:00:01 [INFO] ✓ Pushed to Supabase (id: 2)
```

### Step 9: Run Continuously (Every 60 seconds)

```bash
python3 sensor_reader.py --interval 60
```

Press `Ctrl+C` to stop.

---

## 🔄 Auto-Start on Boot (Optional)

### Step 1: Copy Service File

```bash
cd ~/enviro-monitor
sudo nano /etc/systemd/system/enviro-monitor.service
```

Paste this content:

```ini
[Unit]
Description=Enviro+ Air Quality Monitor
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/enviro-monitor
ExecStart=/usr/bin/python3 /home/pi/enviro-monitor/sensor_reader.py --interval 60
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Save with `Ctrl+X`, `Y`, `Enter`.

### Step 2: Enable and Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable enviro-monitor
sudo systemctl start enviro-monitor
```

### Step 3: Check Status

```bash
sudo systemctl status enviro-monitor
```

Should show **"active (running)"** in green.

### View Logs

```bash
journalctl -u enviro-monitor -f
```

Press `Ctrl+C` to exit.

---

## 🐛 Troubleshooting

### Error: "ModuleNotFoundError: No module named 'bme280'"

**Solution:** Reinstall Enviro+ library
```bash
curl -sSL https://get.pimoroni.com/enviroplus | bash
```

### Error: "ModuleNotFoundError: No module named 'supabase'"

**Solution:** Install dependencies
```bash
pip3 install supabase python-dotenv httpx
```

### Error: "Connection refused" or "Database error"

**Check:**
1. Is `.env` file correct?
   ```bash
   cat .env
   ```
2. Can you reach Supabase?
   ```bash
   ping hqdfdbgupnfgxfxfdvjn.supabase.co
   ```

### Sensor reads wrong temperature (too high)

This is normal - BME280 sensor picks up heat from Raspberry Pi CPU. The code already compensates for this.

---

## 📊 View Data

After running the sensor reader, check your dashboard at:
- **Local:** http://localhost:3001 (if running on your computer)
- **Vercel:** https://am-project.vercel.app (after deployment)

---

## 🛑 Stop Auto-Start Service

```bash
sudo systemctl stop enviro-monitor
sudo systemctl disable enviro-monitor
```

---

## 📝 Notes

- Data is sent every 60 seconds by default
- Supabase free tier supports 500MB storage (plenty for sensor data)
- LCD display available with `--lcd` flag (requires additional setup)
- PM2.5 sensor (PMS5003) is optional and sold separately

---

## ✅ Quick Commands Reference

```bash
# Test single reading
python3 sensor_reader.py --interval 0

# Run continuously every 60s
python3 sensor_reader.py --interval 60

# Check service status
sudo systemctl status enviro-monitor

# View live logs
journalctl -u enviro-monitor -f

# Restart service
sudo systemctl restart enviro-monitor
```

---

**Need help?** Check the logs or contact support! 🚀
