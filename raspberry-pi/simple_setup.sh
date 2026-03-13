#!/bin/bash
# Simple Setup for Enviro+ - Works with Python externally-managed-environment

echo "========================================"
echo "  Enviro+ Simple Setup"
echo "========================================"

# Create project directory
mkdir -p ~/enviro-monitor
cd ~/enviro-monitor

# Copy sensor_reader.py if in home directory
if [ -f ~/sensor_reader.py ]; then
    cp ~/sensor_reader.py ~/enviro-monitor/
    echo "✓ Copied sensor_reader.py"
fi

# Create .env file
cat > .env << 'EOF'
SUPABASE_URL=https://hqdfdbgupnfgxfxfdvjn.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxZGZkYmd1cG5mZ3hmeGZkdmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ3NzMwNCwiZXhwIjoyMDg4MDUzMzA0fQ.671KyrF-pjUhd_ubv4qHOK5u-E_2j-lIP9Q6dgwTOLU
DEVICE_ID=rpi-enviro-01
EOF
echo "✓ Created .env file"

# Install dependencies using --break-system-packages (safe for Raspberry Pi)
echo "Installing Python packages..."
pip3 install --break-system-packages python-dotenv httpx supabase 2>&1 | grep -v "WARNING\|Defaulting"
echo "✓ Python packages installed"

# Test sensor reader
echo ""
echo "Testing sensor reader..."
if [ -f "sensor_reader.py" ]; then
    timeout 10s python3 sensor_reader.py --interval 0 || true
else
    echo "⚠ sensor_reader.py not found in ~/enviro-monitor/"
fi

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Test: cd ~/enviro-monitor && python3 sensor_reader.py --interval 0"
echo "2. Run continuously: python3 sensor_reader.py --interval 60"
echo ""
