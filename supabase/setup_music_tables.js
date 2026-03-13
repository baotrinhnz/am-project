const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../dashboard/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupTables() {
  console.log('🎵 Setting up Music Recognition Tables');
  console.log('=====================================');
  console.log(`URL: ${supabaseUrl}\n`);

  try {
    // Test if tables exist by trying to query them
    console.log('1️⃣ Checking music_detections table...');
    const { data: musicData, error: musicError } = await supabase
      .from('music_detections')
      .select('id')
      .limit(1);

    if (musicError && musicError.code === '42P01') {
      console.log('   ❌ Table does not exist - needs to be created in Supabase Dashboard');
    } else if (musicError && musicError.code === '42501') {
      console.log('   ⚠️  Table exists but RLS policies need update');
    } else if (musicError) {
      console.log('   ⚠️  Error:', musicError.message);
    } else {
      console.log('   ✅ Table exists and is accessible');
    }

    console.log('\n2️⃣ Checking device_commands table...');
    const { data: commandsData, error: commandsError } = await supabase
      .from('device_commands')
      .select('id')
      .limit(1);

    if (commandsError && commandsError.code === '42P01') {
      console.log('   ❌ Table does not exist - needs to be created in Supabase Dashboard');
    } else if (commandsError && commandsError.code === '42501') {
      console.log('   ⚠️  Table exists but RLS policies need update');
    } else if (commandsError) {
      console.log('   ⚠️  Error:', commandsError.message);
    } else {
      console.log('   ✅ Table exists and is accessible');
    }

    // Try to insert test data to check write permissions
    console.log('\n3️⃣ Testing write permissions...');

    // Test music_detections insert
    const testMusicData = {
      device_id: 'test-device',
      title: 'Test Song',
      artist: 'Test Artist',
      detected_at: new Date().toISOString()
    };

    const { error: insertMusicError } = await supabase
      .from('music_detections')
      .insert(testMusicData);

    if (insertMusicError) {
      if (insertMusicError.code === '42P01') {
        console.log('   ❌ music_detections: Table does not exist');
      } else if (insertMusicError.code === '42501') {
        console.log('   ❌ music_detections: INSERT not allowed (RLS policy issue)');
      } else {
        console.log('   ❌ music_detections:', insertMusicError.message);
      }
    } else {
      console.log('   ✅ music_detections: Write permission OK');
      // Clean up test data
      await supabase
        .from('music_detections')
        .delete()
        .eq('device_id', 'test-device')
        .eq('title', 'Test Song');
    }

    // Test device_commands insert
    const testCommandData = {
      device_id: 'test-device',
      command: 'test_command',
      status: 'pending'
    };

    const { error: insertCommandError } = await supabase
      .from('device_commands')
      .insert(testCommandData);

    if (insertCommandError) {
      if (insertCommandError.code === '42P01') {
        console.log('   ❌ device_commands: Table does not exist');
      } else if (insertCommandError.code === '42501') {
        console.log('   ❌ device_commands: INSERT not allowed (RLS policy issue)');
      } else {
        console.log('   ❌ device_commands:', insertCommandError.message);
      }
    } else {
      console.log('   ✅ device_commands: Write permission OK');
      // Clean up test data
      await supabase
        .from('device_commands')
        .delete()
        .eq('device_id', 'test-device')
        .eq('command', 'test_command');
    }

    console.log('\n=====================================');
    console.log('📊 Summary:');

    if ((musicError && musicError.code === '42P01') || (commandsError && commandsError.code === '42P01')) {
      console.log('\n⚠️  Tables need to be created!');
      console.log('\n📋 Next steps:');
      console.log('1. Go to Supabase Dashboard: https://supabase.com/dashboard');
      console.log('2. Select your project');
      console.log('3. Go to SQL Editor');
      console.log('4. Run the SQL from: supabase/migrations/');
      console.log('   - create_music_detections_table.sql');
      console.log('   - create_device_commands_table.sql');
    } else if (insertMusicError || insertCommandError) {
      console.log('\n⚠️  Tables exist but RLS policies need to be fixed!');
      console.log('\n📋 Fix RLS policies with this SQL:');
      console.log(`
-- Fix music_detections policies
ALTER TABLE music_detections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON music_detections;
DROP POLICY IF EXISTS "Allow anon insert" ON music_detections;

CREATE POLICY "Allow public read" ON music_detections
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow anon insert" ON music_detections
    FOR INSERT TO anon WITH CHECK (true);

-- Fix device_commands policies
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon full access" ON device_commands;

CREATE POLICY "Allow anon full access" ON device_commands
    TO anon USING (true) WITH CHECK (true);
      `);
    } else {
      console.log('\n✅ All tables are properly configured!');
      console.log('🎵 You can now use the "Listen Now" button in the dashboard.');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run setup
setupTables();