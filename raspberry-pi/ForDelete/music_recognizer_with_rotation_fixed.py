#!/usr/bin/env python3
"""
Music Recognition Module for Enviro+ with File Rotation (Auto-detect Device)
============================================================================
Records audio from MEMS microphone and identifies songs using AudD API.
Saves recordings to Music_for_delete folder with rotation (max 10 files).
Auto-detects the correct audio device after reboot.
"""

import os
import sys
import time
import json
import base64
import logging
import requests
import subprocess
import tempfile
import array
import struct
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

        # Temp files for processing
        self.temp_wav_32 = "/tmp/music_recording_32bit.wav"
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
        """Record audio using arecord with MEMS microphone settings."""
        try:
            # Get next filename
            output_file = self.get_next_filename()

            log.info(f"Recording {self.duration} seconds from MEMS microphone...")
            log.info(f"Will save to: {output_file}")
            log.info("Make sure music is playing near the device!")

            # Record with MEMS mic format (32-bit stereo)
            cmd = [
                'arecord',
                '-D', self.device,
                '-f', self.format,
                '-r', str(self.sample_rate),
                '-c', str(self.channels),
                '-d', str(self.duration),
                '-t', 'wav',
                str(self.temp_wav_32)
            ]

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode == 0:
                log.info(f"Recording successful, converting format...")
                # Convert to 16-bit mono for AudD and save
                if self.convert_audio_format(output_file):
                    log.info(f"Audio saved to: {output_file}")

                    # List current recordings
                    recordings = sorted(glob.glob(str(self.save_dir / "music_record*.wav")))
                    log.info(f"Total recordings in folder: {len(recordings)}")

                    return output_file
                else:
                    return None
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
                        if self.convert_audio_format(output_file):
                            return output_file
                return None

        except FileNotFoundError:
            log.error("arecord not found. Install with: sudo apt-get install alsa-utils")
            return None
        except Exception as e:
            log.error(f"Recording failed: {e}")
            return None

    def convert_audio_format(self, output_file: Path) -> bool:
        """Convert 32-bit stereo to 16-bit mono for AudD."""
        try:
            import wave

            # Read 32-bit stereo file
            with wave.open(self.temp_wav_32, 'rb') as wav_in:
                params = wav_in.getparams()
                frames = wav_in.readframes(-1)

                # Convert based on format
                if params.sampwidth == 4:  # 32-bit
                    # 32-bit stereo to mono
                    samples_32 = array.array('i', frames)  # 32-bit signed

                    # Mix stereo to mono
                    mono_32 = []
                    if params.nchannels == 2:
                        for i in range(0, len(samples_32), 2):
                            mono_32.append((samples_32[i] + samples_32[i+1]) // 2)
                    else:
                        mono_32 = samples_32

                    # Convert 32-bit to 16-bit (proper scaling)
                    samples_16 = []
                    for sample in mono_32:
                        # Scale from 32-bit to 16-bit range
                        scaled = int(sample / 65536)
                        # Clamp to 16-bit range
                        scaled = max(-32768, min(32767, scaled))
                        samples_16.append(scaled)

                    # Write 16-bit mono file
                    with wave.open(str(output_file), 'wb') as wav_out:
                        wav_out.setnchannels(1)  # Mono
                        wav_out.setsampwidth(2)  # 16-bit
                        wav_out.setframerate(48000)  # Keep sample rate

                        # Convert to bytes
                        output_data = array.array('h', samples_16)  # 16-bit signed
                        wav_out.writeframes(output_data.tobytes())

                    return True
                else:
                    # Already 16-bit or other format, just copy
                    import shutil
                    shutil.copy(self.temp_wav_32, str(output_file))
                    return True

        except Exception as e:
            log.error(f"Audio conversion failed: {e}")
            return False

    def recognize_music(self, audio_file: Path) -> Dict:
        """Send audio to AudD API for recognition."""
        try:
            log.info("Sending audio to AudD for recognition...")

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
    """Test the music recognizer with rotation."""
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