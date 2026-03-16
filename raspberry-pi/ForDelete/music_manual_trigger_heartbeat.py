#!/usr/bin/env python3
"""
Manual Music Detection Trigger with Heartbeat
==============================================
Listens for commands from Supabase and triggers music detection on demand.
Sends heartbeat to track service status.
"""

import os
import sys
import time
import json
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
import threading

# Load environment variables
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
DEVICE_ID = os.getenv("DEVICE_ID", "rpi-enviro-01")
POLL_INTERVAL = 2  # Check for commands every 2 seconds
HEARTBEAT_INTERVAL = 30  # Send heartbeat every 30 seconds

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
    """Listens for music detection commands from Supabase with heartbeat."""

    def __init__(self):
        """Initialize the command listener."""
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")

        self.supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        self.recognizer = MusicRecognizer()
        self.device_id = DEVICE_ID
        self.running = True

        # Ensure tables exist
        self._ensure_tables()

        # Start heartbeat thread
        self.heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self.heartbeat_thread.start()

    def _ensure_tables(self):
        """Ensure required tables exist."""
        try:
            # Check device_commands table
            self.supabase.table("device_commands").select("id").limit(1).execute()
            log.info("device_commands table exists")
        except Exception as e:
            log.warning(f"device_commands table might not exist: {e}")

        # Initialize device status
        self._send_heartbeat("starting")

    def _send_heartbeat(self, status="running"):
        """Send heartbeat to device_status table."""
        try:
            data = {
                "device_id": self.device_id,
                "service_name": "music-recognition",
                "last_seen": datetime.now(timezone.utc).isoformat(),
                "status": status,
                "metadata": {
                    "poll_interval": POLL_INTERVAL,
                    "heartbeat_interval": HEARTBEAT_INTERVAL,
                    "version": "1.0.0"
                }
            }

            # Upsert device status
            result = self.supabase.table("device_status").upsert(
                data,
                on_conflict="device_id,service_name"
            ).execute()

            if status == "starting":
                log.info(f"Service starting, heartbeat sent")

        except Exception as e:
            # Don't log every heartbeat error to avoid spam
            if status == "starting":
                log.warning(f"Could not send heartbeat: {e}")

    def _heartbeat_loop(self):
        """Background thread to send heartbeats."""
        while self.running:
            time.sleep(HEARTBEAT_INTERVAL)
            if self.running:
                self._send_heartbeat()

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

            # Update heartbeat to show we're processing
            self._send_heartbeat("processing")

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
                            "audio_file": str(audio_file),
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

            # Back to running status
            self._send_heartbeat("running")

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

            # Update heartbeat to show error
            self._send_heartbeat("error")

    def run(self):
        """Main loop - poll for commands continuously."""
        log.info(f"Starting command listener for device: {self.device_id}")
        log.info(f"Polling interval: {POLL_INTERVAL} seconds")
        log.info(f"Heartbeat interval: {HEARTBEAT_INTERVAL} seconds")
        log.info(f"Recordings will be saved to: ~/Music_for_delete/")
        log.info("Waiting for commands...")

        while self.running:
            try:
                self.poll_for_commands()
                time.sleep(POLL_INTERVAL)
            except KeyboardInterrupt:
                log.info("Stopping command listener...")
                self.running = False
                break
            except Exception as e:
                log.error(f"Unexpected error: {e}")
                time.sleep(POLL_INTERVAL)

        # Send final heartbeat
        self._send_heartbeat("stopped")

    def stop(self):
        """Stop the service gracefully."""
        self.running = False
        self._send_heartbeat("stopping")


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