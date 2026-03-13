# 📁 Project Folder Structure

## 🎯 Organization Overview
The project has been organized into clear functional folders for better maintenance.

## 📂 Folder Structure

```
C:\AM\
│
├── 🎵 music-recognition/      # Music detection features
│   ├── monitor_music.js       # Real-time music detection monitor
│   └── check_pi_connection.js # Test Pi connection and music detection
│
├── 🌡️ ambience-monitoring/    # Environmental sensor monitoring
│   └── dashboard.jsx          # Dashboard UI component
│
├── 🔧 utilities/              # Helper scripts and tools
│   ├── ssh_commands.txt       # SSH command reference
│   ├── ssh_pi.py             # Python SSH automation
│   ├── copy_and_run_pi.bat   # Copy files to Pi script
│   ├── restart_pi_music.ps1  # PowerShell restart script
│   └── fix_pi_audio.sh       # Audio setup script
│
├── 📚 documentation/          # All documentation files
│   ├── README.md              # Main project README
│   ├── ARCHITECTURE.md       # System architecture
│   ├── PROJECT_INFO.md       # Project information
│   └── PROJECT_SUMMARY.md    # Project summary
│
├── 📦 dashboard/              # Next.js dashboard application
│   ├── app/                  # App router
│   ├── components/           # React components
│   │   ├── MusicDetections.js
│   │   ├── MusicListeningModal.js
│   │   └── SongDetailsModal.js
│   ├── lib/                  # Libraries
│   └── public/              # Static assets
│
├── 🍓 raspberry-pi/          # Raspberry Pi scripts
│   ├── music_recognizer.py   # Music recognition module (20s recording)
│   ├── music_manual_trigger.py # Command listener service
│   ├── sensor_reader.py      # Sensor data collector
│   ├── .env                  # Environment variables
│   └── MUSIC_RECOGNITION_SETUP.md
│
├── 💾 supabase/              # Database scripts and migrations
│   ├── migrations/           # SQL migration files
│   │   ├── create_music_detections_table.sql
│   │   └── create_device_commands_table.sql
│   └── setup scripts
│
├── 🗑️ Unuse/                 # Archived/unused files
│   ├── fix-pi-*.ps1         # Old Pi fix scripts
│   ├── setup_database.py    # Old setup scripts
│   ├── run_sql.py          # Old SQL runner
│   ├── view_logs.bat       # Old log viewer
│   └── *.png               # Old images
│
└── 📋 Core Files
    ├── .gitignore           # Git ignore rules
    ├── package.json         # Node.js dependencies
    └── FOLDER_STRUCTURE.md  # This file

```

## 🎯 Active Features

### 1. Music Recognition (✅ Working)
- **Location:** `music-recognition/` and `raspberry-pi/`
- **Function:** Detect and identify music using MEMS microphone
- **Status:** Fully functional with 20-second recording

### 2. Ambience Monitoring (✅ Working)
- **Location:** `dashboard/` and `raspberry-pi/sensor_reader.py`
- **Function:** Monitor temperature, humidity, light, noise levels
- **Status:** Real-time data to Supabase

### 3. Dashboard (✅ Running)
- **Location:** `dashboard/`
- **URL:** http://localhost:3000
- **Status:** Dev server running (Background ID: 888771)

## 🚀 Quick Commands

### Start Dashboard
```bash
cd dashboard
npm run dev
```

### Monitor Music Detection
```bash
node music-recognition/monitor_music.js
```

### Test Pi Connection
```bash
node music-recognition/check_pi_connection.js
```

## 📝 Notes
- Pi files are in `/home/am/` directory (NOT in enviro folder)
- Service is listening for commands from Supabase
- RLS has been disabled for testing
- 20-second recording is configured