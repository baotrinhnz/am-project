#!/bin/bash
# ============================================================================
# Quick Fix: Enable MEMS Microphone on Existing Raspberry Pi
# ============================================================================
# Run this on your currently running Pi to enable noise sensor
#
# Usage:
#   sudo bash fix_noise_sensor.sh
# ============================================================================

set -e

if [ "$EUID" -ne 0 ]; then
    echo "Please run with sudo: sudo bash $0"
    exit 1
fi

ACTUAL_USER=${SUDO_USER:-$(whoami)}

echo "=========================================="
echo "  Fixing Noise Sensor (MEMS Microphone)"
echo "=========================================="
echo ""

# Install audio dependencies
echo "[1/4] Installing audio system libraries..."
apt update -qq
apt install -y -qq \
    libportaudio2 \
    portaudio19-dev \
    libatlas-base-dev

echo "✓ Audio libraries installed"

# Install Python packages
echo "[2/4] Installing Python audio packages..."
sudo -u $ACTUAL_USER pip3 install --break-system-packages \
    sounddevice \
    numpy

echo "✓ Python audio packages installed"

# Update sensor_reader.py if needed
echo "[3/4] Updating sensor reader script..."
SCRIPT_DIR="$HOME/ambience-monitor"
if [ -d "$SCRIPT_DIR" ]; then
    cd "$SCRIPT_DIR"
    echo "✓ Found project at $SCRIPT_DIR"
else
    echo "⚠ Project directory not found. Assuming current directory."
fi

# Restart service
echo "[4/4] Restarting ambience-monitor service..."
if systemctl is-active --quiet ambience-monitor; then
    systemctl restart ambience-monitor
    echo "✓ Service restarted"
    sleep 3
    systemctl status ambience-monitor --no-pager -l | head -10
else
    echo "⚠ Service not running. Start manually if needed."
fi

echo ""
echo "=========================================="
echo "  ✅ Fix Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Pull latest code: cd ~/ambience-monitor && git pull"
echo "  2. Restart service: sudo systemctl restart ambience-monitor"
echo "  3. Check logs: sudo journalctl -u ambience-monitor -f"
echo "  4. Wait 1-2 minutes and check dashboard for noise readings"
echo ""
echo "Dashboard: https://am-beta-ten.vercel.app"
echo ""
