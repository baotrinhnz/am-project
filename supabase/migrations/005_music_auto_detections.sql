-- ============================================
-- Auto music detection table for A/B test between AudD and ACRCloud.
-- Each Pi records every 2 minutes, sends audio to its configured service,
-- and stores the result here for comparison.
-- ============================================

CREATE TABLE IF NOT EXISTS music_auto_detections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id TEXT NOT NULL,
    venue_name TEXT NOT NULL,
    service TEXT NOT NULL,              -- 'audd' or 'acrcloud'
    status TEXT NOT NULL,               -- 'detected', 'no_match', 'error'
    spotify_track_id TEXT,
    service_track_id TEXT,              -- audd song_id or acrcloud acrid
    title TEXT,
    artist TEXT,
    album TEXT,
    genre TEXT,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_response JSONB
);

CREATE INDEX IF NOT EXISTS idx_mad_device_time ON music_auto_detections(device_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_mad_service     ON music_auto_detections(service);
CREATE INDEX IF NOT EXISTS idx_mad_venue       ON music_auto_detections(venue_name, detected_at DESC);

-- RLS: anon read only, service_role full
ALTER TABLE music_auto_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_auto_detections FORCE ROW LEVEL SECURITY;

REVOKE ALL ON music_auto_detections FROM anon;
GRANT SELECT ON music_auto_detections TO anon;

CREATE POLICY "anon_read" ON music_auto_detections FOR SELECT TO anon USING (true);
