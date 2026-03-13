#!/bin/bash
# Setup script for Music Recognition on Raspberry Pi with Enviro+

echo "==============================================="
echo "Music Recognition Setup for Enviro+"
echo "==============================================="

# Update system
echo "1. Updating system packages..."
sudo apt-get update

# Install audio dependencies
echo "2. Installing audio libraries..."
sudo apt-get install -y \
    alsa-utils \
    portaudio19-dev \
    libportaudio2 \
    python3-pyaudio

# Install Python packages
echo "3. Installing Python packages..."
pip3 install --upgrade \
    sounddevice \
    numpy \
    scipy \
    requests \
    python-dotenv

# Configure I2S for MEMS microphone (if needed)
echo "4. Checking I2S configuration..."
if ! grep -q "dtparam=i2s=on" /boot/config.txt; then
    echo "Enabling I2S in /boot/config.txt..."
    echo "dtparam=i2s=on" | sudo tee -a /boot/config.txt
    echo "⚠️  I2S enabled. Reboot required!"
    REBOOT_REQUIRED=true
fi

# Test microphone availability
echo "5. Testing microphone..."
echo "Available recording devices:"
arecord -l

# Create .env template if not exists
if [ ! -f ".env" ]; then
    echo "6. Creating .env template..."
    cat > .env.template << EOF
# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_KEY=your_service_key_here

# Device Configuration
DEVICE_ID=rpi-enviro-01
TEMP_COMPENSATION_FACTOR=2.25

# AudD Music Recognition API
AUDD_API_TOKEN=your_audd_token_here
EOF
    echo "✓ Created .env.template - copy to .env and add your credentials"
fi

echo ""
echo "==============================================="
echo "Setup Complete!"
echo "==============================================="
echo ""
echo "Next steps:"
echo "1. Get AudD API token from: https://dashboard.audd.io/"
echo "2. Add AUDD_API_TOKEN to your .env file"
echo "3. Test music recognition:"
echo "   python3 test_audd.py"
echo "   python3 music_recognizer.py --check"
echo "   python3 music_recognizer.py --record"
echo "4. Run with music detection:"
echo "   python3 sensor_reader.py --music --interval 60"
echo ""

if [ "$REBOOT_REQUIRED" = true ]; then
    echo "⚠️  IMPORTANT: Reboot required for I2S!"
    echo "Run: sudo reboot"
fi