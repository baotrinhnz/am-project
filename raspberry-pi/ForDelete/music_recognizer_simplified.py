#!/usr/bin/env python3
"""
Simplified Music Recognition Module for Enviro+
================================================
Records audio from MEMS microphone and identifies songs using AudD API.
Saves recordings to Music_for_delete folder with rotation (max 10 files).
Auto-detects the correct audio device after reboot.
NO CONVERSION - sends raw WAV file directly to Audd API.
"""

import os
import sys
import time
import json
import logging
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

# Load environment variables
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

AUDD_API_TOKEN = os.getenv("AUDD_API_TOKEN")
DEVICE_ID = os.getenv("DEVICE_ID", "rpi-enviro-01")

class MusicRecognizer:
    """Handles audio recording and music recognition with file rotation."""

    def __init__(self, api_token: str = None):
        """Initialize with AudD API token."""
        self.api_token = api_token or AUDD_API_TOKEN
        if not self.api_token:
            raise ValueError("AUDD_API_TOKEN not provided or found in .env")

        # Audio recording settings for MEMS mic
        self.device = self._detect_audio_device()  # Auto-detect MEMS microphone
        self.sample_rate = 48000  # MEMS mic needs 48kHz
        self.duration = 10  # Record for 10 seconds by default
        self.channels = 2  # MEMS mic is stereo
        self.format = "S32_LE"  # 32-bit format for MEMS mic

        # File paths - Save to Music_for_delete folder
        self.save_dir = Path.home() / "Music_for_delete"
        self.save_dir.mkdir(exist_ok=True)

        self.max_recordings = 10  # Keep max 10 recordings

    def _detect_audio_device(self) -> str:
        """Auto-detect the MEMS microphone device."""
        # Common device names for MEMS mic on Enviro+
        possible_devices = [
            "hw:3,0",      # Most common after reboot
            "plughw:3,0",  # Plugin version of hw:3,0
            "hw:2,0",      # Sometimes appears here
            "plughw:2,0",  # Plugin version of hw:2,0
        ]

        log.info("Auto-detecting MEMS microphone device...")

        for device in possible_devices:
            try:
                # Test recording with this device
                cmd = [
                    'arecord', '-D', device,
                    '-f', 'S32_LE', '-r', '48000', '-c', '2',
                    '-d', '0.1', '-t', 'raw', '/dev/null'
                ]

                result = subprocess.run(cmd, capture_output=True, text=True, timeout=2)

                if result.returncode == 0:
                    log.info(f"Found working MEMS microphone at: {device}")
                    return device

            except subprocess.TimeoutExpired:
                continue
            except Exception as e:
                log.debug(f"Error testing device {device}: {e}")
                continue

        # If no device found, default to most common one
        default_device = "plughw:3,0"
        log.warning(f"Could not auto-detect MEMS mic, using default: {default_device}")
        return default_device

    def get_next_filename(self) -> Path:
        """Get next available filename with rotation."""
        # Find existing music_record files
        existing_files = sorted(glob.glob(str(self.save_dir / "music_record*.wav")))

        # If we have 10 or more files, delete the oldest ones
        if len(existing_files) >= self.max_recordings:
            # Keep only the 9 most recent files
            files_to_delete = existing_files[:len(existing_files) - self.max_recordings + 1]
            for f in files_to_delete:
                try:
                    os.remove(f)
                    log.info(f"Deleted old recording: {f}")
                except Exception as e:
                    log.warning(f"Could not delete {f}: {e}")

            # Refresh list
            existing_files = sorted(glob.glob(str(self.save_dir / "music_record*.wav")))

        # Find next number
        next_num = 1
        for f in existing_files:
            try:
                # Extract number from filename like music_record001.wav
                basename = os.path.basename(f)
                if basename.startswith("music_record") and basename.endswith(".wav"):
                    num_str = basename[12:-4]  # Extract the number part
                    num = int(num_str)
                    next_num = max(next_num, num + 1)
            except:
                continue

        # Format with 3 digits
        filename = self.save_dir / f"music_record{next_num:03d}.wav"
        return filename

    def record_audio_mems(self) -> Optional[Path]:
        """Record audio using arecord - NO CONVERSION, direct save."""
        try:
            # Get next filename
            output_file = self.get_next_filename()

            log.info(f"Recording {self.duration} seconds from MEMS microphone...")
            log.info(f"Device: {self.device}, Format: {self.format}, Rate: {self.sample_rate}Hz")
            log.info(f"Will save to: {output_file}")

            # Record directly to final output file - NO CONVERSION
            cmd = [
                'arecord',
                '-D', self.device,
                '-f', self.format,
                '-r', str(self.sample_rate),
                '-c', str(self.channels),
                '-d', str(self.duration),
                '-t', 'wav',
                str(output_file)  # Save directly to final location
            ]

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode == 0:
                # Check file size
                file_size = os.path.getsize(output_file)

                if file_size == 0:
                    log.error(f"Recording failed: File size is 0 bytes")
                    os.remove(output_file)
                    return None

                log.info(f"Recording successful! File size: {file_size:,} bytes")

                # List current recordings
                recordings = sorted(glob.glob(str(self.save_dir / "music_record*.wav")))
                log.info(f"Total recordings in folder: {len(recordings)}")

                return output_file

            else:
                log.error(f"arecord failed: {result.stderr}")

                # Try re-detecting device if recording failed
                if "No such file or directory" in result.stderr or "No such device" in result.stderr:
                    log.info("Device not found, re-detecting...")
                    self.device = self._detect_audio_device()

                    # Retry with new device
                    cmd[2] = self.device
                    result = subprocess.run(cmd, capture_output=True, text=True)

                    if result.returncode == 0:
                        file_size = os.path.getsize(output_file)
                        if file_size > 0:
                            log.info(f"Retry successful! File size: {file_size:,} bytes")
                            return output_file
                        else:
                            log.error("Retry failed: File size is 0 bytes")
                            os.remove(output_file)

                return None

        except FileNotFoundError:
            log.error("arecord not found. Install with: sudo apt-get install alsa-utils")
            return None
        except Exception as e:
            log.error(f"Recording failed: {e}")
            return None

    def recognize_music(self, audio_file: Path) -> Dict:
        """Send audio to AudD API for recognition."""
        try:
            # Validate file before sending
            if not os.path.exists(audio_file):
                log.error(f"Audio file not found: {audio_file}")
                return {'error': 'Audio file not found'}

            file_size = os.path.getsize(audio_file)
            if file_size == 0:
                log.error(f"Audio file is empty (0 bytes): {audio_file}")
                return {'error': 'Audio file is empty'}

            # Check if file is too large (> 12MB approximately for 12 seconds)
            max_size = 12 * 1024 * 1024  # 12MB
            if file_size > max_size:
                log.warning(f"Audio file might be too large: {file_size:,} bytes")

            log.info(f"Sending audio to AudD for recognition...")
            log.info(f"File: {audio_file}, Size: {file_size:,} bytes")

            with open(audio_file, 'rb') as f:
                files = {'file': f}
                data = {
                    'api_token': self.api_token,
                    'return': 'spotify,apple_music'
                }

                response = requests.post(
                    'https://api.audd.io/',
                    data=data,
                    files=files,
                    timeout=30
                )

                if response.status_code == 200:
                    result = response.json()

                    if result.get('status') == 'success':
                        if result.get('result'):
                            song = result['result']
                            log.info(f"✓ Song identified: {song.get('artist')} - {song.get('title')}")
                            return result
                        else:
                            log.info("No song detected in the audio")
                            return {'error': 'No song detected'}
                    else:
                        error_msg = result.get('error', {}).get('error_message', 'Unknown error')
                        log.error(f"API error: {error_msg}")
                        return {'error': error_msg}
                else:
                    log.error(f"HTTP error {response.status_code}")
                    return {'error': f'HTTP {response.status_code}'}

        except requests.exceptions.Timeout:
            log.error("API request timed out")
            return {'error': 'Request timeout'}
        except Exception as e:
            log.error(f"Recognition failed: {e}")
            return {'error': str(e)}

def main():
    """Test the music recognizer."""
    try:
        recognizer = MusicRecognizer()

        # Record audio
        audio_file = recognizer.record_audio_mems()

        if audio_file:
            log.info(f"Audio saved: {audio_file}")

            # Recognize the music
            result = recognizer.recognize_music(audio_file)

            if 'error' not in result:
                if result.get('result'):
                    song = result['result']
                    print("\n" + "="*50)
                    print("🎵 SONG DETECTED!")
                    print("="*50)
                    print(f"Title:  {song.get('title', 'Unknown')}")
                    print(f"Artist: {song.get('artist', 'Unknown')}")
                    print(f"Album:  {song.get('album', 'Unknown')}")
                    if song.get('release_date'):
                        print(f"Released: {song.get('release_date')}")
                    if song.get('spotify'):
                        print(f"Spotify: {song['spotify'].get('external_urls', {}).get('spotify', 'N/A')}")
                    print("="*50)
                else:
                    print("\n⚠ No music detected. Try playing music closer to the sensor.")
            else:
                print(f"\n✗ Error: {result['error']}")
        else:
            print("\n✗ Failed to record audio")

    except Exception as e:
        log.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()