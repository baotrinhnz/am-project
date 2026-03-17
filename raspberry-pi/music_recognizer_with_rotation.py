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
import re
import logging
import logging.handlers
import requests
import subprocess
import glob
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

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

# Keywords to identify MEMS mic in arecord -l output
MEMS_KEYWORDS = ['iq', 'mems', 'sndrpii', 'dmic', 'ics43', 'enviro', 'i2s']


class MusicRecognizer:
    """Handles audio recording and music recognition with file rotation."""

    def __init__(self, api_token: str = None):
        self.api_token = api_token or AUDD_API_TOKEN
        if not self.api_token:
            raise ValueError("AUDD_API_TOKEN not provided or found in .env")

        # Audio recording settings — ADAU7002 requires S32_LE stereo
        self.sample_rate = 48000   # MEMS mic native rate
        self.channels = 2          # Stereo — required by ADAU7002 hardware
        self.format = "S32_LE"     # 32-bit — ADAU7002 native format
        self.duration = 10         # seconds

        # Find device by name at startup so reboot doesn't break card numbering
        self.device = self._find_mems_device()

        # File rotation settings
        self.save_dir = Path.home() / "Music_for_delete"
        self.save_dir.mkdir(exist_ok=True)
        self.max_recordings = 10

    def _find_mems_device(self) -> str:
        """Find MEMS microphone by device name, return plughw:X,Y string.

        Uses device name instead of card number because card numbers can
        change between reboots depending on which drivers load first.
        """
        try:
            result = subprocess.run(['arecord', '-l'], capture_output=True, text=True)
            if result.returncode != 0:
                log.warning("arecord -l failed, falling back to plughw:2,0")
                return "plughw:2,0"

            log.info("Audio capture devices:\n" + result.stdout)

            # Parse lines like:
            # card 3: sndrpiiqdmic [sndrpiiqdmic], device 0: IQaudIO MEMS mic HiFi [...]
            for line in result.stdout.splitlines():
                line_lower = line.lower()
                if 'card' not in line_lower:
                    continue
                # Skip HDMI outputs — they appear in capture list but aren't real mics
                if 'hdmi' in line_lower:
                    continue
                if any(kw in line_lower for kw in MEMS_KEYWORDS):
                    match = re.search(r'card\s+(\d+):.*device\s+(\d+):', line)
                    if match:
                        card, dev = match.group(1), match.group(2)
                        device = f"plughw:{card},{dev}"
                        log.info(f"Found MEMS mic by name: {device} — {line.strip()}")
                        return device

            # Fallback: use last non-HDMI capture card found
            last_device = None
            for line in result.stdout.splitlines():
                if 'card' not in line.lower():
                    continue
                if 'hdmi' in line.lower():
                    continue
                match = re.search(r'card\s+(\d+):.*device\s+(\d+):', line)
                if match:
                    last_device = f"plughw:{match.group(1)},{match.group(2)}"

            if last_device:
                log.warning(f"MEMS mic not identified by keyword, using last capture device: {last_device}")
                return last_device

            log.warning("No suitable capture device found, falling back to plughw:2,0")
            return "plughw:2,0"

        except FileNotFoundError:
            log.error("arecord not found, falling back to plughw:2,0")
            return "plughw:2,0"
        except Exception as e:
            log.warning(f"Device detection error: {e}, falling back to plughw:2,0")
            return "plughw:2,0"

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

                # Boost volume 10dB with sox so AudD can fingerprint better
                boosted_file = output_file.with_suffix('.boosted.wav')
                boost = subprocess.run(
                    ['sox', str(output_file), str(boosted_file), 'gain', '15'],
                    capture_output=True, text=True
                )
                if boost.returncode == 0 and boosted_file.exists():
                    output_file.unlink()
                    boosted_file.rename(output_file)
                    log.info(f"Audio boosted 15dB: {output_file}")

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

        log.info(f"Sending {audio_file} ({file_size} bytes) to AudD API...")
        detection_log.info(f"Uploading to AudD | file={Path(audio_file).name} | size={file_size} bytes")

        try:
            with open(audio_file, 'rb') as f:
                response = requests.post(
                    'https://api.audd.io/',
                    data={
                        'api_token': self.api_token,
                        'return': 'spotify,deezer,musicbrainz'
                    },
                    files={'file': f},
                    timeout=60
                )

            if response.status_code == 200:
                result = response.json()

                if result.get('status') == 'success' and result.get('result'):
                    song = result['result']
                    log.info(f"Detected: {song.get('artist', 'Unknown')} - {song.get('title', 'Unknown')}")
                    detection_log.info(f"DETECTED | {song.get('artist', 'Unknown')} - {song.get('title', 'Unknown')} | album={song.get('album', '-')}")
                    result['audio_file'] = str(audio_file)
                    result['timestamp'] = datetime.now(timezone.utc).isoformat()
                    return result
                else:
                    log.warning("No music detected or API returned no result")
                    detection_log.warning(f"No music detected | AudD status={result.get('status')} | error={result.get('error', {}).get('error_message', '-')}")
                    return {"error": "No music detected", "api_response": result}
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
            self.device = self._find_mems_device()

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
