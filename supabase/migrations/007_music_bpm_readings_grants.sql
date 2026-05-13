-- Grant explicit access to music_bpm_readings for Supabase Data API
-- Required before October 30, 2026 enforcement deadline.

ALTER TABLE music_bpm_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_bpm_readings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON music_bpm_readings FROM anon;
GRANT SELECT ON music_bpm_readings TO anon;

CREATE POLICY "anon_read" ON music_bpm_readings FOR SELECT TO anon USING (true);
