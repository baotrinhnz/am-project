#!/usr/bin/env python3
"""
Music Recognition Module for Enviro+
====================================
Records audio from MEMS microphone and identifies songs using AudD API.
Designed for Raspberry Pi with Enviro+ HAT.
"""

import os
import sys
import time
import json
import base64
import logging
import requests
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional, Tuple

# Try to import audio libraries
try:
    import sounddevice as sd
    import numpy as np
    import scipy.io.wavfile as wavfile
    HAS_SOUNDDEVICE = True
except ImportError:
    HAS_SOUNDDEVICE = False
    print("Warning: sounddevice not installed. Install with: pip3 install sounddevice numpy scipy")

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
    """Handles audio recording and music recognition."""

    def __init__(self, api_token: str = None):
        """Initialize with AudD API token."""
        self.api_token = api_token or AUDD_API_TOKEN
        if not self.api_token:
            raise ValueError("AUDD_API_TOKEN not provided or found in .env")

        # Audio recording settings
        self.sample_rate = 16000  # 16kHz is sufficient for music recognition
        self.duration = 20  # Record for 20 seconds (longer for better recognition)
        self.channels = 1  # Mono recording

        # File paths
        self.temp_wav = "/tmp/music_recording.wav"

    def record_audio_sounddevice(self) -> bool:
        """Record audio using sounddevice library."""
        if not HAS_SOUNDDEVICE:
            log.error("sounddevice not available")
            return False

        try:
            log.info(f"Recording {self.duration} seconds of audio...")

            # Record audio
            recording = sd.rec(
                int(self.duration * self.sample_rate),
                samplerate=self.sample_rate,
                channels=self.channels,
                dtype='int16'
            )
            sd.wait()  # Wait for recording to complete

            # Apply gain to boost low signal from MEMS mic
            recording = recording * 4  # Amplify by 4x
            recording = np.clip(recording, -32768, 32767).astype('int16')

            # Save to WAV file
            wavfile.write(self.temp_wav, self.sample_rate, recording)
            log.info(f"Audio saved to {self.temp_wav}")
            return True

        except Exception as e:
            log.error(f"Recording failed (sounddevice): {e}")
            return False

    def record_audio_arecord(self) -> bool:
        """Record audio using arecord command (fallback method)."""
        try:
            # First check if MEMS mic is available
            result = subprocess.run(
                ['arecord', '-l'],
                capture_output=True,
                text=True
            )

            if 'card' not in result.stdout.lower():
                log.error("No audio recording devices found")
                return False

            log.info(f"Recording {self.duration} seconds with arecord...")

            # Record with arecord
            # Format: S16_LE = 16-bit signed little-endian
            cmd = [
                'arecord',
                '-D', 'plughw:0,0',  # Device (may need adjustment)
                '-f', 'S16_LE',
                '-r', str(self.sample_rate),
                '-c', str(self.channels),
                '-d', str(self.duration),
                '-t', 'wav',
                self.temp_wav
            ]

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode == 0:
                log.info(f"Audio recorded successfully to {self.temp_wav}")
                return True
            else:
                log.error(f"arecord failed: {result.stderr}")
                return False

        except FileNotFoundError:
            log.error("arecord not found. Install with: sudo apt-get install alsa-utils")
            return False
        except Exception as e:
            log.error(f"Recording failed (arecord): {e}")
            return False

    def record_audio(self) -> bool:
        """Record audio using best available method."""
        # Try sounddevice first (better Python integration)
        if HAS_SOUNDDEVICE:
            if self.record_audio_sounddevice():
                return True

        # Fallback to arecord
        return self.record_audio_arecord()

    def recognize_from_file(self, audio_file: str = None) -> Optional[Dict]:
        """Send audio file to AudD API for recognition."""
        file_to_send = audio_file or self.temp_wav

        if not os.path.exists(file_to_send):
            log.error(f"Audio file not found: {file_to_send}")
            return None

        try:
            # Check file size (AudD has 10MB limit)
            file_size = os.path.getsize(file_to_send) / (1024 * 1024)  # MB
            log.info(f"Sending {file_size:.2f}MB audio file to AudD...")

            with open(file_to_send, 'rb') as f:
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

                result = response.json()

                if result.get('status') == 'success':
                    if result.get('result'):
                        song = result['result']
                        log.info(f"✓ Song identified: {song.get('title')} by {song.get('artist')}")
                        return self._format_result(song)
                    else:
                        log.info("No song recognized in the audio")
                        return None
                else:
                    error = result.get('error', {})
                    log.error(f"API error: {error.get('error_message', 'Unknown error')}")
                    return None

        except requests.exceptions.Timeout:
            log.error("Request timed out")
            return None
        except Exception as e:
            log.error(f"Recognition failed: {e}")
            return None

    def recognize_from_base64(self, audio_base64: str) -> Optional[Dict]:
        """Send base64 encoded audio to AudD API."""
        try:
            data = {
                'audio': audio_base64,
                'api_token': self.api_token,
                'return': 'spotify,apple_music'
            }

            response = requests.post(
                'https://api.audd.io/',
                data=data,
                timeout=30
            )

            result = response.json()

            if result.get('status') == 'success' and result.get('result'):
                song = result['result']
                return self._format_result(song)
            else:
                return None

        except Exception as e:
            log.error(f"Recognition failed: {e}")
            return None

    def _format_result(self, song_data: Dict) -> Dict:
        """Format AudD result for storage/display."""
        return {
            'title': song_data.get('title'),
            'artist': song_data.get('artist'),
            'album': song_data.get('album'),
            'release_date': song_data.get('release_date'),
            'label': song_data.get('label'),
            'timecode': song_data.get('timecode'),
            'song_link': song_data.get('song_link'),
            'spotify_url': song_data.get('spotify', {}).get('external_urls', {}).get('spotify'),
            'apple_music_url': song_data.get('apple_music', {}).get('url'),
            'detected_at': datetime.now(timezone.utc).isoformat(),
            'device_id': DEVICE_ID
        }

    def record_and_recognize(self) -> Optional[Dict]:
        """Complete flow: record audio then recognize."""
        # Record audio
        if not self.record_audio():
            log.error("Failed to record audio")
            return None

        # Recognize from recorded file
        result = self.recognize_from_file()

        # Clean up temp file
        try:
            if os.path.exists(self.temp_wav):
                os.remove(self.temp_wav)
        except:
            pass

        return result

    def check_microphone(self) -> bool:
        """Check if microphone is available and working."""
        if HAS_SOUNDDEVICE:
            try:
                # List audio devices
                devices = sd.query_devices()
                log.info("Available audio devices:")
                for i, device in enumerate(devices):
                    if device['max_input_channels'] > 0:
                        log.info(f"  [{i}] {device['name']} (inputs: {device['max_input_channels']})")
                return True
            except Exception as e:
                log.error(f"Error checking devices: {e}")

        # Check with arecord
        try:
            result = subprocess.run(['arecord', '-l'], capture_output=True, text=True)
            if 'card' in result.stdout.lower():
                log.info("Audio recording devices found (arecord)")
                return True
        except:
            pass

        return False


def main():
    """Test the music recognizer."""
    import argparse

    parser = argparse.ArgumentParser(description="Music Recognition for Raspberry Pi")
    parser.add_argument("--check", action="store_true", help="Check microphone availability")
    parser.add_argument("--record", action="store_true", help="Record and recognize music")
    parser.add_argument("--file", help="Recognize music from existing audio file")
    parser.add_argument("--duration", type=int, default=10, help="Recording duration in seconds")
    args = parser.parse_args()

    # Initialize recognizer
    try:
        recognizer = MusicRecognizer()
    except ValueError as e:
        log.error(f"Initialization failed: {e}")
        log.info("Please add AUDD_API_TOKEN to your .env file")
        log.info("Get token from: https://dashboard.audd.io/")
        sys.exit(1)

    if args.duration:
        recognizer.duration = args.duration

    # Execute requested action
    if args.check:
        if recognizer.check_microphone():
            print("✓ Microphone check passed")
        else:
            print("✗ No microphone detected")

    elif args.file:
        result = recognizer.recognize_from_file(args.file)
        if result:
            print("\n✓ Song identified:")
            print(json.dumps(result, indent=2))
        else:
            print("\n✗ No song recognized")

    elif args.record:
        print(f"\n🎵 Starting {recognizer.duration}-second recording...")
        print("Make sure music is playing near the microphone!")
        time.sleep(2)  # Give user time to start music

        result = recognizer.record_and_recognize()
        if result:
            print("\n✓ Song identified:")
            print(f"  Title: {result['title']}")
            print(f"  Artist: {result['artist']}")
            print(f"  Album: {result['album']}")
            if result.get('spotify_url'):
                print(f"  Spotify: {result['spotify_url']}")
        else:
            print("\n✗ No song recognized. Try:")
            print("  - Playing music louder")
            print("  - Moving microphone closer to speaker")
            print("  - Recording for longer (--duration 15)")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()