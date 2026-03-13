const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'dashboard/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing SUPABASE credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('🎵 Music Detection Monitor');
console.log('==========================');
console.log(`URL: ${supabaseUrl}`);
console.log('');

async function checkRecentDetections() {
  try {
    // Get recent music detections
    const { data: detections, error: detectError } = await supabase
      .from('music_detections')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(5);

    if (detectError) {
      console.error('Error fetching detections:', detectError);
      return;
    }

    console.log(`📊 Recent Music Detections (last 5):`);
    if (detections && detections.length > 0) {
      detections.forEach((song, index) => {
        const time = new Date(song.detected_at).toLocaleString();
        console.log(`\n${index + 1}. ${song.title || 'Unknown'} - ${song.artist || 'Unknown'}`);
        console.log(`   Device: ${song.device_id}`);
        console.log(`   Time: ${time}`);
        if (song.spotify_url) console.log(`   Spotify: ${song.spotify_url}`);
      });
    } else {
      console.log('   No detections found');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

async function checkPendingCommands() {
  try {
    // Get pending commands
    const { data: commands, error: cmdError } = await supabase
      .from('device_commands')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (cmdError) {
      console.error('Error fetching commands:', cmdError);
      return;
    }

    console.log(`\n📮 Pending Commands:`);
    if (commands && commands.length > 0) {
      commands.forEach(cmd => {
        const time = new Date(cmd.created_at).toLocaleString();
        console.log(`   - ${cmd.command} for ${cmd.device_id} (${time})`);
      });
    } else {
      console.log('   No pending commands');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

async function checkDeviceStatus() {
  try {
    // Check recent sensor readings to see if device is online
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: readings, error } = await supabase
      .from('sensor_readings')
      .select('device_id, recorded_at')
      .gte('recorded_at', fiveMinutesAgo)
      .order('recorded_at', { ascending: false })
      .limit(1);

    console.log(`\n🟢 Device Status:`);
    if (readings && readings.length > 0) {
      const lastSeen = new Date(readings[0].recorded_at).toLocaleString();
      console.log(`   Device ${readings[0].device_id} - Online (last seen: ${lastSeen})`);
    } else {
      console.log('   No devices active in last 5 minutes');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

async function monitorRealtime() {
  console.log('\n🔄 Starting real-time monitoring...\n');
  console.log('Listening for new music detections and commands...');
  console.log('Press Ctrl+C to stop\n');

  // Subscribe to new music detections
  const musicChannel = supabase
    .channel('music-monitor')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'music_detections'
    }, (payload) => {
      const song = payload.new;
      const time = new Date().toLocaleTimeString();
      console.log(`\n🎵 [${time}] NEW SONG DETECTED!`);
      console.log(`   Title: ${song.title || 'Unknown'}`);
      console.log(`   Artist: ${song.artist || 'Unknown'}`);
      console.log(`   Device: ${song.device_id}`);
      if (song.spotify_url) console.log(`   Spotify: ${song.spotify_url}`);
    })
    .subscribe();

  // Subscribe to command updates
  const cmdChannel = supabase
    .channel('cmd-monitor')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'device_commands'
    }, (payload) => {
      const time = new Date().toLocaleTimeString();
      if (payload.eventType === 'INSERT') {
        console.log(`\n📤 [${time}] New command: ${payload.new.command} for ${payload.new.device_id}`);
      } else if (payload.eventType === 'UPDATE') {
        const cmd = payload.new;
        if (cmd.status === 'completed') {
          console.log(`\n✅ [${time}] Command completed for ${cmd.device_id}`);
          if (cmd.result?.song) {
            console.log(`   Found: ${cmd.result.song.title} by ${cmd.result.song.artist}`);
          } else if (cmd.result?.message) {
            console.log(`   Result: ${cmd.result.message}`);
          }
        } else if (cmd.status === 'processing') {
          console.log(`\n⚙️  [${time}] Processing command for ${cmd.device_id}...`);
        } else if (cmd.status === 'failed') {
          console.log(`\n❌ [${time}] Command failed for ${cmd.device_id}`);
          if (cmd.result?.error) console.log(`   Error: ${cmd.result.error}`);
        }
      }
    })
    .subscribe();
}

async function runMonitor() {
  // Initial status check
  await checkDeviceStatus();
  await checkRecentDetections();
  await checkPendingCommands();

  // Start real-time monitoring
  await monitorRealtime();
}

// Run the monitor
runMonitor().catch(console.error);

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping monitor...');
  process.exit();
});