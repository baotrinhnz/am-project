import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export async function GET() {
  if (!supabase) {
    return NextResponse.json({
      error: 'Service configuration error',
      ambience: false,
      music: false
    }, { status: 500 });
  }

  try {
    // Check for recent activity in the last 60 seconds
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);

    // Check ambience service - look for recent sensor data
    const { data: sensorData, error: sensorError } = await supabase
      .from('sensor_readings')
      .select('recorded_at')
      .gte('recorded_at', oneMinuteAgo.toISOString())
      .order('recorded_at', { ascending: false })
      .limit(1);

    // Check music service - look for device heartbeat
    const { data: heartbeatData, error: heartbeatError } = await supabase
      .from('device_status')
      .select('last_seen')
      .eq('device_id', 'rpi-enviro-01')
      .single();

    let musicServiceRunning = false;

    // Check if heartbeat exists and is recent
    if (heartbeatData && heartbeatData.last_seen) {
      const lastSeen = new Date(heartbeatData.last_seen);
      const timeDiff = now.getTime() - lastSeen.getTime();
      // Consider running if last seen within 1 minute
      musicServiceRunning = timeDiff < 60000;
    }

    // If no heartbeat table, check for recent commands or detections
    if (!heartbeatData || heartbeatError) {
      // Check for recent music detections as fallback
      const { data: musicData } = await supabase
        .from('music_detections')
        .select('detected_at')
        .gte('detected_at', oneMinuteAgo.toISOString())
        .order('detected_at', { ascending: false })
        .limit(1);

      // Check for recent command activity
      const { data: commandData } = await supabase
        .from('device_commands')
        .select('processed_at')
        .eq('device_id', 'rpi-enviro-01')
        .gte('processed_at', oneMinuteAgo.toISOString())
        .order('processed_at', { ascending: false })
        .limit(1);

      musicServiceRunning = (musicData && musicData.length > 0) ||
                           (commandData && commandData.length > 0);
    }

    // Ambience service is running if we have recent sensor data
    const ambienceServiceRunning = sensorData && sensorData.length > 0;

    return NextResponse.json({
      ambience: ambienceServiceRunning,
      music: musicServiceRunning,
      details: {
        ambience: {
          lastData: sensorData && sensorData.length > 0 ? sensorData[0].recorded_at : null,
          status: ambienceServiceRunning ? 'running' : 'stopped'
        },
        music: {
          lastHeartbeat: heartbeatData?.last_seen || null,
          status: musicServiceRunning ? 'running' : 'stopped'
        }
      },
      timestamp: now.toISOString()
    });

  } catch (error) {
    console.error('Error checking service status:', error);
    return NextResponse.json({
      error: 'Failed to check service status',
      ambience: false,
      music: false
    }, { status: 500 });
  }
}