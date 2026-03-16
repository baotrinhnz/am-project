#!/usr/bin/env python3
"""
Manual Music Detection Trigger for Raspberry Pi
================================================
Listens for commands from Supabase and triggers music detection on demand.
This allows the dashboard button to trigger detection remotely.
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

# Import music recognizer
try:
    from music_recognizer import MusicRecognizer
    HAS_RECOGNIZER = True
except ImportError:
    log.error("music_recognizer.py not found")
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
            log.info("Creating device_commands table...")

            # Create the table (this would normally be done via migration)
            create_table_sql = """
            CREATE TABLE IF NOT EXISTS device_commands (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                device_id VARCHAR(100) NOT NULL,
                command VARCHAR(100) NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                result JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                processed_at TIMESTAMP WITH TIME ZONE,

                INDEX idx_commands_device_status (device_id, status)
            );
            """
            # Note: In production, run this via Supabase dashboard or migration

    def poll_for_commands(self):
        """Poll Supabase for pending commands."""
        try:
            # Get pending commands for this device
            result = self.supabase.table("device_commands") \
                .select("*") \
                .eq("device_id", self.device_id) \
                .eq("status", "pending") \
                .order("created_at", desc=False) \
                .limit(1) \
                .execute()

            if result.data and len(result.data) > 0:
                return result.data[0]
            return None

        except Exception as e:
            log.error(f"Error polling for commands: {e}")
            return None

    def process_music_detection_command(self, command):
        """Process a music detection command."""
        command_id = command.get('id')
        log.info(f"Processing music detection command: {command_id}")

        try:
            # Update command status to processing
            self.supabase.table("device_commands") \
                .update({"status": "processing"}) \
                .eq("id", command_id) \
                .execute()

            # Perform music detection
            log.info("Starting music detection...")
            result = self.recognizer.record_and_recognize()

            if result:
                log.info(f"✓ Music detected: {result['title']} by {result['artist']}")

                # Save to music_detections table
                self.supabase.table("music_detections").insert({
                    'device_id': self.device_id,
                    'title': result['title'],
                    'artist': result['artist'],
                    'album': result.get('album'),
                    'spotify_url': result.get('spotify_url'),
                    'apple_music_url': result.get('apple_music_url'),
                    'detected_at': result['detected_at']
                }).execute()

                # Update command as completed with result
                self.supabase.table("device_commands") \
                    .update({
                        "status": "completed",
                        "result": {"song": result},
                        "processed_at": datetime.now(timezone.utc).isoformat()
                    }) \
                    .eq("id", command_id) \
                    .execute()

                return True
            else:
                log.info("No music detected")

                # Update command as completed with no result
                self.supabase.table("device_commands") \
                    .update({
                        "status": "completed",
                        "result": {"song": None, "message": "No music detected"},
                        "processed_at": datetime.now(timezone.utc).isoformat()
                    }) \
                    .eq("id", command_id) \
                    .execute()

                return False

        except Exception as e:
            log.error(f"Error processing command: {e}")

            # Update command as failed
            try:
                self.supabase.table("device_commands") \
                    .update({
                        "status": "failed",
                        "result": {"error": str(e)},
                        "processed_at": datetime.now(timezone.utc).isoformat()
                    }) \
                    .eq("id", command_id) \
                    .execute()
            except:
                pass

            return False

    def cleanup_old_commands(self):
        """Clean up old processed commands (older than 1 hour)."""
        try:
            one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

            self.supabase.table("device_commands") \
                .delete() \
                .in_("status", ["completed", "failed"]) \
                .lt("created_at", one_hour_ago) \
                .execute()

        except Exception as e:
            log.debug(f"Error cleaning up old commands: {e}")

    def run(self):
        """Main loop to listen for and process commands."""
        log.info(f"Music command listener started for device: {self.device_id}")
        log.info(f"Polling interval: {POLL_INTERVAL} seconds")
        log.info("Waiting for commands from dashboard...")

        cleanup_counter = 0

        while True:
            try:
                # Poll for commands
                command = self.poll_for_commands()

                if command:
                    command_type = command.get('command')

                    if command_type == 'detect_music':
                        self.process_music_detection_command(command)
                    else:
                        log.warning(f"Unknown command type: {command_type}")
                        # Mark as failed
                        self.supabase.table("device_commands") \
                            .update({
                                "status": "failed",
                                "result": {"error": f"Unknown command: {command_type}"}
                            }) \
                            .eq("id", command.get('id')) \
                            .execute()

                # Cleanup old commands every 100 iterations (200 seconds)
                cleanup_counter += 1
                if cleanup_counter >= 100:
                    self.cleanup_old_commands()
                    cleanup_counter = 0

                # Wait before next poll
                time.sleep(POLL_INTERVAL)

            except KeyboardInterrupt:
                log.info("Stopped by user")
                break
            except Exception as e:
                log.error(f"Error in main loop: {e}")
                time.sleep(POLL_INTERVAL)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Music Detection Command Listener")
    parser.add_argument("--test", action="store_true", help="Test music detection once")
    args = parser.parse_args()

    if args.test:
        # Test mode - run detection once
        log.info("Test mode: Running music detection once...")
        recognizer = MusicRecognizer()
        result = recognizer.record_and_recognize()
        if result:
            print(f"\n✓ Detected: {result['title']} by {result['artist']}")
        else:
            print("\n✗ No music detected")
    else:
        # Normal mode - listen for commands
        try:
            listener = MusicCommandListener()
            listener.run()
        except ValueError as e:
            log.error(f"Configuration error: {e}")
            log.info("Please check your .env file")
            sys.exit(1)
        except Exception as e:
            log.error(f"Failed to start listener: {e}")
            sys.exit(1)


if __name__ == "__main__":
    main()