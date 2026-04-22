#!/usr/bin/env python3
"""
Music BPM Monitor — Background Service
========================================
Periodically records from USB mic (music-oriented), detects BPM locally
using aubio (no AudD), and pushes to music_bpm_readings table.

Cycle: every 5 minutes → record 10s → detect BPM → insert to Supabase.
"""

import os
import time
import re
import logging
import logging.handlers
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import aubio
from supabase import create_client

# ── Config ──────────────────────────────────────────────────────────────────
SUPABASE_URL  = os.getenv("SUPABASE_URL")
SUPABASE_KEY  = os.getenv("SUPABASE_SERVICE_KEY")
DEVICE_ID     = os.getenv("DEVICE_ID", "rpi-enviro-01")

RECORD_DURATION = 10          # seconds per sample
SLEEP_INTERVAL  = 300         # 5 minutes between samples
SAMPLE_RATE     = 48000
FALLBACK_DEVICE = "plughw:adau7002"

SAVE_DIR = Path.home() / "Music_beat"
MAX_FILES = 5

MIC_LOCK      = Path('/tmp/mic_in_use.lock')
PRIORITY_LOCK = Path('/tmp/music_detection_active.lock')

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("music-bpm-monitor")


# ── Mic detection (USB preferred) ────────────────────────────────────────────
def detect_mic():
    """Returns (device, format, channels). Prefer USB mic, fallback to adau7002."""
    try:
        result = subprocess.run(['arecord', '-l'], capture_output=True, text=True)
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                m = re.match(r'^card\s+\d+:\s+(\S+)', line)
                if m and m.group(1) != 'adau7002':
                    device = f"plughw:{m.group(1)}"
                    log.info(f"USB mic detected: {device} (S16_LE mono)")
                    return device, "S16_LE", 1
    except Exception as e:
        log.warning(f"Mic detection failed: {e}")
    log.info(f"No USB mic, using MEMS: {FALLBACK_DEVICE} (S32_LE stereo)")
    return FALLBACK_DEVICE, "S32_LE", 2


# ── Recording ─────────────────────────────────────────────────────────────────
def _next_file() -> Path:
    SAVE_DIR.mkdir(exist_ok=True)
    files = sorted(SAVE_DIR.glob("music_bpm_*.wav"))
    while len(files) >= MAX_FILES:
        files.pop(0).unlink(missing_ok=True)
        files = sorted(SAVE_DIR.glob("music_bpm_*.wav"))
    idx = len(files) + 1
    return SAVE_DIR / f"music_bpm_{idx:03d}.wav"


def record_audio(device: str, fmt: str, channels: int, duration: int) -> Path | None:
    # Yield mic to music_recognizer if it has priority
    if PRIORITY_LOCK.exists():
        log.info("Music detection active, skipping MBP cycle")
        return None

    out = _next_file()
    MIC_LOCK.touch()
    try:
        cmd = [
            'arecord', '-D', device,
            '-f', fmt, '-r', str(SAMPLE_RATE), '-c', str(channels),
            '-d', str(duration), '-t', 'wav',
            str(out)
        ]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0 or not out.exists() or out.stat().st_size == 0:
            log.warning(f"Recording failed (rc={result.returncode})")
            out.unlink(missing_ok=True)
            return None
        return out
    finally:
        MIC_LOCK.unlink(missing_ok=True)


# ── BPM Detection ─────────────────────────────────────────────────────────────
def detect_bpm(audio_file: Path) -> float | None:
    try:
        win_s, hop_s = 1024, 512
        source = aubio.source(str(audio_file), SAMPLE_RATE, hop_s)
        tempo = aubio.tempo("default", win_s, hop_s, SAMPLE_RATE)
        beats = []
        while True:
            samples, read = source()
            if tempo(samples)[0]:
                beats.append(tempo.get_last_s())
            if read < hop_s:
                break
        if len(beats) < 3:
            return None
        bpm = tempo.get_bpm()
        if bpm < 40 or bpm > 220:
            return None
        return round(float(bpm), 1)
    except Exception as e:
        log.warning(f"BPM detection error: {e}")
        return None


# ── Supabase ──────────────────────────────────────────────────────────────────
def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_KEY not set")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def insert_bpm(supabase, bpm: float):
    supabase.table("music_bpm_readings").insert({
        "device_id":   DEVICE_ID,
        "bpm":         bpm,
        "recorded_at": datetime.now(timezone.utc).isoformat()
    }).execute()


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    log.info(f"Music BPM Monitor starting | device={DEVICE_ID}")
    supabase = get_supabase()
    device, fmt, channels = detect_mic()
    log.info(f"Cycle: record {RECORD_DURATION}s every {SLEEP_INTERVAL}s")

    while True:
        try:
            audio = record_audio(device, fmt, channels, RECORD_DURATION)
            if audio:
                bpm = detect_bpm(audio)
                if bpm:
                    insert_bpm(supabase, bpm)
                    log.info(f"Music BPM: {bpm}")
                else:
                    log.info("No beat detected")
        except Exception as e:
            log.error(f"Cycle error: {e}")
        time.sleep(SLEEP_INTERVAL)


if __name__ == "__main__":
    main()
