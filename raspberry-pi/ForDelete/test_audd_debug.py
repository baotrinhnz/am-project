#!/usr/bin/env python3
"""
AudD API Debug Script - Test và log chi tiết API calls
"""
import os
import sys
import json
import time
import logging
from datetime import datetime
import sounddevice as sd
import numpy as np
import requests
from dotenv import load_dotenv
import traceback
import subprocess

# Setup logging chi tiết
log_filename = f"/home/am/audd_debug_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(log_filename),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

AUDD_API_TOKEN = os.getenv('AUDD_API_TOKEN')
DEVICE_ID = 'rpi-enviro-01'
RECORDING_DURATION = 10  # seconds
SAMPLE_RATE = 44100

def log_separator(title=""):
    logger.info("="*60)
    if title:
        logger.info(f"  {title}")
        logger.info("="*60)

def check_environment():
    """Kiểm tra environment và settings"""
    log_separator("ENVIRONMENT CHECK")

    logger.info(f"Python Version: {sys.version}")
    logger.info(f"Current Directory: {os.getcwd()}")
    logger.info(f"Log File: {log_filename}")

    if AUDD_API_TOKEN:
        logger.info(f"AUDD_API_TOKEN: {AUDD_API_TOKEN[:10]}...{AUDD_API_TOKEN[-5:]}")
        logger.info(f"Token Length: {len(AUDD_API_TOKEN)}")
    else:
        logger.error("AUDD_API_TOKEN not found!")

    # Check audio devices
    try:
        import sounddevice as sd
        logger.info("\nAudio Devices:")
        devices = sd.query_devices()
        for i, device in enumerate(devices):
            if device['max_input_channels'] > 0:
                logger.info(f"  Device {i}: {device['name']} - {device['max_input_channels']} input channels")
    except Exception as e:
        logger.error(f"Error checking audio devices: {e}")

def test_recording_sounddevice():
    """Test recording với sounddevice"""
    log_separator("TESTING SOUNDDEVICE RECORDING")

    try:
        logger.info(f"Recording {RECORDING_DURATION} seconds at {SAMPLE_RATE}Hz...")
        logger.info("Using default input device")

        # Record audio
        audio_data = sd.rec(
            int(RECORDING_DURATION * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype='int16'
        )
        sd.wait()

        logger.info(f"Recording complete!")
        logger.info(f"Audio shape: {audio_data.shape}")
        logger.info(f"Audio dtype: {audio_data.dtype}")
        logger.info(f"Audio min/max: {np.min(audio_data)}/{np.max(audio_data)}")

        # Check if audio has signal
        audio_level = np.max(np.abs(audio_data))
        logger.info(f"Audio level: {audio_level}")

        if audio_level < 100:
            logger.warning("Audio level very low - might be silence!")

        return audio_data

    except Exception as e:
        logger.error(f"Sounddevice recording failed: {e}")
        logger.error(traceback.format_exc())
        return None

def test_recording_arecord():
    """Test recording với arecord như backup"""
    log_separator("TESTING ARECORD RECORDING")

    try:
        import tempfile
        import scipy.io.wavfile as wavfile

        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
            tmp_filename = tmp_file.name

        logger.info(f"Recording with arecord to {tmp_filename}...")
        cmd = [
            'arecord',
            '-D', 'plughw:2,0',
            '-f', 'S16_LE',
            '-r', str(SAMPLE_RATE),
            '-d', str(RECORDING_DURATION),
            '-c', '1',
            tmp_filename
        ]

        logger.info(f"Command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            logger.error(f"arecord failed: {result.stderr}")
            return None

        # Read the wav file
        sample_rate, audio_data = wavfile.read(tmp_filename)
        logger.info(f"Recording complete! Sample rate: {sample_rate}, Shape: {audio_data.shape}")

        # Cleanup
        os.unlink(tmp_filename)

        return audio_data

    except Exception as e:
        logger.error(f"Arecord recording failed: {e}")
        logger.error(traceback.format_exc())
        return None

def send_to_audd(audio_data):
    """Gửi audio đến AudD API với logging chi tiết"""
    log_separator("SENDING TO AUDD API")

    if audio_data is None:
        logger.error("No audio data to send!")
        return None

    try:
        # Convert audio to WAV format in memory
        import io
        import scipy.io.wavfile as wavfile

        wav_buffer = io.BytesIO()
        wavfile.write(wav_buffer, SAMPLE_RATE, audio_data)
        wav_buffer.seek(0)

        # Log request details
        logger.info("Preparing AudD API request...")
        logger.info(f"API URL: https://api.audd.io/")
        logger.info(f"Audio size: {len(wav_buffer.getvalue())} bytes")
        logger.info(f"Token (masked): {AUDD_API_TOKEN[:10]}...{AUDD_API_TOKEN[-5:]}")

        # Prepare request
        files = {'file': ('audio.wav', wav_buffer, 'audio/wav')}
        data = {
            'api_token': AUDD_API_TOKEN,
            'return': 'apple_music,spotify'
        }

        logger.info("Sending request to AudD...")
        start_time = time.time()

        # Make request with detailed logging
        response = requests.post(
            'https://api.audd.io/',
            files=files,
            data=data,
            timeout=30
        )

        elapsed = time.time() - start_time

        # Log response details
        logger.info(f"Response received in {elapsed:.2f} seconds")
        logger.info(f"Status Code: {response.status_code}")
        logger.info(f"Response Headers: {dict(response.headers)}")

        # Parse response
        result = response.json()

        # Log full response
        logger.info("Full Response JSON:")
        logger.info(json.dumps(result, indent=2))

        # Check for errors
        if response.status_code != 200:
            logger.error(f"API returned error status: {response.status_code}")

        if result.get('status') == 'error':
            logger.error(f"API Error: {result.get('error', {}).get('error_message', 'Unknown error')}")
            return None

        # Check if song was recognized
        if result.get('status') == 'success' and result.get('result'):
            song = result['result']
            logger.info("Song recognized successfully!")
            logger.info(f"Title: {song.get('title', 'Unknown')}")
            logger.info(f"Artist: {song.get('artist', 'Unknown')}")
            logger.info(f"Album: {song.get('album', 'Unknown')}")
            return song
        else:
            logger.warning("No song recognized - might be silence or unrecognizable audio")
            return None

    except requests.exceptions.Timeout:
        logger.error("Request timeout - AudD API took too long to respond")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error: {e}")
        logger.error(traceback.format_exc())
        return None
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        logger.error(traceback.format_exc())
        return None

def main():
    """Main test function"""
    logger.info("Starting AudD API Debug Test")
    logger.info(f"Log file: {log_filename}")

    # Check environment
    check_environment()

    if not AUDD_API_TOKEN:
        logger.error("Cannot proceed without AUDD_API_TOKEN!")
        return

    # Try sounddevice first
    audio_data = test_recording_sounddevice()

    # If sounddevice fails, try arecord
    if audio_data is None:
        logger.warning("Sounddevice failed, trying arecord...")
        audio_data = test_recording_arecord()

    # Send to AudD
    if audio_data is not None:
        result = send_to_audd(audio_data)

        if result:
            log_separator("TEST SUCCESSFUL")
            logger.info("Music recognition successful!")
        else:
            log_separator("TEST FAILED")
            logger.error("Music recognition failed!")
    else:
        log_separator("TEST FAILED")
        logger.error("Could not record audio!")

    logger.info(f"\nFull log saved to: {log_filename}")
    logger.info("You can view it with: cat " + log_filename)

if __name__ == "__main__":
    main()