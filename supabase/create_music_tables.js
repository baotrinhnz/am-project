const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../dashboard/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

console.log('🎵 Creating Music Recognition Tables');
console.log('=====================================');
console.log(`URL: ${supabaseUrl}`);
console.log(`Using ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Service' : 'Anon'} key\n`);

// SQL for creating tables with proper RLS policies
const sql = `
-- Create music_detections table if not exists
CREATE TABLE IF NOT EXISTS music_detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(100) NOT NULL,
    title VARCHAR(500),
    artist VARCHAR(500),
    album VARCHAR(500),
    release_date VARCHAR(50),
    label VARCHAR(200),
    spotify_url TEXT,
    apple_music_url TEXT,
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index if not exists
CREATE INDEX IF NOT EXISTS idx_music_device_time ON music_detections(device_id, detected_at DESC);

-- Enable RLS
ALTER TABLE music_detections ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access" ON music_detections;
DROP POLICY IF EXISTS "Allow service role insert" ON music_detections;
DROP POLICY IF EXISTS "Allow anon insert" ON music_detections;

-- Create new policies
CREATE POLICY "Allow public read access" ON music_detections
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow anon insert" ON music_detections
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow authenticated insert" ON music_detections
    FOR INSERT TO authenticated WITH CHECK (true);

-- Create device_commands table if not exists
CREATE TABLE IF NOT EXISTS device_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(100) NOT NULL,
    command VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes if not exists
CREATE INDEX IF NOT EXISTS idx_commands_device_status ON device_commands(device_id, status);
CREATE INDEX IF NOT EXISTS idx_commands_created ON device_commands(created_at DESC);

-- Enable RLS
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow service role full access" ON device_commands;
DROP POLICY IF EXISTS "Allow authenticated insert" ON device_commands;
DROP POLICY IF EXISTS "Allow anon insert" ON device_commands;
DROP POLICY IF EXISTS "Allow anon read" ON device_commands;

-- Create new policies
CREATE POLICY "Allow anon full access" ON device_commands
    TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON device_commands
    TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON device_commands
    TO service_role USING (true) WITH CHECK (true);
`;

console.log('📝 SQL to be executed:');
console.log('- Creating music_detections table');
console.log('- Creating device_commands table');
console.log('- Setting up RLS policies for both tables');
console.log('- Allowing anon/public access as needed\n');

console.log('⚠️  IMPORTANT: This script needs to be run manually in Supabase Dashboard');
console.log('=====================================\n');

console.log('📋 Instructions:');
console.log('1. Go to your Supabase Dashboard: https://supabase.com/dashboard');
console.log('2. Select your project');
console.log('3. Go to SQL Editor (left sidebar)');
console.log('4. Click "New query"');
console.log('5. Copy and paste the SQL below');
console.log('6. Click "Run" button\n');

console.log('=====================================');
console.log('COPY THIS SQL:');
console.log('=====================================\n');
console.log(sql);
console.log('\n=====================================');

console.log('\n✅ After running the SQL, your music detection feature will work!');
console.log('🎵 You can then click "Listen Now" in the dashboard.');