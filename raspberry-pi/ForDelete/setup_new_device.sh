#!/bin/bash
# ============================================================================
# Automated Setup Script for New Raspberry Pi Enviro+ Device
# ============================================================================
# This script automatically configures a new Raspberry Pi device with:
# - Auto-generated unique device ID
# - Supabase connection
# - Sensor reader service
# - Auto-start on boot
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/your-repo/main/raspberry-pi/setup_new_device.sh | bash
#   OR
#   bash setup_new_device.sh
# ============================================================================

set -e  # Exit on error

echo "=========================================="
echo "  Ambience Monitor - Device Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    warn "This doesn't appear to be a Raspberry Pi. Continuing anyway..."
fi

# ============================================================================
# 1. Generate Unique Device ID
# ============================================================================
info "Generating unique device ID..."

# Get Raspberry Pi serial number
PI_SERIAL=$(cat /proc/cpuinfo | grep Serial | cut -d ' ' -f 2)
if [ -z "$PI_SERIAL" ]; then
    PI_SERIAL=$(hostname)
fi

# Create device ID: rpi-enviro-<last-8-chars-of-serial>
DEVICE_ID="rpi-enviro-${PI_SERIAL: -8}"
info "Device ID: $DEVICE_ID"

# ============================================================================
# 2. Get Supabase Credentials
# ============================================================================
echo ""
info "Supabase Configuration"
echo "You need the following from your Supabase project:"
echo "  1. Project URL (e.g., https://xxx.supabase.co)"
echo "  2. Service Role Key (from Project Settings > API)"
echo ""

read -p "Enter Supabase URL: " SUPABASE_URL
read -p "Enter Supabase Service Role Key: " SUPABASE_KEY

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    error "Supabase credentials are required!"
fi

# ============================================================================
# 3. Install Dependencies
# ============================================================================
info "Installing system dependencies..."
sudo apt update -qq
sudo apt install -y python3-pip git i2c-tools

info "Installing Python packages..."
pip3 install --break-system-packages enviroplus supabase-py python-dotenv requests

# Optional: PMS5003 sensor (if connected)
read -p "Do you have PMS5003 PM sensor connected? (y/N): " HAS_PMS
if [[ "$HAS_PMS" =~ ^[Yy]$ ]]; then
    info "Installing PMS5003 support..."
    pip3 install --break-system-packages pms5003
    PMS_ENABLED="True"
else
    PMS_ENABLED="False"
fi

# ============================================================================
# 4. Enable I2C
# ============================================================================
info "Enabling I2C interface..."
sudo raspi-config nonint do_i2c 0

# ============================================================================
# 5. Download Sensor Reader Script
# ============================================================================
info "Setting up project directory..."
PROJECT_DIR="$HOME/ambience-monitor"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Check if we're in a git repo, if not download files
if [ ! -f "sensor_reader.py" ]; then
    info "Downloading sensor reader script..."
    # Replace with your actual repo URL
    curl -sSL -o sensor_reader.py https://raw.githubusercontent.com/baotrinhnz/am-project/main/raspberry-pi/sensor_reader.py
    chmod +x sensor_reader.py
else
    info "sensor_reader.py already exists"
fi

# ============================================================================
# 6. Create .env File
# ============================================================================
info "Creating .env configuration..."
cat > .env <<EOF
# Supabase credentials
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_KEY=$SUPABASE_KEY

# Device identifier (auto-generated)
DEVICE_ID=$DEVICE_ID

# PMS5003 sensor (optional)
HAS_PM_SENSOR=$PMS_ENABLED
EOF

info ".env file created with device ID: $DEVICE_ID"

# ============================================================================
# 7. Test Connection
# ============================================================================
info "Testing Supabase connection..."
python3 - <<PYEOF
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))

# Test query
result = supabase.table("sensor_readings").select("id").limit(1).execute()
print("✓ Connection successful!")
PYEOF

if [ $? -ne 0 ]; then
    error "Failed to connect to Supabase. Please check your credentials."
fi

# ============================================================================
# 8. Create Systemd Service (Auto-start on Boot)
# ============================================================================
info "Creating systemd service for auto-start..."

sudo tee /etc/systemd/system/ambience-monitor.service > /dev/null <<EOF
[Unit]
Description=Ambience Monitor Sensor Logger
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/python3 $PROJECT_DIR/sensor_reader.py --interval 60
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

info "Enabling and starting service..."
sudo systemctl daemon-reload
sudo systemctl enable ambience-monitor.service
sudo systemctl start ambience-monitor.service

# ============================================================================
# 9. Verify Installation
# ============================================================================
echo ""
info "Waiting 5 seconds for first reading..."
sleep 5

info "Checking service status..."
sudo systemctl status ambience-monitor.service --no-pager -l || true

echo ""
echo "=========================================="
echo "  ✓ Setup Complete!"
echo "=========================================="
echo ""
echo "Device ID: $DEVICE_ID"
echo "Project Directory: $PROJECT_DIR"
echo ""
echo "Useful Commands:"
echo "  - Check status:  sudo systemctl status ambience-monitor"
echo "  - View logs:     sudo journalctl -u ambience-monitor -f"
echo "  - Restart:       sudo systemctl restart ambience-monitor"
echo "  - Stop:          sudo systemctl stop ambience-monitor"
echo ""
echo "Next Steps:"
echo "  1. Go to your dashboard: https://am-beta-ten.vercel.app"
echo "  2. Click Settings (⚙️) to customize device name and location"
echo "  3. View real-time data from your new device!"
echo ""
info "Device will start sending data every 60 seconds automatically."
echo ""
