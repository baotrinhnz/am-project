#!/usr/bin/env python3
"""
Music Auto Detector — Background Service
==========================================
Records audio every 2 minutes from USB mic (fallback MEMS) and sends to
AudD or ACRCloud for song recognition. Results saved to music_auto_detections.

Selected by DETECT_SERVICE env var: 'audd' or 'acrcloud'.
"""

import os
import time
import re
import base64
import hmac
import hashlib
import json
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from supabase import create_client

# ── Config ──────────────────────────────────────────────────────────────────
SUPABASE_URL    = os.getenv("SUPABASE_URL")
SUPABASE_KEY    = os.getenv("SUPABASE_SERVICE_KEY")
DEVICE_ID       = os.getenv("DEVICE_ID", "rpi-enviro-01")
VENUE_NAME      = os.getenv("VENUE_NAME", "Empire")
DETECT_SERVICE  = os.getenv("DETECT_SERVICE", "audd").lower()  # 'audd' or 'acrcloud'

AUDD_API_TOKEN        = os.getenv("AUDD_API_TOKEN")
ACRCLOUD_HOST         = os.getenv("ACRCLOUD_HOST")
ACRCLOUD_ACCESS_KEY   = os.getenv("ACRCLOUD_ACCESS_KEY")
ACRCLOUD_ACCESS_SECRET = os.getenv("ACRCLOUD_ACCESS_SECRET")

RECORD_DURATION = 10
SLEEP_INTERVAL  = 120      # 2 minutes
SAMPLE_RATE     = 48000
FALLBACK_DEVICE = "plughw:adau7002"

SAVE_DIR  = Path.home() / "Music_auto"
MAX_FILES = 5

MIC_LOCK = Path('/tmp/mic_in_use.lock')

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("music-detector-auto")


# ── Mic detection ────────────────────────────────────────────────────────────
def detect_mic():
    """(device, format, channels). USB preferred; fallback adau7002."""
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


# ── Recording ────────────────────────────────────────────────────────────────
def _next_file() -> Path:
    SAVE_DIR.mkdir(exist_ok=True)
    files = sorted(SAVE_DIR.glob("auto_*.wav"))
    while len(files) >= MAX_FILES:
        files.pop(0).unlink(missing_ok=True)
        files = sorted(SAVE_DIR.glob("auto_*.wav"))
    idx = len(files) + 1
    return SAVE_DIR / f"auto_{idx:03d}.wav"


def record_audio(device, fmt, channels, duration):
    # Wait if another service holds the mic
    waited = 0
    while MIC_LOCK.exists() and waited < 6:
        time.sleep(1); waited += 1
    if MIC_LOCK.exists():
        log.info("Mic still busy after 6s, skipping cycle")
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


# ── AudD ─────────────────────────────────────────────────────────────────────
def identify_audd(audio_file: Path) -> dict:
    """Returns normalized result dict."""
    try:
        with open(audio_file, 'rb') as f:
            r = requests.post(
                'https://api.audd.io/',
                data={'api_token': AUDD_API_TOKEN, 'return': 'spotify,deezer,musicbrainz'},
                files={'file': f},
                timeout=60
            )
        data = r.json()
        if data.get('status') == 'success' and data.get('result'):
            res = data['result']
            spotify = res.get('spotify') or {}
            deezer  = res.get('deezer') or {}
            return {
                'status': 'detected',
                'title':  res.get('title'),
                'artist': res.get('artist'),
                'album':  res.get('album'),
                'genre':  None,  # AudD doesn't provide genre
                'spotify_track_id': spotify.get('id'),
                'deezer_track_id':  deezer.get('id'),
                'service_track_id': res.get('song_link') or res.get('isrc'),
                'raw': data,
            }
        if data.get('status') == 'success' and not data.get('result'):
            return {'status': 'no_match', 'raw': data}
        return {'status': 'error', 'raw': data}
    except Exception as e:
        log.warning(f"AudD call failed: {e}")
        return {'status': 'error', 'raw': {'error': str(e)}}


# ── ACRCloud ─────────────────────────────────────────────────────────────────
def identify_acrcloud(audio_file: Path) -> dict:
    """Returns normalized result dict."""
    try:
        timestamp = str(int(time.time()))
        string_to_sign = "\n".join([
            "POST", "/v1/identify",
            ACRCLOUD_ACCESS_KEY, "audio", "1",
            timestamp
        ])
        sign = base64.b64encode(
            hmac.new(ACRCLOUD_ACCESS_SECRET.encode(), string_to_sign.encode(), hashlib.sha1).digest()
        ).decode()

        with open(audio_file, 'rb') as f:
            sample_bytes = f.read()

        data = {
            'access_key': ACRCLOUD_ACCESS_KEY,
            'sample_bytes': str(len(sample_bytes)),
            'timestamp': timestamp,
            'signature': sign,
            'data_type': 'audio',
            'signature_version': '1',
        }
        files = {'sample': sample_bytes}
        r = requests.post(f"https://{ACRCLOUD_HOST}/v1/identify",
                          data=data, files=files, timeout=60)
        res = r.json()

        status_code = res.get('status', {}).get('code')
        if status_code == 0 and res.get('metadata', {}).get('music'):
            track = res['metadata']['music'][0]
            external = track.get('external_metadata', {})
            spotify  = external.get('spotify', {}).get('track', {})
            deezer   = external.get('deezer', {}).get('track', {})
            genres   = track.get('genres', [])
            artists  = track.get('artists', [])
            return {
                'status': 'detected',
                'title':  track.get('title'),
                'artist': artists[0].get('name') if artists else None,
                'album':  (track.get('album') or {}).get('name'),
                'genre':  genres[0].get('name') if genres else None,
                'spotify_track_id': spotify.get('id'),
                'deezer_track_id':  deezer.get('id'),
                'service_track_id': track.get('acrid'),
                'raw': res,
            }
        if status_code == 1001:  # no result
            return {'status': 'no_match', 'raw': res}
        return {'status': 'error', 'raw': res}
    except Exception as e:
        log.warning(f"ACRCloud call failed: {e}")
        return {'status': 'error', 'raw': {'error': str(e)}}


# ── Deezer BPM (free, no auth) ──────────────────────────────────────────────
def get_deezer_bpm(track_id):
    """Returns BPM (float) from Deezer track endpoint, or None."""
    if not track_id:
        return None
    try:
        r = requests.get(f'https://api.deezer.com/track/{track_id}', timeout=10)
        if r.status_code == 200:
            data = r.json()
            bpm = data.get('bpm')
            return float(bpm) if bpm else None
        log.warning(f"Deezer HTTP {r.status_code}: {r.text[:100]}")
    except Exception as e:
        log.warning(f"Deezer BPM fetch failed: {e}")
    return None


# ── Supabase ─────────────────────────────────────────────────────────────────
def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_KEY not set")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def insert_bpm_reading(supabase, bpm: float):
    supabase.table("music_bpm_readings").insert({
        "device_id":   DEVICE_ID,
        "bpm":         bpm,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


def insert_detection(supabase, result: dict):
    supabase.table("music_auto_detections").insert({
        "device_id":        DEVICE_ID,
        "venue_name":       VENUE_NAME,
        "service":          DETECT_SERVICE,
        "status":           result['status'],
        "spotify_track_id": result.get('spotify_track_id'),
        "service_track_id": result.get('service_track_id'),
        "title":            result.get('title'),
        "artist":           result.get('artist'),
        "album":            result.get('album'),
        "genre":            result.get('genre'),
        "detected_at":      datetime.now(timezone.utc).isoformat(),
        "raw_response":     result.get('raw'),
    }).execute()


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    if DETECT_SERVICE == 'audd' and not AUDD_API_TOKEN:
        raise RuntimeError("DETECT_SERVICE=audd but AUDD_API_TOKEN not set")
    if DETECT_SERVICE == 'acrcloud' and not all([ACRCLOUD_HOST, ACRCLOUD_ACCESS_KEY, ACRCLOUD_ACCESS_SECRET]):
        raise RuntimeError("DETECT_SERVICE=acrcloud but ACRCLOUD_* creds not set")
    if DETECT_SERVICE not in ('audd', 'acrcloud'):
        raise RuntimeError(f"Unknown DETECT_SERVICE: {DETECT_SERVICE}")

    log.info(f"Music Auto Detector | device={DEVICE_ID} | venue={VENUE_NAME} | service={DETECT_SERVICE}")
    supabase = get_supabase()
    device, fmt, channels = detect_mic()
    log.info(f"Cycle: record {RECORD_DURATION}s every {SLEEP_INTERVAL}s")

    identify = identify_audd if DETECT_SERVICE == 'audd' else identify_acrcloud

    while True:
        try:
            audio = record_audio(device, fmt, channels, RECORD_DURATION)
            if audio:
                result = identify(audio)
                insert_detection(supabase, result)
                if result['status'] == 'detected':
                    log.info(f"Detected: {result['artist']} - {result['title']}"
                             + (f" [{result['genre']}]" if result.get('genre') else ""))
                    # Fetch BPM from Deezer and write to music_bpm_readings
                    deezer_id = result.get('deezer_track_id')
                    if deezer_id:
                        tempo = get_deezer_bpm(deezer_id)
                        if tempo and tempo > 0:
                            bpm = round(float(tempo), 1)
                            try:
                                insert_bpm_reading(supabase, bpm)
                                log.info(f"  → Deezer BPM: {bpm}")
                            except Exception as e:
                                log.warning(f"  → BPM insert failed: {e}")
                else:
                    log.info(f"Status: {result['status']}")
        except Exception as e:
            log.error(f"Cycle error: {e}")
        time.sleep(SLEEP_INTERVAL)


if __name__ == "__main__":
    main()
