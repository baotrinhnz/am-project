#!/usr/bin/env python3
"""
Manual Music Detection Trigger with File Rotation
==================================================
Listens for commands from Supabase and triggers music detection on demand.
Saves recordings to Music_for_delete folder with rotation (max 10 files).
"""

import os
import sys
import time
import json
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Load environment variables
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
DEVICE_ID = os.getenv("DEVICE_ID", "rpi-enviro-01")
POLL_INTERVAL = 2  # Check for commands every 2 seconds

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("music-trigger")

# Import Supabase client
try:
    from supabase import create_client, Client
    HAS_SUPABASE = True
except ImportError:
    log.error("supabase-py not installed. Install with: pip3 install supabase-py")
    HAS_SUPABASE = False
    sys.exit(1)

# Import music recognizer with rotation
try:
    from music_recognizer_with_rotation import MusicRecognizer
    HAS_RECOGNIZER = True
except ImportError:
    log.error("music_recognizer_with_rotation.py not found")
    HAS_RECOGNIZER = False
    sys.exit(1)


class MusicCommandListener:
    """Listens for music detection commands from Supabase."""

    def __init__(self):
        """Initialize the command listener."""
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")

        self.supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        self.recognizer = MusicRecognizer()
        self.device_id = DEVICE_ID

        # Create commands table if it doesn't exist
        self._ensure_commands_table()

    def _ensure_commands_table(self):
        """Ensure the device_commands table exists."""
        try:
            # Try to select from the table
            self.supabase.table("device_commands").select("id").limit(1).execute()
            log.info("device_commands table exists")
        except Exception as e:
            log.warning(f"device_commands table might not exist: {e}")

    def poll_for_commands(self):
        """Poll Supabase for pending commands."""
        try:
            # Get pending commands for this device
            result = self.supabase.table("device_commands") \
                .select("*") \
                .eq("device_id", self.device_id) \
                .eq("status", "pending") \
                .order("created_at") \
                .limit(1) \
                .execute()

            if result.data and len(result.data) > 0:
                command = result.data[0]
                log.info(f"Found pending command: {command['command']}")

                # Process the command
                self.process_command(command)

        except Exception as e:
            log.error(f"Error polling commands: {e}")

    def process_command(self, command):
        """Process a single command."""
        command_id = command['id']
        command_type = command['command']

        try:
            # Update status to processing
            self.supabase.table("device_commands") \
                .update({"status": "processing"}) \
                .eq("id", command_id) \
                .execute()

            if command_type == "detect_music":
                log.info("Processing music detection command...")

                # Record audio with rotation
                audio_file = self.recognizer.record_audio_mems()

                if audio_file:
                    log.info(f"Audio recorded: {audio_file}")

                    # Recognize music
                    result = self.recognizer.recognize_music(audio_file)

                    if 'error' not in result and result.get('result'):
                        song = result['result']
                        log.info(f"Music detected: {song.get('artist')} - {song.get('title')}")

                        # Save to music_detections table
                        detection_data = {
                            "device_id": self.device_id,
                            "song_title": song.get('title', 'Unknown'),
                            "artist": song.get('artist', 'Unknown'),
                            "album": song.get('album'),
                            "release_date": song.get('release_date'),
                            "duration_ms": song.get('duration_ms'),
                            "spotify_id": song.get('spotify', {}).get('id') if song.get('spotify') else None,
                            "raw_response": result,
                            "audio_file": str(audio_file),  # Save file path
                            "detected_at": datetime.now(timezone.utc).isoformat()
                        }

                        self.supabase.table("music_detections").insert(detection_data).execute()

                        # Update command as completed with result
                        self.supabase.table("device_commands") \
                            .update({
                                "status": "completed",
                                "result": {
                                    "success": True,
                                    "song": f"{song.get('artist')} - {song.get('title')}",
                                    "audio_file": str(audio_file)
                                },
                                "processed_at": datetime.now(timezone.utc).isoformat()
                            }) \
                            .eq("id", command_id) \
                            .execute()

                        log.info(f"Command completed successfully. Audio saved to: {audio_file}")

                    else:
                        # No music detected
                        error_msg = result.get('error', 'No music detected')
                        log.warning(f"No music detected: {error_msg}")

                        self.supabase.table("device_commands") \
                            .update({
                                "status": "failed",
                                "result": {
                                    "success": False,
                                    "error": error_msg,
                                    "audio_file": str(audio_file) if audio_file else None
                                },
                                "processed_at": datetime.now(timezone.utc).isoformat()
                            }) \
                            .eq("id", command_id) \
                            .execute()

                else:
                    # Recording failed
                    log.error("Recording failed")

                    self.supabase.table("device_commands") \
                        .update({
                            "status": "failed",
                            "result": {"success": False, "error": "Recording failed"},
                            "processed_at": datetime.now(timezone.utc).isoformat()
                        }) \
                        .eq("id", command_id) \
                        .execute()

            else:
                log.warning(f"Unknown command type: {command_type}")

                self.supabase.table("device_commands") \
                    .update({
                        "status": "failed",
                        "result": {"success": False, "error": f"Unknown command: {command_type}"},
                        "processed_at": datetime.now(timezone.utc).isoformat()
                    }) \
                    .eq("id", command_id) \
                    .execute()

        except Exception as e:
            log.error(f"Error processing command: {e}")

            try:
                self.supabase.table("device_commands") \
                    .update({
                        "status": "failed",
                        "result": {"success": False, "error": str(e)},
                        "processed_at": datetime.now(timezone.utc).isoformat()
                    }) \
                    .eq("id", command_id) \
                    .execute()
            except:
                pass

    def run(self):
        """Main loop - poll for commands continuously."""
        log.info(f"Starting command listener for device: {self.device_id}")
        log.info(f"Polling interval: {POLL_INTERVAL} seconds")
        log.info(f"Recordings will be saved to: ~/Music_for_delete/")
        log.info("Waiting for commands...")

        while True:
            try:
                self.poll_for_commands()
                time.sleep(POLL_INTERVAL)
            except KeyboardInterrupt:
                log.info("Stopping command listener...")
                break
            except Exception as e:
                log.error(f"Unexpected error: {e}")
                time.sleep(POLL_INTERVAL)


def main():
    """Main entry point."""
    if not HAS_SUPABASE:
        print("ERROR: supabase-py not installed")
        sys.exit(1)

    if not HAS_RECOGNIZER:
        print("ERROR: music_recognizer_with_rotation.py not found")
        sys.exit(1)

    try:
        listener = MusicCommandListener()
        listener.run()
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        log.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()