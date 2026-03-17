#!/usr/bin/env python3
"""
BPM Monitor — Background Service
==================================
Continuously records short audio clips from MEMS microphone,
detects beat rate (BPM) using aubio, and sends readings to Supabase.

Runs independently from music detection — always on, like sensor_reader.
Cycle: record 5s → detect BPM → insert to Supabase → sleep 10s → repeat
"""

import os
import re
import time
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

RECORD_DURATION = 8      # seconds per sample
SLEEP_INTERVAL  = 10     # seconds between samples
SAMPLE_RATE     = 48000  # MEMS mic native rate
CHANNELS        = 2      # Stereo — required by ADAU7002 hardware
FORMAT          = "S32_LE"  # 32-bit — ADAU7002 native format

SAVE_DIR        = Path.home() / "Music_beating"
MAX_FILES       = 10     # rotate after 10 files

MEMS_KEYWORDS = ['iq', 'mems', 'sndrpii', 'dmic', 'ics43', 'enviro', 'i2s', 'adau']

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("bpm-monitor")

_log_path = Path.home() / "bpm_monitor.log"
_file_handler = logging.handlers.TimedRotatingFileHandler(
    _log_path, when="midnight", interval=1, backupCount=30, encoding="utf-8"
)
_file_handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
))
log.addHandler(_file_handler)


# ── Mic detection ─────────────────────────────────────────────────────────────
def find_mems_device() -> str:
    """Find MEMS mic by name so card number changes on reboot don't break it."""
    try:
        result = subprocess.run(['arecord', '-l'], capture_output=True, text=True)
        if result.returncode != 0:
            return "plughw:2,0"

        for line in result.stdout.splitlines():
            line_lower = line.lower()
            if 'card' not in line_lower or 'hdmi' in line_lower:
                continue
            if any(kw in line_lower for kw in MEMS_KEYWORDS):
                match = re.search(r'card\s+(\d+):.*device\s+(\d+):', line)
                if match:
                    device = f"plughw:{match.group(1)},{match.group(2)}"
                    log.info(f"Found MEMS mic: {device} — {line.strip()}")
                    return device

        # Fallback: last non-HDMI capture device
        last = None
        for line in result.stdout.splitlines():
            if 'card' not in line.lower() or 'hdmi' in line.lower():
                continue
            match = re.search(r'card\s+(\d+):.*device\s+(\d+):', line)
            if match:
                last = f"plughw:{match.group(1)},{match.group(2)}"
        if last:
            log.warning(f"MEMS not found by keyword, using: {last}")
            return last

    except Exception as e:
        log.warning(f"Device detection error: {e}")

    return "plughw:2,0"


# ── Recording ─────────────────────────────────────────────────────────────────
def _next_file() -> Path:
    """Return next rotated file path in Music_beating/, delete oldest if over limit."""
    SAVE_DIR.mkdir(exist_ok=True)
    files = sorted(SAVE_DIR.glob("bpm_*.wav"))
    while len(files) >= MAX_FILES:
        files.pop(0).unlink(missing_ok=True)
        files = sorted(SAVE_DIR.glob("bpm_*.wav"))
    idx = len(files) + 1
    return SAVE_DIR / f"bpm_{idx:03d}.wav"


def record_audio(device: str, duration: int) -> Path | None:
    """Record audio to Music_beating/ with rotation. Returns path or None on failure."""
    out = _next_file()

    cmd = [
        'arecord',
        '-D', device,
        '-f', FORMAT,
        '-r', str(SAMPLE_RATE),
        '-c', str(CHANNELS),
        '-d', str(duration),
        '-t', 'wav',
        str(out)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not out.exists() or out.stat().st_size == 0:
        log.warning(f"Recording failed: {result.stderr.strip()}")
        out.unlink(missing_ok=True)
        return None

    # Boost 15dB — MEMS mic is very quiet
    boosted = out.with_suffix('.boosted.wav')
    boost_result = subprocess.run(
        ['sox', str(out), str(boosted), 'vol', '15dB'],
        capture_output=True, text=True
    )
    out.unlink(missing_ok=True)
    if boost_result.returncode != 0 or not boosted.exists():
        log.warning("sox boost failed, skipping")
        boosted.unlink(missing_ok=True)
        return None
    return boosted


# ── BPM Detection ─────────────────────────────────────────────────────────────
def detect_bpm(audio_file: Path) -> float | None:
    """Detect BPM from WAV file using aubio tempo detection.
    Returns BPM float or None if no beat detected.
    """
    try:
        win_s  = 1024
        hop_s  = 512

        source  = aubio.source(str(audio_file), SAMPLE_RATE, hop_s)
        tempo   = aubio.tempo("default", win_s, hop_s, SAMPLE_RATE)
        beats   = []

        while True:
            samples, read = source()
            is_beat = tempo(samples)
            if is_beat:
                beats.append(tempo.get_last_s())
            if read < hop_s:
                break

        if len(beats) < 2:
            return None  # Not enough beats detected — silence or noise

        bpm = tempo.get_bpm()
        if bpm < 40 or bpm > 220:
            return None  # Out of realistic music range

        return round(float(bpm), 1)

    except Exception as e:
        log.warning(f"BPM detection error: {e}")
        return None


# ── Supabase ──────────────────────────────────────────────────────────────────
def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def insert_bpm(supabase, bpm: float):
    supabase.table("bpm_readings").insert({
        "device_id":   DEVICE_ID,
        "bpm":         bpm,
        "recorded_at": datetime.now(timezone.utc).isoformat()
    }).execute()


# ── Main loop ─────────────────────────────────────────────────────────────────
def main():
    log.info(f"BPM Monitor starting | device={DEVICE_ID}")

    supabase = get_supabase()
    mic = find_mems_device()
    log.info(f"Using mic: {mic} | cycle: {RECORD_DURATION}s record + {SLEEP_INTERVAL}s sleep")

    while True:
        try:
            audio = record_audio(mic, RECORD_DURATION)
            if audio is None:
                time.sleep(SLEEP_INTERVAL)
                continue

            bpm = detect_bpm(audio)

            if bpm:
                insert_bpm(supabase, bpm)
                log.info(f"BPM: {bpm}")
            else:
                log.debug("No beat detected, skipping insert")

        except Exception as e:
            log.error(f"Cycle error: {e}")

        time.sleep(SLEEP_INTERVAL)


if __name__ == "__main__":
    main()
