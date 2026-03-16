#!/bin/bash
# ============================================================================
# MUSIC RECOGNITION ADD-ON SETUP
# For Raspberry Pi + Enviro+ (MEMS Microphone)
# ============================================================================
# Run this AFTER do_it_all.sh to add music detection capabilities
#
# This script handles:
#   ✅ Install audio processing libraries
#   ✅ Enable I2S for MEMS microphone
#   ✅ Configure AudD API for music recognition
#   ✅ Download music detection scripts
#   ✅ Setup and start music detection service
#
# Usage:
#   bash setup_music_addon.sh
# ============================================================================

set -e  # Exit on error

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
╔════════════════════════════════════════════╗
║   Music Recognition Add-on Setup          ║
║   For Ambience Monitor + MEMS Microphone  ║
╚════════════════════════════════════════════╝
EOF
echo ""

# Check if running as regular user (not root)
if [ "$EUID" -eq 0 ]; then
    warn "Running as root, switching to user mode..."
    ACTUAL_USER=${SUDO_USER:-am}
else
    ACTUAL_USER=$(whoami)
fi

USER_HOME=$(eval echo ~$ACTUAL_USER)
info "User: $ACTUAL_USER"
info "Home: $USER_HOME"

# ============================================================================
# STEP 1: Check Prerequisites
# ============================================================================
step "Step 1/7: Checking Prerequisites"

# Check if sensor_reader.py exists (do_it_all.sh was run)
if [ ! -f "$USER_HOME/sensor_reader.py" ] && [ ! -f "$USER_HOME/ambience-monitor/sensor_reader.py" ]; then
    warn "sensor_reader.py not found. Did you run do_it_all.sh first?"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if .env exists
ENV_FILE="$USER_HOME/.env"
if [ ! -f "$ENV_FILE" ]; then
    warn ".env file not found at $ENV_FILE"
    ENV_FILE="$USER_HOME/ambience-monitor/.env"
    if [ ! -f "$ENV_FILE" ]; then
        error "No .env file found. Please run do_it_all.sh first or create .env manually"
    fi
fi

info "Found .env at: $ENV_FILE"

# Load existing Supabase credentials
if [ -f "$ENV_FILE" ]; then
    export $(cat "$ENV_FILE" | grep -v '^#' | xargs)
    info "Loaded existing Supabase credentials"
fi

# ============================================================================
# STEP 2: Install Audio Processing Libraries
# ============================================================================
step "Step 2/7: Installing Audio Processing Libraries"

info "Installing Python audio packages..."
pip3 install --break-system-packages \
    scipy \
    sounddevice \
    numpy \
    requests \
    python-dotenv \
    supabase 2>&1 | grep -v "already satisfied" || true

info "Audio processing libraries installed"

# Install system audio tools if missing
if ! command -v arecord &> /dev/null; then
    info "Installing ALSA utils..."
    sudo apt-get update -qq
    sudo apt-get install -y alsa-utils
fi

# ============================================================================
# STEP 3: Enable I2S for MEMS Microphone
# ============================================================================
step "Step 3/7: Configuring MEMS Microphone (I2S)"

# Check if I2S is already enabled
if grep -q "^dtparam=i2s=on" /boot/firmware/config.txt 2>/dev/null || \
   grep -q "^dtparam=i2s=on" /boot/config.txt 2>/dev/null; then
    info "I2S already enabled"
else
    info "Enabling I2S interface..."
    echo "dtparam=i2s=on" | sudo tee -a /boot/firmware/config.txt > /dev/null || \
    echo "dtparam=i2s=on" | sudo tee -a /boot/config.txt > /dev/null
    warn "Reboot required for I2S to take effect"
    REBOOT_NEEDED=true
fi

# Check if MEMS mic overlay is configured
if grep -q "dtoverlay=adau7002-simple" /boot/firmware/config.txt 2>/dev/null || \
   grep -q "dtoverlay=adau7002-simple" /boot/config.txt 2>/dev/null; then
    info "MEMS microphone overlay already configured"
else
    info "Adding MEMS microphone overlay..."
    echo "dtoverlay=adau7002-simple" | sudo tee -a /boot/firmware/config.txt > /dev/null || \
    echo "dtoverlay=adau7002-simple" | sudo tee -a /boot/config.txt > /dev/null
    warn "Reboot required for MEMS mic to work"
    REBOOT_NEEDED=true
fi

# Test if microphone is available
if arecord -l 2>/dev/null | grep -q "adau7002"; then
    info "MEMS microphone detected (adau7002)"
else
    warn "MEMS microphone not detected yet (may need reboot)"
fi

# ============================================================================
# STEP 4: Configure AudD API
# ============================================================================
step "Step 4/7: Configuring AudD Music Recognition API"

echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  AudD.io provides music recognition service            │"
echo "│                                                         │"
echo "│  Get your free API token at:                           │"
echo "│  https://dashboard.audd.io/                            │"
echo "│                                                         │"
echo "│  Free tier: 300 requests/month                         │"
echo "└─────────────────────────────────────────────────────────┘"
echo ""

# Check if AUDD_API_TOKEN already exists in .env
if grep -q "^AUDD_API_TOKEN=" "$ENV_FILE"; then
    existing_token=$(grep "^AUDD_API_TOKEN=" "$ENV_FILE" | cut -d'=' -f2)
    if [ ! -z "$existing_token" ]; then
        info "Found existing AudD token: ${existing_token:0:10}..."
        read -p "Use existing token? (Y/n): " -n 1 -r USE_EXISTING
        echo
        if [[ ! $USE_EXISTING =~ ^[Nn]$ ]]; then
            AUDD_TOKEN="$existing_token"
        fi
    fi
fi

# Ask for new token if needed
if [ -z "$AUDD_TOKEN" ]; then
    read -p "Enter your AudD API Token: " AUDD_TOKEN
    if [ -z "$AUDD_TOKEN" ]; then
        warn "No AudD token provided. Music recognition will not work!"
        AUDD_TOKEN="YOUR_AUDD_TOKEN_HERE"
    fi

    # Add to .env if not exists
    if ! grep -q "^AUDD_API_TOKEN=" "$ENV_FILE"; then
        echo "" >> "$ENV_FILE"
        echo "# Music Recognition" >> "$ENV_FILE"
        echo "AUDD_API_TOKEN=$AUDD_TOKEN" >> "$ENV_FILE"
        info "AudD token added to .env"
    else
        # Update existing token
        sed -i "s/^AUDD_API_TOKEN=.*/AUDD_API_TOKEN=$AUDD_TOKEN/" "$ENV_FILE"
        info "AudD token updated in .env"
    fi
fi

# ============================================================================
# STEP 5: Download Music Detection Scripts
# ============================================================================
step "Step 5/7: Downloading Music Detection Scripts"

cd "$USER_HOME"

GITHUB_RAW="https://raw.githubusercontent.com/baotrinhnz/am-project/main/raspberry-pi"

# Download music_manual_trigger.py
info "Downloading music_manual_trigger.py..."
if curl -sSL -f "$GITHUB_RAW/music_manual_trigger.py" -o music_manual_trigger.py 2>/dev/null; then
    info "Downloaded music_manual_trigger.py"
else
    error "Failed to download music_manual_trigger.py"
fi

# Download music_recognizer_fixed.py
info "Downloading music_recognizer_fixed.py..."
if curl -sSL -f "$GITHUB_RAW/music_recognizer_fixed.py" -o music_recognizer_fixed.py 2>/dev/null; then
    info "Downloaded music_recognizer_fixed.py"
else
    # Try alternative name
    if curl -sSL -f "$GITHUB_RAW/music_recognizer.py" -o music_recognizer.py 2>/dev/null; then
        warn "Downloaded music_recognizer.py (may need fixes for MEMS mic)"
        # Create fixed version
        cp music_recognizer.py music_recognizer_fixed.py
        sed -i "s/plughw:0,0/hw:3,0/g" music_recognizer_fixed.py
        sed -i "s/16000/48000/g" music_recognizer_fixed.py
        info "Created music_recognizer_fixed.py with MEMS mic fixes"
    else
        error "Failed to download music recognizer module"
    fi
fi

# Fix import in music_manual_trigger.py to use fixed version
sed -i "s/from music_recognizer import/from music_recognizer_fixed import/g" music_manual_trigger.py 2>/dev/null || true

# Make scripts executable
chmod +x music_manual_trigger.py music_recognizer_fixed.py
info "Scripts downloaded and made executable"

# ============================================================================
# STEP 6: Test Music Detection
# ============================================================================
step "Step 6/7: Testing Music Detection"

# Test microphone
info "Testing MEMS microphone..."
if timeout 5 arecord -D hw:3,0 -f S32_LE -r 48000 -c 2 -d 3 test_mic.wav 2>/dev/null; then
    if [ -f test_mic.wav ] && [ $(stat -c%s test_mic.wav) -gt 1000 ]; then
        info "Microphone test successful"
        rm -f test_mic.wav
    else
        warn "Microphone test produced no audio"
    fi
else
    warn "Microphone test failed (may need reboot)"
fi

# Test AudD connection
info "Testing AudD API connection..."
python3 << PYTEST
import requests
token = "$AUDD_TOKEN"
if token and token != "YOUR_AUDD_TOKEN_HERE":
    # Test with a sample YouTube video
    response = requests.post('https://api.audd.io/', data={
        'api_token': token,
        'url': 'https://www.youtube.com/watch?v=0VjIjW4GlUZAMYd2vXMi3b',
        'return': 'spotify'
    }, timeout=10)
    result = response.json()
    if result.get('status') == 'success':
        print('✓ AudD API connection verified')
    else:
        print('⚠ AudD API error:', result.get('error', {}).get('error_message', 'Unknown'))
else:
    print('⚠ AudD token not configured')
PYTEST

# Quick test of the module
info "Testing music recognizer module..."
python3 -c "from music_recognizer_fixed import MusicRecognizer; print('✓ Module import OK')" 2>/dev/null || \
    warn "Module import failed (check dependencies)"

# ============================================================================
# STEP 7: Start Music Detection Service
# ============================================================================
step "Step 7/7: Starting Music Detection Service"

# Check if already running
if pgrep -f "music_manual_trigger.py" > /dev/null; then
    warn "Music service already running"
    read -p "Restart service? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pkill -f "music_manual_trigger.py"
        sleep 2
    else
        info "Keeping existing service"
        SKIP_START=true
    fi
fi

if [ -z "$SKIP_START" ]; then
    info "Starting music detection service..."
    cd "$USER_HOME"
    nohup python3 music_manual_trigger.py > music_service.log 2>&1 &
    SERVICE_PID=$!
    sleep 3

    # Check if service started successfully
    if ps -p $SERVICE_PID > /dev/null; then
        info "Music service started (PID: $SERVICE_PID)"

        # Show last few log lines
        echo ""
        echo "Service log:"
        tail -5 music_service.log
    else
        error "Music service failed to start. Check music_service.log"
    fi
fi

# ============================================================================
# COMPLETION REPORT
# ============================================================================
clear

cat << "EOF"
╔══════════════════════════════════════════════════╗
║                                                  ║
║   🎵  MUSIC DETECTION SETUP COMPLETE!  🎵       ║
║                                                  ║
╚══════════════════════════════════════════════════╝
EOF

echo ""
echo "┌─────────────────────────────────────────────────┐"
echo "│  Configuration Summary                          │"
echo "├─────────────────────────────────────────────────┤"
echo "│  MEMS Microphone: hw:3,0 (adau7002)             │"
echo "│  AudD API Token:  ${AUDD_TOKEN:0:10}...        │"
echo "│  Service PID:     ${SERVICE_PID:-Not started}   │"
echo "│  Log file:        ~/music_service.log           │"
echo "└─────────────────────────────────────────────────┘"
echo ""

echo "┌─────────────────────────────────────────────────┐"
echo "│  Test Commands                                  │"
echo "├─────────────────────────────────────────────────┤"
echo "│  Test microphone:                               │"
echo "│    python3 music_recognizer_fixed.py --check    │"
echo "│                                                 │"
echo "│  Test recording (play music first!):            │"
echo "│    python3 music_recognizer_fixed.py --record   │"
echo "│                                                 │"
echo "│  Test service:                                  │"
echo "│    python3 music_manual_trigger.py --test       │"
echo "└─────────────────────────────────────────────────┘"
echo ""

echo "┌─────────────────────────────────────────────────┐"
echo "│  Service Management                             │"
echo "├─────────────────────────────────────────────────┤"
echo "│  View logs:                                     │"
echo "│    tail -f ~/music_service.log                  │"
echo "│                                                 │"
echo "│  Restart service:                               │"
echo "│    pkill -f music_manual_trigger.py             │"
echo "│    nohup python3 music_manual_trigger.py > \\    │"
echo "│      music_service.log 2>&1 &                   │"
echo "│                                                 │"
echo "│  Check status:                                  │"
echo "│    ps aux | grep music_manual_trigger           │"
echo "└─────────────────────────────────────────────────┘"
echo ""

echo "┌─────────────────────────────────────────────────┐"
echo "│  Dashboard Usage                                │"
echo "├─────────────────────────────────────────────────┤"
echo "│  1. Open: https://am-dashboard-ruddy.vercel.app │"
echo "│  2. Select device: rpi-enviro-01                │"
echo "│  3. Play music near the Raspberry Pi            │"
echo "│  4. Click 'Listen Now' button                   │"
echo "│  5. Wait 10-15 seconds for detection            │"
echo "└─────────────────────────────────────────────────┘"
echo ""

if [ ! -z "$REBOOT_NEEDED" ]; then
    warn "IMPORTANT: Reboot required for MEMS microphone to work properly!"
    echo ""
    read -p "Reboot now? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        info "Rebooting in 5 seconds..."
        sleep 5
        sudo reboot
    else
        warn "Remember to reboot later: sudo reboot"
    fi
else
    info "Setup complete! Music detection is ready! 🎵"
fi

echo ""
info "Happy music detecting! 🎶🎵🎶"
echo ""