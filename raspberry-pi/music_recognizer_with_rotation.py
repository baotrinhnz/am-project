#!/usr/bin/env python3
"""
Music Recognition Module for Enviro+ with File Rotation
========================================================
Records audio from MEMS microphone and identifies songs using AudD API.
Saves recordings to Music_for_delete folder with rotation (max 10 files).

Key design decisions:
- Finds MEMS mic by device NAME (not card number) so reboot doesn't break it
- Records directly in 16-bit mono via plughw (ALSA handles hardware conversion)
- Uploads WAV directly to AudD without any Python-side conversion
- Checks file size before upload, errors if recording is empty
"""

import os
import time
import logging
import logging.handlers
import requests
import subprocess
import glob
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

MIC_LOCK      = Path('/tmp/mic_in_use.lock')
PRIORITY_LOCK = Path('/tmp/music_detection_active.lock')

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("music-recognizer")

# Dedicated detection log — records only recording & AudD events
# Rotates daily, keeps 30 days
_detection_log_path = Path.home() / "music_detection_log.txt"
_detection_handler = logging.handlers.TimedRotatingFileHandler(
    _detection_log_path,
    when="midnight",
    interval=1,
    backupCount=30,
    encoding="utf-8"
)
_detection_handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
))
detection_log = logging.getLogger("music-detection")
detection_log.setLevel(logging.INFO)
detection_log.addHandler(_detection_handler)
detection_log.propagate = False

# Load environment variables
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

AUDD_API_TOKEN = os.getenv("AUDD_API_TOKEN")
DEVICE_ID = os.getenv("DEVICE_ID", "rpi-enviro-01")

FALLBACK_DEVICE = "plughw:adau7002"


def detect_music_mic():
    """Auto-detect USB mic for music recognition.
    Returns (device, format, channels).
    USB mic is more sensitive but needs stereo 44.1kHz conversion for AudD.
    Falls back to adau7002 with S32_LE stereo.
    """
    try:
        result = subprocess.run(['arecord', '-l'], capture_output=True, text=True)
        if result.returncode != 0:
            return FALLBACK_DEVICE, "S32_LE", 2

        import re
        for line in result.stdout.splitlines():
            match = re.match(r'^card\s+\d+:\s+(\S+)', line)
            if match:
                name = match.group(1)
                if name != 'adau7002':
                    device = f"plughw:{name}"
                    log.info(f"USB mic detected: {device} (S16_LE mono)")
                    return device, "S16_LE", 1

        log.info(f"No USB mic found, using MEMS: {FALLBACK_DEVICE}")
        return FALLBACK_DEVICE, "S32_LE", 2
    except Exception as e:
        log.warning(f"Mic detection failed: {e}, using {FALLBACK_DEVICE}")
        return FALLBACK_DEVICE, "S32_LE", 2


class MusicRecognizer:
    """Handles audio recording and music recognition with file rotation."""

    def __init__(self, api_token: str = None):
        self.api_token = api_token or AUDD_API_TOKEN
        if not self.api_token:
            raise ValueError("AUDD_API_TOKEN not provided or found in .env")

        self.duration = 10         # seconds
        self.sample_rate = 48000

        self.device, self.format, self.channels = detect_music_mic()

        # File rotation settings
        self.save_dir = Path.home() / "Music_for_delete"
        self.save_dir.mkdir(exist_ok=True)
        self.max_recordings = 10


    # ------------------------------------------------------------------
    # File rotation helpers
    # ------------------------------------------------------------------

    def get_next_filename(self) -> Path:
        """Get next available filename with rotation (max 10 files)."""
        existing_files = sorted(glob.glob(str(self.save_dir / "music_record*.wav")))

        if len(existing_files) >= self.max_recordings:
            files_to_delete = existing_files[:len(existing_files) - self.max_recordings + 1]
            for f in files_to_delete:
                try:
                    os.remove(f)
                    log.info(f"Deleted old recording: {f}")
                except Exception as e:
                    log.warning(f"Could not delete {f}: {e}")
            existing_files = sorted(glob.glob(str(self.save_dir / "music_record*.wav")))

        next_num = 1
        for f in existing_files:
            try:
                basename = os.path.basename(f)
                if basename.startswith("music_record") and basename.endswith(".wav"):
                    num = int(basename[12:-4])
                    next_num = max(next_num, num + 1)
            except Exception:
                continue

        return self.save_dir / f"music_record{next_num:03d}.wav"

    # ------------------------------------------------------------------
    # Recording
    # ------------------------------------------------------------------

    def record_audio_mems(self) -> Optional[Path]:
        """Record audio using arecord directly to final WAV file.

        Uses plughw so ALSA handles any hardware format differences.
        Records as 16-bit mono — no Python conversion needed.
        """
        output_file = self.get_next_filename()

        log.info(f"Recording {self.duration}s from {self.device} → {output_file}")
        log.info("Make sure music is playing near the device!")
        detection_log.info(f"--- Detection started ---")
        detection_log.info(f"Recording {self.duration}s | device={self.device} | file={output_file.name}")

        PRIORITY_LOCK.touch()
        waited = 0
        while MIC_LOCK.exists() and waited < 6:
            time.sleep(1); waited += 1

        cmd = [
            'arecord',
            '-D', self.device,
            '-f', self.format,
            '-r', str(self.sample_rate),
            '-c', str(self.channels),
            '-d', str(self.duration),
            '-t', 'wav',
            '--buffer-size=16384',  # larger buffer prevents dropouts on Pi
            str(output_file)
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode == 0:
                size = output_file.stat().st_size if output_file.exists() else 0
                log.info(f"Recording done: {output_file} ({size} bytes)")
                detection_log.info(f"Recording done | size={size} bytes | {'OK' if size > 0 else 'EMPTY'}")

                recordings = sorted(glob.glob(str(self.save_dir / "music_record*.wav")))
                log.info(f"Total recordings in folder: {len(recordings)}")
                return output_file
            else:
                log.error(f"arecord failed (device={self.device}): {result.stderr}")
                detection_log.error(f"Recording failed | device={self.device} | {result.stderr.strip()}")
                return None

        except FileNotFoundError:
            log.error("arecord not found. Install with: sudo apt-get install alsa-utils")
            return None
        except Exception as e:
            log.error(f"Recording failed: {e}")
            return None
        finally:
            PRIORITY_LOCK.unlink(missing_ok=True)

    # ------------------------------------------------------------------
    # Recognition
    # ------------------------------------------------------------------

    def recognize_music(self, audio_file: Path = None) -> Dict:
        """Send audio WAV directly to AudD API for recognition.

        Checks file size before upload — returns error if file is empty (0 bytes).
        No format conversion is done; the WAV is uploaded as-is.
        """
        if not audio_file or not Path(audio_file).exists():
            log.error(f"Audio file not found: {audio_file}")
            return {"error": "Audio file not found"}

        # --- File size check ---
        file_size = Path(audio_file).stat().st_size
        if file_size == 0:
            log.error(f"Recording is empty (0 bytes): {audio_file} — not uploading")
            return {"error": "Recording failed: file is empty (0 bytes)"}

        # Convert mono to stereo 44.1kHz for AudD (improves fingerprinting)
        upload_file = Path(audio_file)
        converted = Path(str(audio_file) + '.audd.wav')
        if self.channels == 1:
            try:
                conv = subprocess.run(
                    ['sox', str(audio_file), '-r', '44100', '-c', '2', str(converted)],
                    capture_output=True, text=True
                )
                if conv.returncode == 0 and converted.exists():
                    upload_file = converted
                    file_size = converted.stat().st_size
                    log.info(f"Converted to stereo 44.1kHz: {file_size} bytes")
            except Exception:
                pass

        log.info(f"Sending {upload_file} ({file_size} bytes) to AudD API...")
        detection_log.info(f"Uploading to AudD | file={upload_file.name} | size={file_size} bytes")

        try:
            with open(upload_file, 'rb') as f:
                response = requests.post(
                    'https://api.audd.io/',
                    data={
                        'api_token': self.api_token,
                        'return': 'spotify,deezer,musicbrainz'
                    },
                    files={'file': f},
                    timeout=60
                )
            if converted.exists():
                converted.unlink(missing_ok=True)

            if response.status_code == 200:
                result = response.json()

                if result.get('status') == 'success' and result.get('result'):
                    song = result['result']
                    log.info(f"Detected: {song.get('artist', 'Unknown')} - {song.get('title', 'Unknown')}")
                    detection_log.info(f"DETECTED | {song.get('artist', 'Unknown')} - {song.get('title', 'Unknown')} | album={song.get('album', '-')}")
                    result['audio_file'] = str(audio_file)
                    result['timestamp'] = datetime.now(timezone.utc).isoformat()
                    return result
                elif result.get('status') == 'success' and not result.get('result'):
                    detection_log.warning(f"No match | AudD processed audio but song not in database")
                    return {"error": "no_match"}
                else:
                    detection_log.warning(f"No fingerprint | AudD error={result.get('error', {}).get('error_message', '-')}")
                    return {"error": "no_fingerprint"}
            else:
                log.error(f"AudD API error: {response.status_code} — {response.text}")
                detection_log.error(f"AudD API error | HTTP {response.status_code} | {response.text[:100]}")
                return {"error": f"API error: {response.status_code}"}

        except requests.exceptions.Timeout:
            log.error("AudD API timeout")
            detection_log.error("AudD API timeout (>60s) — network slow or AudD unavailable")
            return {"error": "API timeout"}
        except Exception as e:
            log.error(f"Recognition failed: {e}")
            detection_log.error(f"Recognition failed | {e}")
            return {"error": str(e)}

    # ------------------------------------------------------------------
    # Microphone check
    # ------------------------------------------------------------------

    def check_microphone(self) -> bool:
        """Check if MEMS microphone is available and working."""
        try:
            result = subprocess.run(['arecord', '-l'], capture_output=True, text=True)
            if result.returncode != 0:
                log.error(f"Could not list audio devices: {result.stderr}")
                return False

            log.info("Audio devices:\n" + result.stdout)

            # Re-detect device
            self.device, self.format, self.channels = detect_music_mic()

            # Test 1-second recording
            test_cmd = [
                'arecord',
                '-D', self.device,
                '-f', self.format,
                '-r', str(self.sample_rate),
                '-c', str(self.channels),
                '-d', '1',
                '-t', 'wav',
                '/dev/null'
            ]
            test = subprocess.run(test_cmd, capture_output=True, text=True)

            if test.returncode == 0:
                log.info(f"Microphone test successful (device={self.device})")
                return True
            else:
                log.error(f"Microphone test failed: {test.stderr}")
                return False

        except Exception as e:
            log.error(f"Microphone check failed: {e}")
            return False


# ------------------------------------------------------------------
# CLI entry point
# ------------------------------------------------------------------

def main():
    import argparse

    parser = argparse.ArgumentParser(description='Music Recognition with File Rotation')
    parser.add_argument('--check', action='store_true', help='Check microphone availability')
    parser.add_argument('--record', action='store_true', help='Record and recognize music')
    parser.add_argument('--file', help='Recognize music from existing audio file')
    parser.add_argument('--duration', type=int, default=10, help='Recording duration in seconds')
    parser.add_argument('--list', action='store_true', help='List saved recordings')
    args = parser.parse_args()

    recognizer = MusicRecognizer()

    if args.list:
        recordings = sorted(glob.glob(str(recognizer.save_dir / "music_record*.wav")))
        print(f"\nRecordings in {recognizer.save_dir}:")
        print(f"Total: {len(recordings)} / {recognizer.max_recordings} max")
        for f in recordings:
            size = os.path.getsize(f)
            mtime = datetime.fromtimestamp(os.path.getmtime(f))
            print(f"  {os.path.basename(f)}  {size:,} bytes  {mtime:%Y-%m-%d %H:%M:%S}")
        return

    if args.check:
        ok = recognizer.check_microphone()
        print("Microphone ready!" if ok else "Microphone not working")
        return

    if args.duration:
        recognizer.duration = args.duration

    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"File not found: {file_path}")
            return
        result = recognizer.recognize_music(file_path)
        if 'error' in result:
            print(f"Error: {result['error']}")
        elif result.get('result'):
            song = result['result']
            print(f"Found: {song.get('artist')} - {song.get('title')}")
            if song.get('album'):
                print(f"Album: {song['album']}")
        else:
            print("No music detected")
        return

    if args.record:
        print(f"Recording {recognizer.duration}s — make sure music is playing!\n")
        audio_file = recognizer.record_audio_mems()
        if not audio_file:
            print("Recording failed")
            return
        print(f"Saved: {audio_file}\nAnalyzing...\n")
        result = recognizer.recognize_music(audio_file)
        if 'error' in result:
            print(f"Error: {result['error']}")
        elif result.get('result'):
            song = result['result']
            print(f"Found: {song.get('artist')} - {song.get('title')}")
            if song.get('album'):
                print(f"Album: {song['album']}")
        else:
            print("No music detected")
        return

    parser.print_help()


if __name__ == '__main__':
    main()
