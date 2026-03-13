const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../raspberry-pi/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function createTables() {
  console.log('🎵 Creating Music Recognition Tables...\n');

  // Read SQL files
  const musicDetectionsSQL = fs.readFileSync(
    path.join(__dirname, 'migrations/create_music_detections_table.sql'),
    'utf8'
  );

  const deviceCommandsSQL = fs.readFileSync(
    path.join(__dirname, 'migrations/create_device_commands_table.sql'),
    'utf8'
  );

  console.log('📝 Instructions to create tables manually:\n');
  console.log('1. Go to your Supabase Dashboard:');
  console.log(`   ${SUPABASE_URL.replace('supabase.co', 'supabase.com/dashboard/project/' + SUPABASE_URL.match(/https:\/\/(.*?)\.supabase/)[1])}`);
  console.log('\n2. Click on "SQL Editor" in the left sidebar\n');
  console.log('3. Click "New Query"\n');
  console.log('4. Copy and paste this SQL for music_detections table:\n');
  console.log('=' .repeat(60));
  console.log(musicDetectionsSQL);
  console.log('=' .repeat(60));
  console.log('\n5. Click "Run" button\n');
  console.log('6. Create another new query and paste this SQL for device_commands table:\n');
  console.log('=' .repeat(60));
  console.log(deviceCommandsSQL);
  console.log('=' .repeat(60));
  console.log('\n7. Click "Run" button again\n');

  // Try to check if tables exist
  console.log('\n🔍 Checking if tables already exist...\n');

  try {
    // Check music_detections
    const { error: musicError } = await supabase
      .from('music_detections')
      .select('id')
      .limit(1);

    if (!musicError || musicError.code === '42P01') {
      if (musicError && musicError.code === '42P01') {
        console.log('❌ Table "music_detections" does not exist - Please create it manually');
      } else {
        console.log('✅ Table "music_detections" already exists');
      }
    }

    // Check device_commands
    const { error: commandsError } = await supabase
      .from('device_commands')
      .select('id')
      .limit(1);

    if (!commandsError || commandsError.code === '42P01') {
      if (commandsError && commandsError.code === '42P01') {
        console.log('❌ Table "device_commands" does not exist - Please create it manually');
      } else {
        console.log('✅ Table "device_commands" already exists');
      }
    }
  } catch (error) {
    console.error('Error checking tables:', error.message);
  }

  console.log('\n📌 Quick Links:');
  console.log(`   Dashboard: ${SUPABASE_URL.replace('supabase.co', 'supabase.com/dashboard/project/' + SUPABASE_URL.match(/https:\/\/(.*?)\.supabase/)[1])}`);
  console.log(`   SQL Editor: ${SUPABASE_URL.replace('supabase.co', 'supabase.com/dashboard/project/' + SUPABASE_URL.match(/https:\/\/(.*?)\.supabase/)[1])}/sql/new`);
}

createTables().catch(console.error);