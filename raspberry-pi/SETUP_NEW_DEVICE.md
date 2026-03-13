# Setup New Raspberry Pi Device

Quick guide to add a new Ambience Monitor device to your system.

---

## 🚀 Quick Setup (Recommended)

### One-Line Install

SSH into your Raspberry Pi and run:

```bash
bash <(curl -sSL https://raw.githubusercontent.com/baotrinhnz/am-project/main/raspberry-pi/setup_new_device.sh)
```

**What it does:**
- ✅ Auto-generates unique device ID from Pi serial number
- ✅ Installs all dependencies (Python packages, I2C tools)
- ✅ Configures Supabase connection
- ✅ Sets up auto-start on boot (systemd service)
- ✅ Tests connection and starts logging immediately

**You'll need:**
- Supabase URL: `https://hqdfdbgupnfgxfxfdvjn.supabase.co`
- Supabase Service Key: (from Supabase Dashboard → Settings → API)

---

## 🔧 Manual Setup (Alternative)

### Step 1: Clone Repository

```bash
cd ~
git clone https://github.com/baotrinhnz/am-project.git
cd am-project/raspberry-pi
```

### Step 2: Install Dependencies

```bash
sudo apt update
sudo apt install -y python3-pip i2c-tools
pip3 install --break-system-packages enviroplus supabase-py python-dotenv

# Optional: If you have PMS5003 sensor
pip3 install --break-system-packages pms5003
```

### Step 3: Enable I2C

```bash
sudo raspi-config nonint do_i2c 0
```

### Step 4: Create .env File

```bash
cp .env.example .env
nano .env
```

Edit the file:
```env
SUPABASE_URL=https://hqdfdbgupnfgxfxfdvjn.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here
DEVICE_ID=rpi-enviro-02  # Change this to unique ID
```

**Device ID Format:**
- Use format: `rpi-enviro-XX` where XX is a unique number
- Or use descriptive names: `rpi-living-room`, `rpi-bedroom`, etc.
- Must be unique across all your devices

### Step 5: Test Connection

```bash
python3 sensor_reader.py
```

If successful, you'll see sensor readings printed to console.

### Step 6: Setup Auto-Start (Optional)

Create systemd service:

```bash
sudo nano /etc/systemd/system/ambience-monitor.service
```

Paste this content (adjust paths if needed):

```ini
[Unit]
Description=Ambience Monitor Sensor Logger
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/am-project/raspberry-pi
ExecStart=/usr/bin/python3 /home/pi/am-project/raspberry-pi/sensor_reader.py --interval 60
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ambience-monitor.service
sudo systemctl start ambience-monitor.service
```

---

## 📊 After Setup

### 1. Verify Device is Sending Data

Check service logs:
```bash
sudo journalctl -u ambience-monitor -f
```

You should see entries like:
```
[INFO] Reading sensors...
[INFO] Data sent to Supabase: device_id=rpi-enviro-02
```

### 2. Configure Device in Dashboard

1. Go to dashboard: https://am-beta-ten.vercel.app
2. Wait for new device to appear in device selector
3. Click **Settings** (⚙️ button)
4. Find your device ID
5. Set:
   - **Display Name**: e.g., "Living Room Monitor"
   - **Location**: e.g., "Living Room, near window"
   - **Note**: e.g., "South-facing, morning sun"
6. Click **Save Changes**

### 3. View Data

- Device will appear in device selector
- Select device to view its data
- Hover over device button to see tooltip with location & note

---

## 🔍 Troubleshooting

### Device not appearing in dashboard?

1. **Check service is running:**
   ```bash
   sudo systemctl status ambience-monitor
   ```

2. **Check logs for errors:**
   ```bash
   sudo journalctl -u ambience-monitor -n 50
   ```

3. **Test Supabase connection:**
   ```bash
   python3 -c "
   import os
   from dotenv import load_dotenv
   from supabase import create_client
   load_dotenv()
   sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY'))
   print(sb.table('sensor_readings').select('id').limit(1).execute())
   "
   ```

### Sensor reading errors?

1. **Check I2C is enabled:**
   ```bash
   ls /dev/i2c* /dev/spi*
   ```
   Should show: `/dev/i2c-1`, `/dev/spidev0.0`, etc.

2. **Detect I2C devices:**
   ```bash
   sudo i2cdetect -y 1
   ```
   Should show addresses for BME280 (0x76) and LTR559 (0x23)

3. **Try running manually:**
   ```bash
   cd ~/am-project/raspberry-pi
   python3 sensor_reader.py
   ```

### Permission issues?

```bash
sudo usermod -a -G i2c,spi,gpio $USER
# Then logout and login again
```

---

## 🛠 Useful Commands

**Service Management:**
```bash
# Check status
sudo systemctl status ambience-monitor

# View live logs
sudo journalctl -u ambience-monitor -f

# Restart service
sudo systemctl restart ambience-monitor

# Stop service
sudo systemctl stop ambience-monitor

# Disable auto-start
sudo systemctl disable ambience-monitor
```

**Manual Testing:**
```bash
# Single reading
python3 sensor_reader.py

# Continuous readings (every 60 seconds)
python3 sensor_reader.py --interval 60

# With LCD display (if Enviro+ has LCD)
python3 sensor_reader.py --interval 60 --lcd
```

---

## 📋 Device ID Best Practices

**Recommended formats:**
- `rpi-enviro-01`, `rpi-enviro-02`, etc. (sequential)
- `rpi-<location>`: `rpi-bedroom`, `rpi-office`
- `rpi-<room>-<floor>`: `rpi-living-1f`, `rpi-bedroom-2f`

**Avoid:**
- Spaces in device IDs
- Special characters (except `-` and `_`)
- Very long names (keep under 30 chars)

---

## 🔄 Adding Multiple Devices

For each new device:

1. Run setup script on new Pi
2. Use unique device ID (auto-generated or custom)
3. Configure in dashboard Settings
4. Done! All devices will appear in device selector

**Example setup:**
- Device 1: `rpi-enviro-01` → "Living Room" → Living room, near TV
- Device 2: `rpi-enviro-02` → "Bedroom" → Master bedroom, nightstand
- Device 3: `rpi-enviro-03` → "Office" → Home office, desk

---

## ✅ Next Steps

After successful setup:

1. ✅ Device auto-starts on boot
2. ✅ Sends data every 60 seconds
3. ✅ Appears in dashboard automatically
4. ✅ Customize name/location in Settings
5. ✅ Monitor all devices from single dashboard

**Dashboard:** https://am-beta-ten.vercel.app

---

## 🆘 Need Help?

If you encounter issues:
1. Check service logs: `sudo journalctl -u ambience-monitor -n 100`
2. Test sensor reading: `python3 sensor_reader.py`
3. Verify Supabase connection
4. Check GitHub issues

**Happy monitoring! 🌡️📊**
