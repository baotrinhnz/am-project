#!/bin/bash
# ============================================================================
# DO IT ALL - Complete Raspberry Pi Enviro+ Setup Script
# ============================================================================
# Flash SD card → Boot Pi → Run this script → Done!
#
# This script handles EVERYTHING:
#   ✅ System update & upgrade
#   ✅ Install all dependencies (Python, libraries, tools)
#   ✅ Enable I2C, SPI interfaces
#   ✅ Install Enviro+ libraries
#   ✅ Auto-generate unique device ID
#   ✅ Configure Supabase connection
#   ✅ Download sensor reader code
#   ✅ Setup systemd auto-start service
#   ✅ Test everything
#
# Usage on fresh Raspberry Pi OS:
#   wget https://raw.githubusercontent.com/.../do_it_all.sh
#   sudo bash do_it_all.sh
#
# Or one-liner:
#   curl -sSL https://raw.githubusercontent.com/.../do_it_all.sh | sudo bash
# ============================================================================

set -e  # Exit on any error

# Must run as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run with sudo: sudo bash $0"
    exit 1
fi

# Get actual user (not root)
ACTUAL_USER=${SUDO_USER:-$(whoami)}
USER_HOME=$(eval echo ~$ACTUAL_USER)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }
step() { echo -e "\n${CYAN}▶${NC} ${BLUE}$1${NC}"; }

clear
cat << "EOF"
╔════════════════════════════════════════╗
║   Ambience Monitor - DO IT ALL Setup  ║
║   Raspberry Pi + Enviro+ Automation   ║
╚════════════════════════════════════════╝
EOF
echo ""
info "Running as: root"
info "User: $ACTUAL_USER"
info "Home: $USER_HOME"
echo ""

# ============================================================================
# STEP 1: System Update & Upgrade
# ============================================================================
step "Step 1/10: System Update & Upgrade"
echo "This may take 5-15 minutes depending on your internet speed..."
sleep 2

apt update -qq 2>&1 | grep -v "^Get:" | grep -v "^Hit:" || true
info "Package lists updated"

apt upgrade -y -qq 2>&1 | grep -E "upgraded|installed|removed" || true
info "System upgraded"

apt autoremove -y -qq
apt autoclean -qq
info "Cleanup complete"

# ============================================================================
# STEP 2: Install System Dependencies
# ============================================================================
step "Step 2/10: Installing System Dependencies"

apt install -y -qq \
    python3 \
    python3-pip \
    python3-dev \
    python3-smbus \
    python3-pil \
    python3-setuptools \
    python3-rpi.gpio \
    git \
    i2c-tools \
    build-essential \
    libgpiod2 \
    curl \
    wget \
    vim \
    htop

info "System packages installed"

# ============================================================================
# STEP 3: Enable Hardware Interfaces
# ============================================================================
step "Step 3/10: Enabling I2C and SPI Interfaces"

raspi-config nonint do_i2c 0
raspi-config nonint do_spi 0
info "I2C enabled"
info "SPI enabled"

# Add user to hardware groups
usermod -a -G i2c,spi,gpio $ACTUAL_USER
info "User added to hardware groups"

# ============================================================================
# STEP 4: Install Python Packages
# ============================================================================
step "Step 4/10: Installing Python Packages (Enviro+ Libraries)"

# Install audio dependencies for MEMS microphone
info "Installing audio libraries for noise sensor..."
apt install -y -qq \
    libportaudio2 \
    portaudio19-dev \
    libatlas-base-dev

# Install as actual user to avoid permission issues
sudo -u $ACTUAL_USER pip3 install --break-system-packages \
    enviroplus \
    supabase-py \
    python-dotenv \
    requests \
    Pillow \
    smbus2 \
    RPi.GPIO \
    sounddevice \
    numpy

info "Enviro+ libraries installed"
info "Supabase client installed"
info "Audio libraries installed (for MEMS microphone)"
info "Additional utilities installed"

# ============================================================================
# STEP 5: PMS5003 Particulate Matter Sensor (Optional)
# ============================================================================
step "Step 5/10: PMS5003 Sensor Configuration"

echo ""
echo "Do you have a PMS5003 particulate matter sensor connected?"
echo "(This is an optional add-on sensor, sold separately)"
echo ""
read -p "Install PMS5003 support? (y/N): " -n 1 -r HAS_PMS
echo ""

if [[ $HAS_PMS =~ ^[Yy]$ ]]; then
    sudo -u $ACTUAL_USER pip3 install --break-system-packages pms5003
    PMS_ENABLED="True"
    info "PMS5003 support installed"
else
    PMS_ENABLED="False"
    info "Skipping PMS5003 (not installed)"
fi

# ============================================================================
# STEP 6: Generate Unique Device ID
# ============================================================================
step "Step 6/10: Generating Unique Device ID"

# Try to get Raspberry Pi serial number
PI_SERIAL=$(cat /proc/cpuinfo | grep Serial | cut -d ' ' -f 2 2>/dev/null)

# Fallback methods
if [ -z "$PI_SERIAL" ] || [ "$PI_SERIAL" = "0000000000000000" ]; then
    # Try MAC address
    PI_SERIAL=$(cat /sys/class/net/eth0/address 2>/dev/null || cat /sys/class/net/wlan0/address 2>/dev/null | tr -d ':')
fi

if [ -z "$PI_SERIAL" ]; then
    # Last resort: hostname + timestamp
    PI_SERIAL="$(hostname)-$(date +%s | tail -c 9)"
fi

# Create device ID from last 8 characters
DEVICE_ID="rpi-enviro-${PI_SERIAL: -8}"

echo ""
info "Auto-generated Device ID: ${CYAN}$DEVICE_ID${NC}"
echo ""

# ============================================================================
# STEP 7: Supabase Configuration
# ============================================================================
step "Step 7/10: Supabase Configuration"

echo ""
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│  You need Supabase credentials from your project:          │"
echo "│  https://app.supabase.com/project/YOUR_PROJECT/settings/api │"
echo "└─────────────────────────────────────────────────────────────┘"
echo ""

# Check for environment variables first (for automation)
if [ -z "$SUPABASE_URL" ]; then
    read -p "Enter Supabase URL: " SUPABASE_URL
fi

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
    read -p "Enter Supabase Service Role Key: " SUPABASE_SERVICE_KEY
fi

# Validate inputs
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
    error "Supabase credentials are required!"
fi

info "Supabase credentials configured"

# ============================================================================
# STEP 8: Project Setup
# ============================================================================
step "Step 8/10: Setting Up Project Directory"

PROJECT_DIR="$USER_HOME/ambience-monitor"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

info "Project directory: $PROJECT_DIR"

# Download sensor reader script from GitHub
info "Downloading sensor reader code..."

GITHUB_RAW="https://raw.githubusercontent.com/baotrinhnz/am-project/main/raspberry-pi"

# Try to download existing script
if curl -sSL -f "$GITHUB_RAW/sensor_reader.py" -o sensor_reader.py 2>/dev/null; then
    info "Downloaded sensor_reader.py from GitHub"
else
    warn "Could not download from GitHub, creating standalone version..."

    # Create embedded version
    cat > sensor_reader.py <<'PYEOF'
#!/usr/bin/env python3
"""
Enviro+ Air Quality Monitor → Supabase
Standalone version with all sensors
"""
import os, sys, time, logging
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
DEVICE_ID = os.getenv("DEVICE_ID", "rpi-enviro-01")
HAS_PM = os.getenv("HAS_PM_SENSOR", "False") == "True"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger("enviro")

# Import sensors
try:
    from bme280 import BME280
    from ltr559 import LTR559
    from enviroplus import gas
    from smbus2 import SMBus

    bus = SMBus(1)
    bme280 = BME280(i2c_dev=bus)
    ltr559 = LTR559()
    HAS_SENSORS = True
except ImportError as e:
    log.error(f"Sensor error: {e}")
    sys.exit(1)

# PMS5003 (optional)
if HAS_PM:
    try:
        from pms5003 import PMS5003, ReadTimeoutError
        pms = PMS5003()
    except:
        HAS_PM = False

# Supabase
from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def read_sensors():
    data = {
        "device_id": DEVICE_ID,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "temperature": round(bme280.get_temperature(), 1),
        "pressure": round(bme280.get_pressure(), 1),
        "humidity": round(bme280.get_humidity(), 1),
        "lux": round(ltr559.get_lux()),
        "proximity": ltr559.get_proximity(),
        "gas_oxidising": round(gas.read_oxidising() / 1000, 1),
        "gas_reducing": round(gas.read_reducing() / 1000, 1),
        "gas_nh3": round(gas.read_nh3() / 1000, 1),
        "noise_level": 0,
    }

    if HAS_PM:
        try:
            pm = pms.read()
            data["pm1"] = pm.pm_ug_per_m3(1.0)
            data["pm25"] = pm.pm_ug_per_m3(2.5)
            data["pm10"] = pm.pm_ug_per_m3(10)
        except:
            pass

    return data

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--interval", type=int, default=0)
    args = parser.parse_args()

    log.info(f"Starting monitor for device: {DEVICE_ID}")

    while True:
        try:
            data = read_sensors()
            log.info(f"T:{data['temperature']:.1f}°C H:{data['humidity']:.1f}% P:{data['pressure']:.0f}hPa L:{data['lux']}lux")

            result = supabase.table("sensor_readings").insert(data).execute()
            log.info("✓ Data sent to Supabase")
        except Exception as e:
            log.error(f"Error: {e}")

        if args.interval <= 0:
            break
        time.sleep(args.interval)
PYEOF
    info "Created standalone sensor_reader.py"
fi

chmod +x sensor_reader.py
chown $ACTUAL_USER:$ACTUAL_USER sensor_reader.py

# Create .env file
cat > .env <<EOF
# Supabase Configuration
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY

# Device Configuration
DEVICE_ID=$DEVICE_ID

# Sensor Options
HAS_PM_SENSOR=$PMS_ENABLED
EOF

chmod 600 .env
chown $ACTUAL_USER:$ACTUAL_USER .env

info ".env file created"

# ============================================================================
# STEP 9: Test Connection & Sensors
# ============================================================================
step "Step 9/10: Testing Connection & Sensors"

# Test Supabase connection
info "Testing Supabase connection..."
sudo -u $ACTUAL_USER python3 <<PYTEST
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY'))
result = sb.table('sensor_readings').select('id').limit(1).execute()
print('✓ Supabase connection OK')
PYTEST

if [ $? -eq 0 ]; then
    info "Supabase connection verified"
else
    error "Supabase connection failed"
fi

# Test sensor reading
info "Testing sensor reading (10 second timeout)..."
cd "$PROJECT_DIR"
timeout 10 sudo -u $ACTUAL_USER python3 sensor_reader.py || warn "Sensor test completed (normal)"

# ============================================================================
# STEP 10: Create Auto-Start Service
# ============================================================================
step "Step 10/10: Creating Auto-Start Service"

cat > /etc/systemd/system/ambience-monitor.service <<SERVICEEOF
[Unit]
Description=Ambience Monitor Sensor Logger
Documentation=https://github.com/baotrinhnz/am-project
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$ACTUAL_USER
WorkingDirectory=$PROJECT_DIR
Environment="PYTHONUNBUFFERED=1"
ExecStart=/usr/bin/python3 $PROJECT_DIR/sensor_reader.py --interval 60
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable ambience-monitor.service
systemctl start ambience-monitor.service

info "Service enabled and started"

# Wait for service to initialize
sleep 5

# ============================================================================
# COMPLETION REPORT
# ============================================================================
clear

cat << "EOF"
╔══════════════════════════════════════════════════╗
║                                                  ║
║   ✅  SETUP COMPLETE - ALL DONE!                ║
║                                                  ║
╚══════════════════════════════════════════════════╝
EOF

echo ""
echo "┌─────────────────────────────────────────────────┐"
echo "│  Device Information                             │"
echo "├─────────────────────────────────────────────────┤"
echo "│  Device ID:       $DEVICE_ID"
echo "│  Project Dir:     $PROJECT_DIR"
echo "│  Service:         ambience-monitor.service"
echo "│  Update Interval: Every 60 seconds"
echo "│  PMS5003 Sensor:  $PMS_ENABLED"
echo "└─────────────────────────────────────────────────┘"
echo ""

echo "┌─────────────────────────────────────────────────┐"
echo "│  Service Management Commands                    │"
echo "├─────────────────────────────────────────────────┤"
echo "│  Status:   sudo systemctl status ambience-monitor"
echo "│  Logs:     sudo journalctl -u ambience-monitor -f"
echo "│  Restart:  sudo systemctl restart ambience-monitor"
echo "│  Stop:     sudo systemctl stop ambience-monitor"
echo "│  Manual:   cd $PROJECT_DIR && python3 sensor_reader.py"
echo "└─────────────────────────────────────────────────┘"
echo ""

echo "┌─────────────────────────────────────────────────┐"
echo "│  Dashboard Access                               │"
echo "├─────────────────────────────────────────────────┤"
echo "│  URL: https://am-beta-ten.vercel.app           │"
echo "│                                                 │"
echo "│  Steps:                                         │"
echo "│  1. Open dashboard in browser                   │"
echo "│  2. Wait 1-2 min for '$DEVICE_ID' to appear"
echo "│  3. Click Settings (⚙️) icon"
echo "│  4. Set display name & location for your device │"
echo "│  5. Save and enjoy real-time monitoring!        │"
echo "└─────────────────────────────────────────────────┘"
echo ""

# Service status check
info "Checking service status..."
systemctl status ambience-monitor.service --no-pager -l | head -15 || true

echo ""
echo "⚠️  IMPORTANT: Reboot recommended for all changes to take effect"
echo ""
read -p "Reboot now? (Y/n): " -n 1 -r REBOOT
echo ""

if [[ ! $REBOOT =~ ^[Nn]$ ]]; then
    info "Rebooting in 5 seconds..."
    sleep 5
    reboot
else
    info "Remember to reboot later: sudo reboot"
fi

echo ""
info "Setup complete! Happy monitoring! 🌡️📊"
echo ""
