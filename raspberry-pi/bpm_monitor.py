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

RECORD_DURATION = 5      # seconds per sample
SLEEP_INTERVAL  = 10     # seconds between samples
SAMPLE_RATE     = 48000  # 48kHz native rate of adau7002 I2S mic
CHANNELS        = 2
FORMAT          = "S32_LE"

SAVE_DIR        = Path.home() / "Ambient_beats"
MAX_FILES       = 10     # rotate after 10 files

ALSA_DEVICE   = "plughw:adau7002"  # name-based — survives reboot card renumbering

MIC_LOCK      = Path('/tmp/mic_in_use.lock')       # held while recording
PRIORITY_LOCK = Path('/tmp/music_detection_active.lock')  # music detection wants mic

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
    """Record audio with priority awareness. Skips cycle if music detection is active."""
    # Don't start if music detection already has priority
    if PRIORITY_LOCK.exists():
        log.debug("Music detection active, skipping BPM cycle")
        return None

    out = _next_file()
    MIC_LOCK.touch()
    try:
        cmd = [
            'arecord', '-D', device,
            '-f', FORMAT, '-r', str(SAMPLE_RATE), '-c', str(CHANNELS),
            '-d', str(duration), '-t', 'wav',
            '--buffer-size=16384',
            str(out)
        ]
        result = subprocess.run(cmd, capture_output=True)

        if result.returncode != 0 or not out.exists() or out.stat().st_size == 0:
            log.warning(f"Recording failed (rc={result.returncode})")
            out.unlink(missing_ok=True)
            return None

    finally:
        MIC_LOCK.unlink(missing_ok=True)

    # Boost 15dB — MEMS mic is very quiet
    boosted = out.with_suffix('.boosted.wav')
    boost_result = subprocess.run(
        ['sox', str(out), str(boosted), 'norm', '-3'],
        capture_output=True, text=True
    )
    out.unlink(missing_ok=True)
    if boost_result.returncode != 0 or not boosted.exists():
        log.warning("sox boost failed, skipping")
        boosted.unlink(missing_ok=True)
        return None
    return boosted


# ── BPM Detection ─────────────────────────────────────────────────────────────
def detect_bpm(audio_file: Path) -> tuple[float, float] | tuple[None, None]:
    """Detect BPM from WAV file using aubio tempo detection.
    Returns (bpm, confidence) or (None, None) if no beat detected.
    """
    try:
        win_s  = 1024
        hop_s  = 512

        source  = aubio.source(str(audio_file), SAMPLE_RATE, hop_s)
        tempo   = aubio.tempo("default", win_s, hop_s, SAMPLE_RATE)
        beats = []

        while True:
            samples, read = source()
            if tempo(samples)[0]:
                beats.append(tempo.get_last_s())
            if read < hop_s:
                break

        if len(beats) < 3:
            return None, None  # Not enough beats

        bpm = tempo.get_bpm()
        if bpm < 40 or bpm > 220:
            return None, None  # Out of realistic music range

        # Beat regularity as confidence: regular intervals = music, irregular = noise
        intervals = [beats[i+1] - beats[i] for i in range(len(beats) - 1)]
        mean_i = sum(intervals) / len(intervals)
        std_i  = (sum((x - mean_i) ** 2 for x in intervals) / len(intervals)) ** 0.5
        cv     = std_i / mean_i if mean_i > 0 else 1.0
        confidence = max(0.0, min(1.0, 1.0 - cv * 3))
        return round(float(bpm), 1), round(confidence, 3)

    except Exception as e:
        log.warning(f"BPM detection error: {e}")
        return None, None


# ── Supabase ──────────────────────────────────────────────────────────────────
def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


DEFAULT_CONFIDENCE_THRESHOLD = 0.4

def fetch_confidence_threshold(supabase) -> float:
    """Fetch bpm_confidence_threshold from device_settings. Falls back to default."""
    try:
        res = supabase.table("device_settings") \
            .select("bpm_confidence_threshold") \
            .eq("device_id", DEVICE_ID) \
            .single() \
            .execute()
        val = res.data.get("bpm_confidence_threshold") if res.data else None
        return float(val) if val is not None else DEFAULT_CONFIDENCE_THRESHOLD
    except Exception:
        return DEFAULT_CONFIDENCE_THRESHOLD


def insert_bpm(supabase, bpm: float, table: str):
    supabase.table(table).insert({
        "device_id":   DEVICE_ID,
        "bpm":         bpm,
        "recorded_at": datetime.now(timezone.utc).isoformat()
    }).execute()


# ── Main loop ─────────────────────────────────────────────────────────────────
THRESHOLD_RELOAD_INTERVAL = 300  # reload threshold every 5 minutes

def main():
    log.info(f"BPM Monitor starting | device={DEVICE_ID}")

    supabase = get_supabase()
    mic = ALSA_DEVICE
    log.info(f"Using mic: {mic} | cycle: {RECORD_DURATION}s record + {SLEEP_INTERVAL}s sleep")

    threshold = fetch_confidence_threshold(supabase)
    log.info(f"Music confidence threshold: {threshold}")
    last_threshold_reload = time.time()

    while True:
        try:
            # Reload threshold every 5 minutes
            if time.time() - last_threshold_reload > THRESHOLD_RELOAD_INTERVAL:
                threshold = fetch_confidence_threshold(supabase)
                last_threshold_reload = time.time()
                log.info(f"Threshold reloaded: {threshold}")

            audio = record_audio(mic, RECORD_DURATION)
            if audio is None:
                time.sleep(SLEEP_INTERVAL)
                continue

            bpm, _ = detect_bpm(audio)

            if bpm is None:
                log.debug("No beat detected, skipping")
            else:
                insert_bpm(supabase, bpm, "bpm_readings")
                log.info(f"Ambient BPM: {bpm}")

        except Exception as e:
            log.error(f"Cycle error: {e}")

        time.sleep(SLEEP_INTERVAL)


if __name__ == "__main__":
    main()
