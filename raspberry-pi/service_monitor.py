#!/usr/bin/env python3
"""
Pi Service Monitor — Lark Alert
=================================
Kiểm tra các systemd services mỗi MONITOR_INTERVAL giây.
Gửi Lark webhook alert khi service DOWN hoặc RECOVERED.
Kiểm tra thêm application-level lỗi cho music-detector-auto.
"""

import os
import time
import subprocess
import logging
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path.home() / ".env")

# ── Config ───────────────────────────────────────────────────────────────────
LARK_WEBHOOK_URL     = os.getenv("LARK_WEBHOOK_URL")
SUPABASE_URL         = os.getenv("SUPABASE_URL")
SUPABASE_KEY         = os.getenv("SUPABASE_SERVICE_KEY")
DEVICE_ID            = os.getenv("DEVICE_ID", "rpi-enviro-01")
MONITOR_INTERVAL     = int(os.getenv("MONITOR_INTERVAL", "300"))      # giây, default 5 phút
ERROR_THRESHOLD      = int(os.getenv("MONITOR_ERROR_THRESHOLD", "5")) # lần liên tiếp

# rpi-enviro-02 → AM2, rpi-enviro-03 → AM3
_suffix = DEVICE_ID.split("-")[-1].lstrip("0") or "1"
DEVICE_LABEL = f"AM{_suffix}"

SERVICES = [
    "enviro-monitor",
    "music-detector-auto",
    "music-recognition",
    "bpm-monitor",
]

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("service-monitor")

# ── Lark ─────────────────────────────────────────────────────────────────────
def send_lark(message: str):
    if not LARK_WEBHOOK_URL:
        log.warning("LARK_WEBHOOK_URL chưa cấu hình, bỏ qua alert")
        return
    try:
        resp = requests.post(
            LARK_WEBHOOK_URL,
            json={"msg_type": "text", "content": {"text": message}},
            timeout=10,
        )
        if resp.status_code != 200:
            log.warning(f"Lark response: {resp.status_code} {resp.text}")
    except Exception as e:
        log.error(f"Lark send failed: {e}")

# ── Service check ─────────────────────────────────────────────────────────────
def is_active(service: str) -> bool:
    try:
        result = subprocess.run(
            ["systemctl", "is-active", service],
            capture_output=True, text=True, timeout=5,
        )
        return result.stdout.strip() == "active"
    except Exception:
        return False

# ── Supabase check cho music-detector-auto ───────────────────────────────────
def get_supabase_client():
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    try:
        from supabase import create_client
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        log.warning(f"Supabase init failed: {e}")
        return None

def check_music_detector_errors(supabase) -> bool:
    """Trả về True nếu ERROR_THRESHOLD row gần nhất đều là 'error'."""
    if not supabase:
        return False
    try:
        res = (
            supabase.table("music_auto_detections")
            .select("status")
            .eq("device_id", DEVICE_ID)
            .order("detected_at", desc=True)
            .limit(ERROR_THRESHOLD)
            .execute()
        )
        rows = res.data or []
        if len(rows) < ERROR_THRESHOLD:
            return False
        return all(r.get("status") == "error" for r in rows)
    except Exception as e:
        log.warning(f"Supabase check failed: {e}")
        return False

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if not LARK_WEBHOOK_URL:
        log.error("LARK_WEBHOOK_URL chưa cấu hình trong .env — dừng.")
        return

    log.info(f"Service Monitor khởi động | device={DEVICE_ID} ({DEVICE_LABEL}) | interval={MONITOR_INTERVAL}s")

    supabase = get_supabase_client()

    # State tracking: True = đang up, False = đang down
    service_state = {svc: True for svc in SERVICES}
    music_api_alerted = False  # đã alert lỗi API liên tiếp chưa

    # Alert khởi động
    send_lark(f"🟢 [{DEVICE_LABEL}] Service Monitor khởi động")

    while True:
        # 1. Kiểm tra từng service
        for svc in SERVICES:
            up = is_active(svc)
            was_up = service_state[svc]

            if not up and was_up:
                msg = f"⚠️ [{DEVICE_LABEL}] {svc} DOWN"
                log.warning(msg)
                send_lark(msg)
                service_state[svc] = False

            elif up and not was_up:
                msg = f"🟢 [{DEVICE_LABEL}] {svc} RECOVERED"
                log.info(msg)
                send_lark(msg)
                service_state[svc] = True

        # 2. Kiểm tra application-level cho music-detector-auto
        if service_state.get("music-detector-auto", False):
            all_errors = check_music_detector_errors(supabase)
            if all_errors and not music_api_alerted:
                service_name = os.getenv("DETECT_SERVICE", "api").upper()
                msg = (
                    f"❌ [{DEVICE_LABEL}] music-detector-auto: "
                    f"{ERROR_THRESHOLD} lần detect liên tiếp lỗi ({service_name})"
                )
                log.warning(msg)
                send_lark(msg)
                music_api_alerted = True
            elif not all_errors and music_api_alerted:
                # API đã hoạt động trở lại
                msg = f"🟢 [{DEVICE_LABEL}] music-detector-auto: API hoạt động trở lại"
                log.info(msg)
                send_lark(msg)
                music_api_alerted = False

        time.sleep(MONITOR_INTERVAL)


if __name__ == "__main__":
    main()
