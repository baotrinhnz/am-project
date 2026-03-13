const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'dashboard/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const DEVICE_ID = 'rpi-enviro-01';

async function testMusicDetection() {
  console.log('🔍 Testing Music Detection System');
  console.log('=====================================\n');

  // 1. Check if Pi is sending sensor data
  console.log('1️⃣ Checking Pi sensor data...');
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: sensors, error: sensorError } = await supabase
    .from('sensor_readings')
    .select('device_id, recorded_at')
    .eq('device_id', DEVICE_ID)
    .gte('recorded_at', fiveMinutesAgo)
    .order('recorded_at', { ascending: false })
    .limit(1);

  if (sensors && sensors.length > 0) {
    const lastSeen = new Date(sensors[0].recorded_at).toLocaleString();
    console.log(`   ✅ Pi is online (last data: ${lastSeen})`);
  } else {
    console.log(`   ⚠️  No recent sensor data from Pi`);
  }

  // 2. Test command insertion
  console.log('\n2️⃣ Testing command insertion...');
  const testCommand = {
    device_id: DEVICE_ID,
    command: 'detect_music',
    status: 'pending'
  };

  const { data: cmdData, error: cmdError } = await supabase
    .from('device_commands')
    .insert(testCommand)
    .select()
    .single();

  if (cmdError) {
    console.log(`   ❌ Cannot insert command: ${cmdError.message}`);
  } else {
    console.log(`   ✅ Command inserted with ID: ${cmdData.id}`);

    // Wait for Pi to process
    console.log('\n3️⃣ Waiting for Pi to process (30 seconds)...');
    console.log('   Make sure Pi is running: python3 music_manual_trigger.py');

    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      process.stdout.write(`   Checking... (${attempts + 1}/30)\r`);

      // Check command status
      const { data: status } = await supabase
        .from('device_commands')
        .select('status, result')
        .eq('id', cmdData.id)
        .single();

      if (status && status.status === 'completed') {
        console.log('\n   ✅ Command completed!');
        if (status.result?.song) {
          console.log(`   🎵 Detected: ${status.result.song.title} by ${status.result.song.artist}`);
        } else {
          console.log(`   ℹ️  Result: ${status.result?.message || 'No song detected'}`);
        }
        break;
      } else if (status && status.status === 'processing') {
        console.log('\n   ⚙️  Pi is processing the command...');
      } else if (status && status.status === 'failed') {
        console.log('\n   ❌ Command failed:', status.result?.error);
        break;
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.log('\n   ⏱️  Timeout - Pi might not be running music_manual_trigger.py');
    }
  }

  console.log('\n=====================================');
  console.log('📋 Checklist:');
  console.log('   [ ] Pi connected to network');
  console.log('   [ ] music_manual_trigger.py running on Pi');
  console.log('   [ ] .env file with correct DEVICE_ID on Pi');
  console.log('   [ ] Music playing near Pi when testing');
}

testMusicDetection().catch(console.error);