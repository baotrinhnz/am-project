#!/bin/bash
# Script to fix audio dependencies on Pi

echo "========================================"
echo "  Fixing Audio Dependencies on Pi"
echo "========================================"
echo ""
echo "Please run this command to SSH into Pi:"
echo ""
echo "ssh am@10.0.1.243"
echo "Password: amam"
echo ""
echo "Then copy and paste these commands:"
echo "========================================"

cat << 'COMMANDS'
# Update system
sudo apt-get update

# Install audio dependencies
sudo apt-get install -y portaudio19-dev alsa-utils python3-pip

# Install Python audio packages
pip3 install sounddevice numpy scipy

# Install other required packages
pip3 install supabase python-dotenv requests

# Test if imports work
python3 -c "
try:
    import sounddevice
    print('✓ sounddevice installed successfully')
except:
    print('× sounddevice not available, will use arecord')
"

# Check if arecord is available as fallback
which arecord && echo "✓ arecord is available as fallback"

# Kill old process
pkill -f music_manual_trigger.py

# Start the music service
echo "Starting music service with 20 second recording..."
python3 music_manual_trigger.py
COMMANDS