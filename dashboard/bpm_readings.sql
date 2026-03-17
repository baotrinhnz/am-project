-- BPM Readings table
-- Stores continuous beat rate measurements from MEMS microphone
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bpm_readings (
  id          BIGSERIAL PRIMARY KEY,
  device_id   TEXT NOT NULL DEFAULT 'rpi-enviro-01',
  bpm         REAL NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bpm_device_time
  ON bpm_readings (device_id, recorded_at DESC);

-- RLS
ALTER TABLE bpm_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read bpm_readings"
  ON bpm_readings FOR SELECT
  USING (true);

CREATE POLICY "Service role insert bpm_readings"
  ON bpm_readings FOR INSERT
  WITH CHECK (true);
