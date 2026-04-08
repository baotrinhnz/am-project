#!/usr/bin/env python3
"""
Enviro+ Air Quality Monitor → Supabase
========================================
Reads all sensors from Pimoroni Enviro+ (PIM458) and pushes data to Supabase.
Now includes music recognition using the MEMS microphone!

Setup on Raspberry Pi:
    sudo apt update && sudo apt install -y python3-pip
    pip3 install enviroplus supabase-py python-dotenv
    # If using PMS5003 PM sensor:
    pip3 install pms5003
    # For music recognition:
    pip3 install sounddevice numpy scipy requests

Usage:
    python3 sensor_reader.py                  # Run once
    python3 sensor_reader.py --interval 60    # Run every 60 seconds
    python3 sensor_reader.py --lcd            # Also display on LCD
    python3 sensor_reader.py --music          # Enable music recognition
    python3 sensor_reader.py --music-interval 300  # Detect music every 5 minutes
"""

import os
import sys
import time
import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path

# --- Configuration -----------------------------------------------------------
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  # Use service_role key for insert
DEVICE_ID = os.getenv("DEVICE_ID", "rpi-enviro-01")
TABLE_NAME = "sensor_readings"
TEMP_COMPENSATION_FACTOR = float(os.getenv("TEMP_COMPENSATION_FACTOR", "2.25"))

# --- Logging -----------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("enviro-monitor")

# --- Sensor Imports ----------------------------------------------------------
try:
    from bme280 import BME280
    from ltr559 import LTR559
    from enviroplus import gas
    HAS_SENSORS = True
except ImportError:
    log.warning("Sensor libraries not found. Running in MOCK mode for testing.")
    HAS_SENSORS = False

try:
    from pms5003 import PMS5003
    # Disable PMS5003 if not physically connected (sold separately)
    HAS_PM_SENSOR = False  # Set to True if you have PMS5003 connected
except ImportError:
    HAS_PM_SENSOR = False
    log.info("PMS5003 library not found. PM readings will be null.")

try:
    from smbus2 import SMBus
except ImportError:
    try:
        from smbus import SMBus
    except ImportError:
        SMBus = None

# --- Supabase Client ---------------------------------------------------------
try:
    from supabase import create_client, Client
    HAS_SUPABASE = True
except ImportError:
    log.warning("supabase-py not installed. Data will only be printed locally.")
    HAS_SUPABASE = False


def get_supabase_client() -> "Client | None":
    if not HAS_SUPABASE:
        return None
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.warning("SUPABASE_URL or SUPABASE_SERVICE_KEY not set. Skipping upload.")
        return None
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# --- Temperature Compensation ------------------------------------------------
def get_cpu_temperature():
    """Read Raspberry Pi CPU temperature from system file."""
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            temp = f.read()
            return float(temp) / 1000.0  # Convert from millidegrees to degrees
    except Exception as e:
        log.warning(f"Could not read CPU temperature: {e}")
        return None


def compensate_temperature(raw_temp, cpu_temp, factor=2.25):
    """
    Compensate temperature reading using CPU temperature.

    Formula from Pimoroni: compensated = raw - ((cpu - raw) / factor)

    Args:
        raw_temp: Temperature from BME280 sensor (affected by CPU heat)
        cpu_temp: CPU temperature from system
        factor: Compensation factor (default 2.25, calibrate with thermometer)

    Returns:
        Compensated temperature in Celsius
    """
    if cpu_temp is None:
        return raw_temp
    return raw_temp - ((cpu_temp - raw_temp) / factor)


# --- LCD Status Display ------------------------------------------------------
def init_lcd():
    """Show Online status on Enviro+ LCD (ST7735)."""
    try:
        import st7735
        from PIL import Image, ImageDraw, ImageFont
        from fonts.ttf import RobotoMedium as UserFont

        disp = st7735.ST7735(
            port=0, cs=1, dc="GPIO9", backlight="GPIO12",
            rotation=270, spi_speed_hz=10000000
        )
        disp.begin()

        img = Image.new("RGB", (disp.width, disp.height), color=(0, 0, 0))
        draw = ImageDraw.Draw(img)
        font = ImageFont.truetype(UserFont, 20)
        draw.rectangle((0, 0, disp.width, disp.height), (0, 100, 0))
        draw.text((10, 25), "Online", font=font, fill=(255, 255, 255))
        disp.display(img)

        log.info("✓ LCD: Online")
        return disp
    except Exception as e:
        log.warning(f"LCD initialization failed: {e}")
        return None


# --- Sensor Readers ----------------------------------------------------------
class EnviroSensors:
    """Reads all Enviro+ sensors."""

    def __init__(self):
        if HAS_SENSORS and SMBus:
            self.bus = SMBus(1)
            self.bme280 = BME280(i2c_dev=self.bus)
            self.ltr559 = LTR559()
            if HAS_PM_SENSOR:
                self.pms5003 = PMS5003()
            else:
                self.pms5003 = None
        else:
            self.bus = None
            self.bme280 = None
            self.ltr559 = None
            self.pms5003 = None

    def read_all(self) -> dict:
        """Read all sensors and return a flat dict matching the DB schema."""
        if not HAS_SENSORS:
            return self._mock_reading()

        data = {
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "device_id": DEVICE_ID,
        }

        # BME280: temperature (with CPU compensation), pressure, humidity
        try:
            raw_temp = self.bme280.get_temperature()
            cpu_temp = get_cpu_temperature()
            compensated_temp = compensate_temperature(raw_temp, cpu_temp, TEMP_COMPENSATION_FACTOR)

            # Store both raw and compensated for logging
            data["_raw_temperature"] = round(raw_temp, 2)  # Internal use only, not saved to DB
            data["_cpu_temperature"] = round(cpu_temp, 2) if cpu_temp else None
            data["temperature"] = round(compensated_temp, 2)
            data["pressure"] = round(self.bme280.get_pressure(), 2)
            data["humidity"] = round(self.bme280.get_humidity(), 2)
        except Exception as e:
            log.error(f"BME280 read error: {e}")

        # LTR-559: light and proximity
        try:
            data["lux"] = round(self.ltr559.get_lux(), 2)
            data["proximity"] = round(self.ltr559.get_proximity(), 2)
        except Exception as e:
            log.error(f"LTR559 read error: {e}")

        # MICS6814 gas sensor (via ADS1015)
        try:
            gas_data = gas.read_all()
            data["gas_oxidising"] = round(gas_data.oxidising / 1000, 2)   # kΩ
            data["gas_reducing"] = round(gas_data.reducing / 1000, 2)     # kΩ
            data["gas_nh3"] = round(gas_data.nh3 / 1000, 2)              # kΩ
        except Exception as e:
            log.error(f"Gas sensor read error: {e}")

        # MEMS microphone - noise level (simple amplitude reading)
        try:
            # enviroplus noise module (if available)
            from enviroplus.noise import Noise
            noise_sensor = Noise()

            # Sample noise across multiple frequency bands
            amps = noise_sensor.get_amplitudes_at_frequency_ranges([
                (20, 200),      # Low frequency
                (200, 800),     # Mid frequency
                (800, 2000),    # High frequency
            ])

            # Calculate average amplitude
            if amps and len(amps) > 0:
                avg_noise = sum(amps) / len(amps)
                data["noise_level"] = round(avg_noise, 4)
                log.debug(f"Noise level: {avg_noise:.4f}")
            else:
                data["noise_level"] = 0.0

        except ImportError:
            log.warning("Noise module not available. Install: pip3 install sounddevice numpy")
            data["noise_level"] = None
        except Exception as e:
            log.warning(f"Noise sensor error: {e}")
            data["noise_level"] = None

        # PMS5003 particulate matter (if connected)
        if self.pms5003:
            try:
                pm = self.pms5003.read()
                data["pm1"] = pm.pm_ug_per_m3(1.0)
                data["pm25"] = pm.pm_ug_per_m3(2.5)
                data["pm10"] = pm.pm_ug_per_m3(10)
            except Exception as e:
                log.error(f"PMS5003 read error: {e}")

        return data

    @staticmethod
    def _mock_reading() -> dict:
        """Generate mock data for testing without hardware."""
        import random
        return {
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "device_id": DEVICE_ID,
            "temperature": round(20 + random.uniform(-3, 5), 2),
            "pressure": round(1013 + random.uniform(-5, 5), 2),
            "humidity": round(55 + random.uniform(-15, 15), 2),
            "lux": round(random.uniform(0, 500), 2),
            "proximity": round(random.uniform(0, 1), 4),
            "gas_oxidising": round(random.uniform(10, 100), 2),
            "gas_reducing": round(random.uniform(100, 800), 2),
            "gas_nh3": round(random.uniform(10, 200), 2),
            "noise_level": round(random.uniform(0.01, 0.5), 4),
            "pm1": round(random.uniform(0, 10), 1),
            "pm25": round(random.uniform(0, 25), 1),
            "pm10": round(random.uniform(0, 50), 1),
        }


# --- LCD Display (optional) --------------------------------------------------
def display_on_lcd(data: dict):
    """Show current readings on the Enviro+ 0.96" LCD."""
    try:
        import ST7735
        from PIL import Image, ImageDraw, ImageFont
        from fonts.ttf import RobotoMedium as UserFont

        disp = ST7735.ST7735(
            port=0, cs=1, dc=9, backlight=12,
            rotation=270, spi_speed_hz=10000000
        )
        disp.begin()

        img = Image.new("RGB", (disp.width, disp.height), color=(0, 0, 0))
        draw = ImageDraw.Draw(img)
        font = ImageFont.truetype(UserFont, 11)

        lines = [
            f"Temp: {data.get('temperature', '?')}°C",
            f"Hum:  {data.get('humidity', '?')}%",
            f"Press:{data.get('pressure', '?')} hPa",
            f"Lux:  {data.get('lux', '?')}",
            f"PM2.5:{data.get('pm25', 'N/A')} µg/m³",
        ]

        y = 2
        for line in lines:
            draw.text((2, y), line, font=font, fill=(255, 255, 255))
            y += 15

        disp.display(img)
    except Exception as e:
        log.debug(f"LCD display error: {e}")


# --- Music Recognition -------------------------------------------------------
def detect_and_save_music(client):
    """Detect music and save to Supabase."""
    try:
        from music_recognizer import MusicRecognizer

        log.info("🎵 Starting music detection...")
        recognizer = MusicRecognizer()

        # Record and recognize
        result = recognizer.record_and_recognize()

        if result:
            log.info(f"✓ Music detected: {result['title']} by {result['artist']}")

            # Save to Supabase if client available
            if client:
                try:
                    # Save to music_detections table
                    client.table("music_detections").insert({
                        'device_id': result['device_id'],
                        'title': result['title'],
                        'artist': result['artist'],
                        'album': result['album'],
                        'spotify_url': result.get('spotify_url'),
                        'apple_music_url': result.get('apple_music_url'),
                        'detected_at': result['detected_at']
                    }).execute()
                    log.info("✓ Music detection saved to Supabase")
                except Exception as e:
                    log.error(f"Failed to save music detection: {e}")

            return result
        else:
            log.info("No music detected")
            return None

    except ImportError:
        log.error("music_recognizer module not found. Music detection disabled.")
        return None
    except Exception as e:
        log.error(f"Music detection error: {e}")
        return None


# --- Main Loop ---------------------------------------------------------------
def push_to_supabase(client, data: dict):
    """Insert a reading into Supabase."""
    try:
        result = client.table(TABLE_NAME).insert(data).execute()
        log.info(f"✓ Pushed to Supabase (id: {result.data[0]['id']})")
        return True
    except Exception as e:
        log.error(f"✗ Supabase insert failed: {e}")
        return False


def run(interval: int = 0, show_lcd: bool = False, music_detection: bool = False, music_interval: int = 300):
    sensors = EnviroSensors()
    client = get_supabase_client()

    # Initialize RGB LED
    init_lcd()

    log.info(f"Starting Enviro+ Monitor | device={DEVICE_ID}")
    log.info(f"Supabase: {'connected' if client else 'disabled'}")
    log.info(f"Sensors: {'real' if HAS_SENSORS else 'mock'}")
    log.info(f"PM sensor: {'yes' if HAS_PM_SENSOR else 'no'}")
    log.info(f"Temperature compensation: factor={TEMP_COMPENSATION_FACTOR}")
    log.info(f"Music detection: {'enabled' if music_detection else 'disabled'}")
    if music_detection:
        log.info(f"Music detection interval: {music_interval}s")
    log.info(f"Interval: {interval}s" if interval else "Single reading mode")

    # Track last music detection time
    last_music_detection = 0

    while True:
        data = sensors.read_all()

        # Print locally with temperature compensation info
        temp_info = f"temp={data.get('temperature')}°C"
        if data.get('_raw_temperature'):
            raw = data.get('_raw_temperature')
            cpu = data.get('_cpu_temperature')
            temp_info += f" (raw={raw}°C, cpu={cpu}°C)"

        log.info(f"Reading: {temp_info} "
                 f"hum={data.get('humidity')}% "
                 f"press={data.get('pressure')} hPa "
                 f"lux={data.get('lux')} "
                 f"pm25={data.get('pm25')}")

        # Push to Supabase (remove internal fields first)
        if client:
            # Create a copy without internal fields
            db_data = {k: v for k, v in data.items() if not k.startswith('_')}
            push_to_supabase(client, db_data)

        # LCD display
        if show_lcd:
            display_on_lcd(data)

        # Music detection (if enabled and it's time)
        if music_detection:
            current_time = time.time()
            if current_time - last_music_detection >= music_interval:
                # Check if noise level is high enough (music might be playing)
                noise_level = data.get('noise_level', 0)
                if noise_level is None or noise_level > 0.01:  # Threshold for detection
                    log.info(f"Noise level: {noise_level} - triggering music detection")
                    detect_and_save_music(client)
                    last_music_detection = current_time
                else:
                    log.debug(f"Noise too low ({noise_level}) - skipping music detection")

        # Single run or loop
        if interval <= 0:
            break
        time.sleep(interval)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enviro+ Air Quality Monitor")
    parser.add_argument("--interval", type=int, default=60,
                        help="Seconds between readings (0 = single reading)")
    parser.add_argument("--lcd", action="store_true",
                        help="Display readings on the Enviro+ LCD")
    parser.add_argument("--music", action="store_true",
                        help="Enable music recognition")
    parser.add_argument("--music-interval", type=int, default=300,
                        help="Seconds between music detection attempts (default: 300)")
    args = parser.parse_args()

    try:
        run(interval=args.interval,
            show_lcd=args.lcd,
            music_detection=args.music,
            music_interval=args.music_interval)
    except KeyboardInterrupt:
        log.info("Stopped by user.")
        sys.exit(0)
