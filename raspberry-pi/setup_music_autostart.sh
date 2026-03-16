#!/bin/bash

echo "Setting up auto-start for Music Recognition service..."

# Copy music recognition service
echo "Installing music-recognition service..."
sudo cp music-recognition.service /etc/systemd/system/
sudo chmod 644 /etc/systemd/system/music-recognition.service

# Reload systemd
echo "Reloading systemd..."
sudo systemctl daemon-reload

# Enable music recognition service
echo "Enabling music-recognition service..."
sudo systemctl enable music-recognition.service

# Start music recognition service
echo "Starting music-recognition service..."
sudo systemctl start music-recognition.service

# Check status
echo ""
echo "=== Music Recognition Service Status ==="
sudo systemctl status music-recognition.service --no-pager

echo ""
echo "✅ Music Recognition setup complete! Service will auto-start on boot."
echo ""
echo "Useful commands:"
echo "  - Check status: sudo systemctl status music-recognition"
echo "  - View logs: sudo journalctl -u music-recognition -f"
echo "  - Restart: sudo systemctl restart music-recognition"
echo "  - Stop: sudo systemctl stop music-recognition"