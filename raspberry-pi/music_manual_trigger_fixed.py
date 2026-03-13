#!/usr/bin/env python3
"""
Music Manual Trigger Script with Fixed Audio Recording
Listens for commands from dashboard and triggers music recognition using arecord
"""
import os
import sys
import json
import time
import subprocess
import tempfile
import logging
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv
import requests
import scipy.io.wavfile as wavfile

# Load environment variables
load_dotenv()

# Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
AUDD_API_TOKEN = os.getenv('AUDD_API_TOKEN')
DEVICE_ID = 'rpi-enviro-01'
POLL_INTERVAL = 2  # seconds
RECORDING_DURATION = 10  # seconds
SAMPLE_RATE = 44100

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Initialize Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def check_table_exists():
    """Check if device_commands table exists"""
    try:
        result = supabase.table('device_commands').select('id').limit(1).execute()
        logger.info("device_commands table exists")
        return True
    except Exception as e:
        logger.error(f"Table check failed: {e}")
        logger.error("Please run: node supabase/run_music_migrations.js")
        return False

def record_audio_arecord():
    """Record audio using arecord command (more reliable for MEMS mic)"""
    logger.info(f"Recording {RECORDING_DURATION} seconds of audio with arecord...")

    try:
        # Create temporary file
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
            tmp_filename = tmp_file.name

        # Record using arecord with MEMS microphone
        cmd = [
            'arecord',
            '-D', 'plughw:2,0',  # MEMS microphone device
            '-f', 'S16_LE',      # Format: 16-bit signed little endian
            '-r', str(SAMPLE_RATE),  # Sample rate
            '-c', '1',           # Mono
            '-d', str(RECORDING_DURATION),  # Duration
            tmp_filename
        ]

        logger.info(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            logger.error(f"arecord failed: {result.stderr}")
            return None

        # Read the recorded audio
        sample_rate, audio_data = wavfile.read(tmp_filename)
        logger.info(f"Recording complete! Sample rate: {sample_rate}, Shape: {audio_data.shape}")

        # Check audio level
        max_level = max(abs(audio_data.min()), abs(audio_data.max()))
        logger.info(f"Max audio level: {max_level}")

        if max_level < 100:
            logger.warning("Audio level very low - might be silence!")

        # Keep the file for sending
        return tmp_filename

    except Exception as e:
        logger.error(f"Error recording audio: {e}")
        return None

def recognize_music_from_file(audio_file):
    """Send audio file to AudD API for recognition"""
    if not audio_file or not os.path.exists(audio_file):
        logger.error("No audio file to process")
        return None

    logger.info(f"Sending audio file to AudD API...")

    try:
        # Read the audio file
        with open(audio_file, 'rb') as f:
            files = {'file': ('audio.wav', f, 'audio/wav')}
            data = {
                'api_token': AUDD_API_TOKEN,
                'return': 'apple_music,spotify'
            }

            # Send to AudD
            response = requests.post(
                'https://api.audd.io/',
                files=files,
                data=data,
                timeout=30
            )

        # Parse response
        result = response.json()
        logger.info(f"AudD Response Status: {result.get('status')}")

        if result.get('status') == 'error':
            error_msg = result.get('error', {}).get('error_message', 'Unknown error')
            logger.error(f"AudD Error: {error_msg}")
            return None

        if result.get('status') == 'success' and result.get('result'):
            song = result['result']
            logger.info(f"Song recognized: {song.get('title')} by {song.get('artist')}")
            return song
        else:
            logger.info("No song recognized")
            return None

    except Exception as e:
        logger.error(f"Error calling AudD API: {e}")
        return None
    finally:
        # Cleanup temp file
        try:
            if audio_file and os.path.exists(audio_file):
                os.unlink(audio_file)
        except:
            pass

def save_detection(song_data, confidence=0.95):
    """Save music detection to database"""
    try:
        detection = {
            'device_id': DEVICE_ID,
            'title': song_data.get('title', 'Unknown'),
            'artist': song_data.get('artist', 'Unknown'),
            'album': song_data.get('album', ''),
            'release_date': song_data.get('release_date', ''),
            'label': song_data.get('label', ''),
            'song_link': song_data.get('song_link', ''),
            'spotify_url': song_data.get('spotify', {}).get('external_urls', {}).get('spotify', '') if song_data.get('spotify') else '',
            'apple_music_url': song_data.get('apple_music', {}).get('url', '') if song_data.get('apple_music') else '',
            'confidence': confidence,
            'raw_result': json.dumps(song_data)
        }

        result = supabase.table('music_detections').insert(detection).execute()
        logger.info(f"Detection saved to database with ID: {result.data[0]['id']}")
        return True
    except Exception as e:
        logger.error(f"Error saving detection: {e}")
        return False

def process_music_command(command):
    """Process a music recognition command"""
    command_id = command['id']
    logger.info(f"Processing music command {command_id}")

    try:
        # Update command status to processing
        supabase.table('device_commands').update({
            'status': 'processing',
            'processed_at': datetime.utcnow().isoformat()
        }).eq('id', command_id).execute()

        # Record audio using arecord
        audio_file = record_audio_arecord()

        if audio_file:
            # Recognize music
            song = recognize_music_from_file(audio_file)

            if song:
                # Save detection
                save_detection(song)

                # Update command as completed
                supabase.table('device_commands').update({
                    'status': 'completed',
                    'result': json.dumps({
                        'success': True,
                        'song': {
                            'title': song.get('title'),
                            'artist': song.get('artist'),
                            'album': song.get('album')
                        }
                    })
                }).eq('id', command_id).execute()

                logger.info(f"Command {command_id} completed successfully")
            else:
                # No song recognized
                supabase.table('device_commands').update({
                    'status': 'completed',
                    'result': json.dumps({
                        'success': False,
                        'message': 'No song recognized'
                    })
                }).eq('id', command_id).execute()

                logger.info(f"Command {command_id} completed - no song recognized")
        else:
            # Recording failed
            supabase.table('device_commands').update({
                'status': 'failed',
                'result': json.dumps({
                    'success': False,
                    'error': 'Failed to record audio'
                })
            }).eq('id', command_id).execute()

            logger.error(f"Command {command_id} failed - recording error")

    except Exception as e:
        logger.error(f"Error processing command: {e}")

        # Update command as failed
        try:
            supabase.table('device_commands').update({
                'status': 'failed',
                'result': json.dumps({
                    'success': False,
                    'error': str(e)
                })
            }).eq('id', command_id).execute()
        except:
            pass

def main():
    """Main loop to poll for commands"""
    logger.info("Music command listener started for device: " + DEVICE_ID)
    logger.info(f"Polling interval: {POLL_INTERVAL} seconds")

    # Check if table exists
    if not check_table_exists():
        logger.error("Required tables not found. Exiting.")
        return

    logger.info("Waiting for commands from dashboard...")

    while True:
        try:
            # Check for pending commands
            result = supabase.table('device_commands').select("*").eq(
                'device_id', DEVICE_ID
            ).eq(
                'status', 'pending'
            ).order(
                'created_at', desc=False
            ).limit(1).execute()

            if result.data and len(result.data) > 0:
                command = result.data[0]

                if command['command'] == 'listen_music':
                    logger.info(f"Received music listen command: {command['id']}")
                    process_music_command(command)
                else:
                    logger.info(f"Unknown command: {command['command']}")

            # Wait before next poll
            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            logger.info("Shutting down...")
            break
        except Exception as e:
            logger.error(f"Error in main loop: {e}")
            time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()