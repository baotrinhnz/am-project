#!/usr/bin/env python3
"""
Music Recognition Module for Enviro+ (FIXED FOR MEMS MIC)
==========================================================
Records audio from MEMS microphone and identifies songs using AudD API.
Fixed for hw:3,0 device with S32_LE format.
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
    """Handles audio recording and music recognition."""

    def __init__(self, api_token: str = None):
        """Initialize with AudD API token."""
        self.api_token = api_token or AUDD_API_TOKEN
        if not self.api_token:
            raise ValueError("AUDD_API_TOKEN not provided or found in .env")

        # Audio recording settings for MEMS mic
        self.device = "hw:3,0"  # MEMS microphone on Enviro+
        self.sample_rate = 48000  # MEMS mic needs 48kHz
        self.duration = 10  # Record for 10 seconds by default
        self.channels = 2  # MEMS mic is stereo
        self.format = "S32_LE"  # 32-bit format for MEMS mic

        # File paths
        self.temp_wav_32 = "/tmp/music_recording_32bit.wav"
        self.temp_wav = "/tmp/music_recording.wav"

    def record_audio_mems(self) -> bool:
        """Record audio using arecord with MEMS microphone settings."""
        try:
            log.info(f"Recording {self.duration} seconds from MEMS microphone...")
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
                self.temp_wav_32
            ]

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode == 0:
                log.info(f"Recording successful, converting format...")
                # Convert to 16-bit mono for AudD
                if self.convert_audio_format():
                    log.info(f"Audio ready at {self.temp_wav}")
                    return True
                else:
                    return False
            else:
                log.error(f"arecord failed: {result.stderr}")
                # Try with plughw if hw fails
                if "Channels count non available" in result.stderr:
                    log.info("Retrying with plughw...")
                    cmd[2] = 'plughw:3,0'
                    result = subprocess.run(cmd, capture_output=True, text=True)
                    if result.returncode == 0:
                        return self.convert_audio_format()
                return False

        except FileNotFoundError:
            log.error("arecord not found. Install with: sudo apt-get install alsa-utils")
            return False
        except Exception as e:
            log.error(f"Recording failed: {e}")
            return False

    def convert_audio_format(self) -> bool:
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

                    # Convert 32-bit to 16-bit
                    mono_16 = []
                    for sample in mono_32:
                        scaled = sample >> 16  # Scale down
                        # Clip to 16-bit range
                        scaled = max(-32768, min(32767, scaled))
                        mono_16.append(scaled)

                elif params.sampwidth == 2:  # Already 16-bit
                    samples_16 = array.array('h', frames)  # 16-bit signed

                    # Mix stereo to mono if needed
                    if params.nchannels == 2:
                        mono_16 = []
                        for i in range(0, len(samples_16), 2):
                            mono_16.append((samples_16[i] + samples_16[i+1]) // 2)
                    else:
                        mono_16 = list(samples_16)
                else:
                    log.error(f"Unsupported sample width: {params.sampwidth}")
                    return False

                # Resample to 44100 if needed (simple decimation)
                if params.framerate == 48000:
                    # Simple downsampling from 48k to 44.1k (roughly)
                    resampled = []
                    ratio = 44100 / 48000
                    for i in range(int(len(mono_16) * ratio)):
                        src_idx = int(i / ratio)
                        if src_idx < len(mono_16):
                            resampled.append(mono_16[src_idx])
                    mono_16 = resampled

                # Write 16-bit mono file
                with wave.open(self.temp_wav, 'wb') as wav_out:
                    wav_out.setnchannels(1)  # Mono
                    wav_out.setsampwidth(2)  # 16-bit
                    wav_out.setframerate(44100)  # Standard rate for AudD

                    # Convert to bytes
                    output = struct.pack('<%dh' % len(mono_16), *mono_16)
                    wav_out.writeframes(output)

                # Check if audio has content
                max_val = max(abs(min(mono_16)), abs(max(mono_16))) if mono_16 else 0
                if max_val < 100:
                    log.warning("Audio level very low - might be silence!")
                else:
                    log.info(f"Audio level OK (max: {max_val})")

                return True

        except Exception as e:
            log.error(f"Format conversion failed: {e}")
            return False

    def record_audio(self) -> bool:
        """Record audio using MEMS microphone."""
        return self.record_audio_mems()

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
            'spotify_url': song_data.get('spotify', {}).get('external_urls', {}).get('spotify') if song_data.get('spotify') else None,
            'apple_music_url': song_data.get('apple_music', {}).get('url') if song_data.get('apple_music') else None,
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

        # Clean up temp files
        try:
            for f in [self.temp_wav, self.temp_wav_32]:
                if os.path.exists(f):
                    os.remove(f)
        except:
            pass

        return result

    def check_microphone(self) -> bool:
        """Check if MEMS microphone is available."""
        try:
            result = subprocess.run(['arecord', '-l'], capture_output=True, text=True)
            if 'card 3' in result.stdout and 'adau7002' in result.stdout:
                log.info("MEMS microphone (adau7002) found on card 3")
                return True
            else:
                log.error("MEMS microphone not found on expected card 3")
                log.info("Available devices:\n" + result.stdout)
                return False
        except Exception as e:
            log.error(f"Error checking microphone: {e}")
            return False


def main():
    """Test the music recognizer."""
    import argparse

    parser = argparse.ArgumentParser(description="Music Recognition for Raspberry Pi (MEMS Mic Fixed)")
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
        sys.exit(1)

    if args.duration:
        recognizer.duration = args.duration

    # Execute requested action
    if args.check:
        if recognizer.check_microphone():
            print("✓ MEMS microphone check passed")
        else:
            print("✗ MEMS microphone not detected correctly")

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
        print("Starting in 3 seconds...")
        time.sleep(3)

        result = recognizer.record_and_recognize()
        if result:
            print("\n✓ Song identified:")
            print(f"  Title: {result['title']}")
            print(f"  Artist: {result['artist']}")
            print(f"  Album: {result.get('album', 'N/A')}")
            if result.get('spotify_url'):
                print(f"  Spotify: {result['spotify_url']}")
        else:
            print("\n✗ No song recognized. Try:")
            print("  - Playing music louder")
            print("  - Moving speaker closer to device")
            print("  - Playing more popular songs")
            print("  - Recording for longer (--duration 15)")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()