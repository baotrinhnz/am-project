#!/bin/bash
# Auto Setup Script for Enviro+ on Raspberry Pi
# Usage: bash auto_setup.sh

set -e  # Exit on error

echo "========================================="
echo "  Enviro+ Auto Setup Script"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}[1/7]${NC} Updating system..."
sudo apt update -y

echo -e "${YELLOW}[2/7]${NC} Installing Enviro+ library..."
if [ ! -d "/home/am/Pimoroni/enviroplus-python" ]; then
    curl -sSL https://get.pimoroni.com/enviroplus | bash -s -- -y
    echo -e "${GREEN}✓${NC} Enviro+ library installed"
else
    echo -e "${GREEN}✓${NC} Enviro+ library already installed"
fi

echo -e "${YELLOW}[3/7]${NC} Installing Python dependencies..."
pip3 install --upgrade pip
pip3 install python-dotenv httpx supabase

echo -e "${YELLOW}[4/7]${NC} Creating project directory..."
mkdir -p ~/enviro-monitor
cd ~/enviro-monitor

echo -e "${YELLOW}[5/7]${NC} Configuring environment variables..."
if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
SUPABASE_URL=https://hqdfdbgupnfgxfxfdvjn.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxZGZkYmd1cG5mZ3hmeGZkdmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ3NzMwNCwiZXhwIjoyMDg4MDUzMzA0fQ.671KyrF-pjUhd_ubv4qHOK5u-E_2j-lIP9Q6dgwTOLU
DEVICE_ID=rpi-enviro-01
EOF
    echo -e "${GREEN}✓${NC} .env file created"
else
    echo -e "${GREEN}✓${NC} .env file already exists"
fi

echo -e "${YELLOW}[6/7]${NC} Setting up systemd service..."
sudo tee /etc/systemd/system/enviro-monitor.service > /dev/null << 'EOF'
[Unit]
Description=Enviro+ Air Quality Monitor
After=network.target

[Service]
Type=simple
User=am
WorkingDirectory=/home/am/enviro-monitor
ExecStart=/usr/bin/python3 /home/am/enviro-monitor/sensor_reader.py --interval 60
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
echo -e "${GREEN}✓${NC} Systemd service configured"

echo -e "${YELLOW}[7/7]${NC} Testing sensor reader..."
if [ -f "sensor_reader.py" ]; then
    echo "Running test..."
    timeout 10s python3 sensor_reader.py --interval 0 || true
    echo -e "${GREEN}✓${NC} Test completed"
else
    echo -e "${YELLOW}⚠${NC}  sensor_reader.py not found. Please copy it to ~/enviro-monitor/"
fi

echo ""
echo "========================================="
echo -e "${GREEN}  Setup Complete!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Copy sensor_reader.py to ~/enviro-monitor/"
echo "2. Test: python3 sensor_reader.py --interval 0"
echo "3. Enable auto-start: sudo systemctl enable enviro-monitor"
echo "4. Start service: sudo systemctl start enviro-monitor"
echo "5. Check status: sudo systemctl status enviro-monitor"
echo ""
