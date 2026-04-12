-- ============================================
-- Enable RLS on all tables + REVOKE anon table grants
-- Policy: anon = read only; service_role = full access
-- device_settings + device_commands: anon can insert/update (dashboard UI)
-- ============================================

-- Drop old policies
DROP POLICY IF EXISTS "Allow public read" ON sensor_readings;
DROP POLICY IF EXISTS "Allow public write" ON sensor_readings;
DROP POLICY IF EXISTS "Allow public read" ON bpm_readings;
DROP POLICY IF EXISTS "Public read bpm_readings" ON bpm_readings;
DROP POLICY IF EXISTS "Service role insert bpm_readings" ON bpm_readings;
DROP POLICY IF EXISTS "Allow public read" ON device_settings;
DROP POLICY IF EXISTS "Allow public insert" ON device_settings;
DROP POLICY IF EXISTS "Allow public update" ON device_settings;
DROP POLICY IF EXISTS "Allow public read access" ON music_detections;
DROP POLICY IF EXISTS "Allow public read" ON music_detections;
DROP POLICY IF EXISTS "Allow service role insert" ON music_detections;
DROP POLICY IF EXISTS "Allow anon insert" ON music_detections;
DROP POLICY IF EXISTS "Allow service role full access" ON device_commands;
DROP POLICY IF EXISTS "Allow authenticated insert" ON device_commands;
DROP POLICY IF EXISTS "Allow public insert" ON device_commands;

-- Enable + FORCE RLS
ALTER TABLE sensor_readings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_readings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_commands  ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_detections ENABLE ROW LEVEL SECURITY;

ALTER TABLE sensor_readings  FORCE ROW LEVEL SECURITY;
ALTER TABLE bpm_readings     FORCE ROW LEVEL SECURITY;
ALTER TABLE device_settings  FORCE ROW LEVEL SECURITY;
ALTER TABLE device_commands  FORCE ROW LEVEL SECURITY;
ALTER TABLE music_detections FORCE ROW LEVEL SECURITY;

-- Revoke default grants, then explicit grants per role
REVOKE ALL ON sensor_readings  FROM anon;
REVOKE ALL ON bpm_readings     FROM anon;
REVOKE ALL ON music_detections FROM anon;
REVOKE ALL ON device_settings  FROM anon;
REVOKE ALL ON device_commands  FROM anon;

GRANT SELECT ON sensor_readings  TO anon;
GRANT SELECT ON bpm_readings     TO anon;
GRANT SELECT ON music_detections TO anon;
GRANT SELECT, INSERT, UPDATE ON device_settings TO anon;
GRANT SELECT, INSERT ON device_commands TO anon;

-- Policies
CREATE POLICY "anon_read" ON sensor_readings  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON bpm_readings     FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON music_detections FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read"   ON device_settings FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert" ON device_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update" ON device_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_read"   ON device_commands FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert" ON device_commands FOR INSERT TO anon WITH CHECK (true);
