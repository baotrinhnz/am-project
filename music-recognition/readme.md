TÀI LIỆU HỆ THỐNG MUSIC DETECTION
🗂️ CẤU TRÚC FILE TRÊN RASPBERRY PI
/home/am/
├── .env                              # Environment variables
├── music_manual_trigger.py           # Service chính (đang chạy)
├── music_recognizer.py               # Module cũ (không dùng)
├── music_recognizer_fixed.py         # Module đã fix (ĐANG DÙNG)
├── music_manual_trigger_fixed.py     # Version khác (backup)
└── music_service.log                 # Log file của service
🔧 1. FILE CHÍNH: music_manual_trigger.py
Chức năng:
Polling commands từ Supabase mỗi 2 giây
Khi có command detect_music → gọi module recording
Update kết quả về Supabase
Import module đã fix:
from music_recognizer_fixed import MusicRecognizer  # Dùng module fixed
Chạy service:
# Start service
nohup python3 music_manual_trigger.py > music_service.log 2>&1 &

# Check process
ps aux | grep music_manual_trigger

# View logs
tail -f music_service.log
🎤 2. MODULE RECORDING: music_recognizer_fixed.py
Đặc điểm quan trọng:
# MEMS microphone settings
self.device = "hw:3,0"    # Card 3, device 0
self.sample_rate = 48000  # 48kHz (bắt buộc)
self.channels = 2         # Stereo (bắt buộc)
self.format = "S32_LE"    # 32-bit (bắt buộc)
Flow xử lý:
Record với arecord -D hw:3,0 -f S32_LE -r 48000 -c 2
Convert 32-bit stereo → 16-bit mono
Gửi file WAV lên AudD API
Trả về kết quả nhận dạng
Test độc lập:
# Test microphone
python3 music_recognizer_fixed.py --check

# Test recording (phát nhạc trước)
python3 music_recognizer_fixed.py --record --duration 10
🌐 3. DASHBOARD API: /dashboard/app/api/detect-music/route.js
Flow:
1. Nhận request với deviceId
2. Insert command vào device_commands table:
   {
     device_id: 'rpi-enviro-01',
     command: 'detect_music',
     status: 'pending'
   }
3. Poll kết quả (30 giây timeout)
4. Trả về song data hoặc error
💾 4. DATABASE TABLES (Supabase)
device_commands:
- id: UUID
- device_id: 'rpi-enviro-01'
- command: 'detect_music'
- status: 'pending' → 'processing' → 'completed'
- result: JSON (song data hoặc error)
music_detections:
- id: UUID
- device_id: String
- title: String
- artist: String
- album: String
- spotify_url: String
- detected_at: Timestamp
🔑 5. ENVIRONMENT VARIABLES
Trên Raspberry Pi (.env):
SUPABASE_URL=https://hqdfdbgupnfgxfxfdvjn.supabase.co
SUPABASE_SERVICE_KEY=eyJ...OLU  # Service role key (quyền write)
DEVICE_ID=rpi-enviro-01
AUDD_API_TOKEN=bf5680b0ff4a4ddedc45cdb552c5be00
Trên Vercel (Dashboard):
NEXT_PUBLIC_SUPABASE_URL=...      # Public
NEXT_PUBLIC_SUPABASE_ANON_KEY=... # Public
SUPABASE_SERVICE_ROLE_KEY=...     # Secret (cho API route)
🚀 6. LỆNH QUẢN LÝ SERVICE
# SSH vào Pi
ssh am@192.168.1.214

# Start service
nohup python3 music_manual_trigger.py > music_service.log 2>&1 &

# Stop service
pkill -f music_manual_trigger.py

# Restart service
pkill -f music_manual_trigger.py
sleep 2
nohup python3 music_manual_trigger.py > music_service.log 2>&1 &

# Monitor logs
tail -f music_service.log

# Test trực tiếp (không qua dashboard)
python3 music_manual_trigger.py --test
🐛 7. DEBUG & TROUBLESHOOTING
Kiểm tra microphone:
# List devices
arecord -l

# Test recording
arecord -D hw:3,0 -f S32_LE -r 48000 -c 2 -d 5 test.wav
Test AudD API:
python3 music_recognizer_fixed.py --record --duration 10
Check Supabase connection:
python3 -c "
from supabase import create_client
import os
from dotenv import load_dotenv
load_dotenv()
supabase = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY'))
print('Connection OK!')
"
📊 8. MONITORING COMMANDS
# Xem commands đang pending
python3 -c "
from supabase import create_client
url = 'https://hqdfdbgupnfgxfxfdvjn.supabase.co'
key = 'eyJ...OLU'
supabase = create_client(url, key)
result = supabase.table('device_commands').select('*').eq('status', 'pending').execute()
print(result.data)
"

# Xem music detections gần đây
python3 -c "
from supabase import create_client
url = 'https://hqdfdbgupnfgxfxfdvjn.supabase.co'
key = 'eyJ...OLU'
supabase = create_client(url, key)
result = supabase.table('music_detections').select('*').order('detected_at', desc=True).limit(5).execute()
for song in result.data:
    print(f\"{song['detected_at']}: {song['title']} - {song['artist']}\")
"
✨ 9. WORKFLOW HOÀN CHỈNH
1. User click "Listen Now" trên Das

2. Dashboard API tạo command trong Supabase
   ↓
3. music_manual_trigger.py polling và thấy command
   ↓
4. Gọi music_recognizer_fixed.py để record
   ↓
5. Record 10 giây với MEMS mic (hw:3,0, S32_LE, 48kHz, stereo)
   ↓
6. Convert sang 16-bit mono
   ↓
7. Gửi file WAV lên AudD API
   ↓
8. Nhận kết quả và lưu vào music_detections table
   ↓
9. Update command status = 'completed'
   ↓
10. Dashboard hiển thị kết quả




PHÂN TÍCH CHI TIẾT CÁC FILE MUSIC DETECTION
⚠️ QUAN TRỌNG: Chỉ có 1 service đang chạy!
Hiện tại CHỈ CÓ music_manual_trigger.py đang chạy làm service chính, và nó import music_recognizer_fixed.py làm module recording.
📊 SO SÁNH CÁC FILE:
File	Vai trò	Đang dùng?	Mô tả
music_manual_trigger.py	Service chính	✅ ĐANG CHẠY	Polling commands từ Supabase
music_recognizer_fixed.py	Module recording	✅ ĐƯỢC IMPORT	Module với MEMS mic fix
music_recognizer.py	Module cũ	❌ KHÔNG DÙNG	Version cũ, sai format
music_manual_trigger_fixed.py	Service độc lập	❌ KHÔNG CHẠY	Backup/alternative version
🔍 CHI TIẾT TỪNG FILE:
1️⃣ music_manual_trigger.py (SERVICE CHÍNH - ĐANG CHẠY)
Đặc điểm:
Import MusicRecognizer từ music_recognizer_fixed.py
Polling commands từ Supabase
Gọi module để record và nhận dạng
Code structure:
from music_recognizer_fixed import MusicRecognizer  # Import module fixed

class MusicCommandListener:
    def __init__(self):
        self.recognizer = MusicRecognizer()  # Dùng module
    
    def process_music_detection_command(self, command):
        result = self.recognizer.record_and_recognize()  # Gọi module
2️⃣ music_recognizer_fixed.py (MODULE - ĐƯỢC IMPORT)
Đặc điểm:
KHÔNG chạy độc lập như service
Được import bởi music_manual_trigger.py
Chứa logic recording với MEMS mic fix
Code structure:
class MusicRecognizer:
    def __init__(self):
        self.device = "hw:3,0"  # MEMS mic settings
        self.format = "S32_LE"
        
    def record_audio_mems(self):
        # Logic recording với arecord
        
    def record_and_recognize(self):
        # Record → Convert → Send to AudD
3️⃣ music_manual_trigger_fixed.py (BACKUP - KHÔNG DÙNG)
Đặc điểm:
Code ĐỘC LẬP (không import module khác)
Tất cả logic trong 1 file
Dùng làm backup hoặc test riêng
Code structure:
# KHÔNG import music_recognizer
# Tự có function record_audio_arecord() riêng

def record_audio_arecord():
    # Logic recording trực tiếp trong file
    cmd = ['arecord', '-D', 'plughw:2,0', ...]  # Note: dùng plughw:2,0
    
def recognize_music_from_file():
    # Logic gửi AudD trực tiếp
Khác biệt: File này dùng plughw:2,0 thay vì hw:3,0!
4️⃣ music_recognizer.py (CŨ - KHÔNG DÙNG)
Vấn đề:
Dùng sai device (plughw:0,0)
Format không phù hợp MEMS mic
Đã được thay thế bởi music_recognizer_fixed.py
🎯 TÓM TẮT KIẾN TRÚC HIỆN TẠI:
                    ĐANG CHẠY
┌─────────────────────────────────────┐
│   music_manual_trigger.py (Service) │
│                                      │
│   - Polling Supabase commands       │
│   - Import và dùng module fixed     │
└──────────────┬──────────────────────┘
               │
               │ import
               ↓
┌─────────────────────────────────────┐
│  music_recognizer_fixed.py (Module) │
│                                      │
│   - Recording với hw:3,0            │
│   - Convert format                  │
│   - Send to AudD API                │
└─────────────────────────────────────┘

        KHÔNG DÙNG (Backup)
┌─────────────────────────────────────┐
│ music_manual_trigger_fixed.py       │
│                                      │
│   - Code độc lập, không import      │
│   - Dùng plughw:2,0 (khác device!)  │
└─────────────────────────────────────┘
⚙️ LỆNH QUẢN LÝ:
# Service hiện tại (music_manual_trigger.py + music_recognizer_fixed.py)
ps aux | grep music_manual_trigger.py  # Check đang chạy

# Nếu muốn test file backup
python3 music_manual_trigger_fixed.py  # Chạy thử (có thể lỗi vì device khác)

# Test module recording riêng
python3 music_recognizer_fixed.py --record
❓ TẠI SAO CÓ NHIỀU FILE?
Evolution của code: Fix dần các vấn đề
Backup versions: Giữ lại phiên bản cũ
Modular vs Monolithic:
music_manual_trigger.py + module = Modular (dễ maintain)
music_manual_trigger_fixed.py = Monolithic (tất cả trong 1 file)
✅ RECOMMENDATION:
Giữ nguyên setup hiện tại:
Service: music_manual_trigger.py
Module: music_recognizer_fixed.py
Backup: Giữ các file khác để reference
Đây là setup tốt nhất và đang hoạt động