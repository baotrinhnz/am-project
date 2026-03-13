#!/bin/bash
# Script to restart music service on Pi

sshpass -p "amam" ssh -o StrictHostKeyChecking=no am@10.0.1.243 << 'EOF'
echo "Stopping old music service..."
pkill -f music_manual_trigger.py 2>/dev/null
pkill -f music_recognizer.py 2>/dev/null
sleep 1

echo "Starting new music service with 20s recording..."
cd ~/enviro || cd /home/am/enviro
nohup python3 music_manual_trigger.py > music.log 2>&1 &
sleep 2

echo "Checking if service is running..."
ps aux | grep music | grep -v grep

echo "Service started! Check logs with: tail -f ~/enviro/music.log"
EOF