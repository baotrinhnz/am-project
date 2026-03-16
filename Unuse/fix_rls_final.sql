-- Final fix for RLS policies

-- Fix device_commands policies
ALTER TABLE device_commands DISABLE ROW LEVEL SECURITY;

-- Re-enable with proper policies
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow anon full access" ON device_commands;
DROP POLICY IF EXISTS "Allow authenticated full access" ON device_commands;
DROP POLICY IF EXISTS "Allow service role full access" ON device_commands;
DROP POLICY IF EXISTS "Allow public read access" ON device_commands;
DROP POLICY IF EXISTS "Allow public write access" ON device_commands;

-- Create simple permissive policy for testing
CREATE POLICY "Allow all operations" ON device_commands
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

-- Also fix music_detections if needed
ALTER TABLE music_detections DISABLE ROW LEVEL SECURITY;
ALTER TABLE music_detections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read" ON music_detections;
DROP POLICY IF EXISTS "Allow anon insert" ON music_detections;
DROP POLICY IF EXISTS "Allow authenticated insert" ON music_detections;

-- Simple permissive policy
CREATE POLICY "Allow all operations" ON music_detections
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

-- Verify
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('device_commands', 'music_detections');