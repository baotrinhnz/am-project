# 🎵 Music Recognition Setup Guide

Setup music recognition feature for Enviro+ using the MEMS microphone and AudD API.

## Features

- **Manual detection via dashboard button** - Click "Listen Now" to trigger detection
- Automatic music detection using MEMS microphone on Enviro+
- Song identification with title, artist, album information
- Spotify and Apple Music links when available
- Real-time display on dashboard with modal feedback
- Historical tracking of all detected songs
- Remote control from dashboard

## Prerequisites

- Raspberry Pi with Enviro+ HAT installed
- Internet connection
- AudD API account (free tier available)

## Quick Setup

### 1. Get AudD API Token

1. Sign up at: https://dashboard.audd.io/
2. Get your API token from dashboard
3. You get 300 free requests to start

### 2. Install on Raspberry Pi

```bash
# SSH into your Raspberry Pi
ssh pi@your-raspberry-ip

# Navigate to project directory
cd /path/to/am-project/raspberry-pi

# Run setup script
chmod +x setup_music_recognition.sh
./setup_music_recognition.sh
```

### 3. Configure Environment

Add to your `.env` file:
```env
# AudD Music Recognition
AUDD_API_TOKEN=bf5680b0ff4a4ddedc45cdb552c5be00
```

### 4. Create Database Table

Run the migration in Supabase:
```sql
-- Run: supabase/migrations/create_music_detections_table.sql
```

Or use the migration script:
```bash
cd supabase
node run_migration.js
```

### 5. Test the Setup

```bash
# Test API connection
python3 test_audd.py

# Check microphone
python3 music_recognizer.py --check

# Test recording (play music nearby!)
python3 music_recognizer.py --record --duration 10
```

## Usage

### Method 1: Manual Detection via Dashboard Button (NEW!)

1. **Setup command listener on Raspberry Pi:**
```bash
# Run this in a separate terminal or as a service
python3 music_manual_trigger.py
```

2. **Use the dashboard:**
- Open your dashboard
- Find the "Music Detected" panel
- Click the **"🎤 Listen Now"** button
- A modal will appear showing "Listening to music..."
- Play music near the sensor
- The detected song will appear in the modal
- Click links to open in Spotify/Apple Music

### Method 2: Automatic Detection

```bash
# Basic usage - detect music every 5 minutes
python3 sensor_reader.py --music --interval 60

# Custom detection interval (every 2 minutes)
python3 sensor_reader.py --music --music-interval 120 --interval 60

# With all features
python3 sensor_reader.py --music --lcd --interval 60
```

### Method 3: Standalone Music Detection

```bash
# One-time detection
python3 music_recognizer.py --record

# Longer recording for difficult songs
python3 music_recognizer.py --record --duration 15

# Identify from existing audio file
python3 music_recognizer.py --file audio.wav
```

## Troubleshooting

### No Microphone Detected

1. Check I2S is enabled:
```bash
grep i2s /boot/config.txt
# Should show: dtparam=i2s=on
```

2. List audio devices:
```bash
arecord -l
```

3. Test recording:
```bash
arecord -d 5 test.wav
aplay test.wav
```

### Low Audio Quality

The MEMS microphone (SPW2430) has limitations:
- Frequency range: 100Hz - 10kHz
- Low signal level (~100mVpp)

Tips:
- Play music louder
- Move speaker closer to microphone
- Avoid noisy environments
- Use longer recording duration (10-15 seconds)

### API Errors

- **"API token invalid"**: Check AUDD_API_TOKEN in .env
- **"No result"**: Song not in database, try popular music
- **"Rate limit"**: Free tier is 300 requests total

### Python Module Errors

```bash
# Reinstall audio dependencies
sudo apt-get install --reinstall portaudio19-dev
pip3 install --upgrade sounddevice numpy scipy

# Alternative: use arecord method
# The module automatically falls back to arecord if sounddevice fails
```

## Dashboard

The music detections automatically appear in the dashboard:
- Shows last 20 detected songs
- Real-time updates when new songs detected
- Links to Spotify/Apple Music
- Detection timestamp

## API Limits & Pricing

**AudD Free Tier:**
- 300 total requests (not per month)
- After that: $2-5 per 1000 requests

**Tips to Save Requests:**
- Use noise threshold detection (already implemented)
- Increase music-interval (default 5 minutes)
- Only enable when needed

## Advanced Configuration

### Noise Threshold

Edit in `sensor_reader.py` line ~424:
```python
if noise_level is None or noise_level > 0.01:  # Adjust threshold
```

### Recording Duration

Edit in `music_recognizer.py` line ~50:
```python
self.duration = 10  # Seconds to record
```

### Sample Rate

Edit in `music_recognizer.py` line ~49:
```python
self.sample_rate = 16000  # 16kHz is optimal
```

## Files Structure

```
raspberry-pi/
├── music_recognizer.py    # Core music recognition module
├── test_audd.py           # API test script
├── sensor_reader.py       # Updated with music detection
├── setup_music_recognition.sh  # Setup script
└── .env                   # Configuration (add AUDD_API_TOKEN)

dashboard/
└── components/
    └── MusicDetections.js # Dashboard component

supabase/
└── migrations/
    └── create_music_detections_table.sql
```

## Future Improvements

- [ ] Add genre detection
- [ ] Implement local caching to avoid duplicate detections
- [ ] Add volume-based triggering
- [ ] Support for multiple music APIs
- [ ] Export detected songs to playlist
- [ ] Add BPM detection
- [ ] Implement mood analysis

## Support

- AudD Documentation: https://docs.audd.io/
- Enviro+ Guide: https://learn.pimoroni.com/enviro-plus
- Project Issues: Create issue in repository