# Folder Structure

```
c:\AM\
│
├── raspberry-pi/
│   ├── sensor_reader.py                     # Enviro+ sensor monitor (always-on service)
│   ├── music_recognizer_with_rotation.py    # Audio recording + AudD fingerprinting
│   ├── music_manual_trigger_rotation.py     # Supabase command listener (always-on service)
│   ├── .env                                 # Pi environment variables
│   └── ForDelete/                           # Archived old scripts
│
├── dashboard/
│   ├── app/
│   │   ├── page.js                          # Main dashboard page
│   │   └── api/
│   │       └── detect-music/route.js        # Music detection API endpoint
│   ├── components/
│   │   ├── MusicDetections.js               # Last 8 detected songs list
│   │   ├── MusicListeningModal.js           # Detect music modal + result display
│   │   ├── BpmWidget.js                     # Ambient beat rate chart
│   │   └── MusicBpmWidget.js                # Music BPM widget
│   ├── lib/
│   │   └── supabase.js                      # Supabase client
│   └── next.config.js                       # Build version (days since 2026-01-01)
│
├── supabase/
│   └── migrations/
│       ├── create_music_detections_table.sql
│       ├── create_device_commands_table.sql
│       └── 001_device_settings.sql
│
├── utilities/
│   └── ssh_pi.py                            # SSH helper (legacy)
│
├── Unuse/                                   # Archived files
│
├── README.md                                # Project overview and setup guide
└── FOLDER_STRUCTURE.md                      # This file
```
