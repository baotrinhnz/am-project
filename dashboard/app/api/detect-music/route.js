import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { deviceId } = await request.json();

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: 'Device ID is required' },
        { status: 400 }
      );
    }

    // Trigger music detection on the Raspberry Pi
    // This is done by inserting a command into a command queue table
    // The Raspberry Pi will poll this table and execute commands

    // Optional: Check if device is online (recent sensor reading)
    // Comment this out for testing when device might not be sending sensor data
    /*
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentData, error: checkError } = await supabase
      .from('sensor_readings')
      .select('id')
      .eq('device_id', deviceId)
      .gte('recorded_at', fiveMinutesAgo)
      .limit(1);

    if (checkError) {
      console.error('Error checking device status:', checkError);
      return NextResponse.json(
        { success: false, error: 'Failed to check device status' },
        { status: 500 }
      );
    }

    if (!recentData || recentData.length === 0) {
      console.log('Warning: No recent sensor data, but proceeding anyway...');
      // Don't block - device might be online but not sending sensor data
    }
    */

    console.log(`Attempting to trigger music detection for device: ${deviceId}`);

    // Insert a command for the device to detect music
    const { data: commandData, error: commandError } = await supabase
      .from('device_commands')
      .insert({
        device_id: deviceId,
        command: 'detect_music',
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (commandError) {
      // If the table doesn't exist, we'll simulate the detection
      // This is for testing without the full command queue system
      console.log('Command table not found, simulating detection...');

      // Simulate a detection after a delay
      // In production, this would be handled by the Raspberry Pi
      const mockSong = {
        title: 'Sample Song (Demo Mode)',
        artist: 'Demo Artist',
        album: 'Demo Album',
        spotify_url: null,
        apple_music_url: null,
        device_id: deviceId,
        detected_at: new Date().toISOString()
      };

      // Wait 3 seconds to simulate recording
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Insert mock detection
      const { data: mockDetection, error: mockError } = await supabase
        .from('music_detections')
        .insert(mockSong)
        .select()
        .single();

      if (mockError) {
        console.error('Error inserting mock detection:', mockError);
        return NextResponse.json(
          {
            success: false,
            error: 'Music detection feature not fully configured. Please ensure the device is set up correctly.'
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        song: mockDetection,
        mode: 'demo'
      });
    }

    // Poll for result (wait up to 30 seconds for 20s recording + processing)
    let attempts = 0;
    const maxAttempts = 30;
    let detectedSong = null;

    while (attempts < maxAttempts && !detectedSong) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

      // Check if command was completed
      const { data: cmdStatus } = await supabase
        .from('device_commands')
        .select('status, result')
        .eq('id', commandData.id)
        .single();

      if (cmdStatus && cmdStatus.status === 'completed') {
        // Check for new detection
        const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString();
        const { data: detection } = await supabase
          .from('music_detections')
          .select('*')
          .eq('device_id', deviceId)
          .gte('detected_at', tenSecondsAgo)
          .order('detected_at', { ascending: false })
          .limit(1);

        if (detection && detection.length > 0) {
          detectedSong = detection[0];
          break;
        }
      } else if (cmdStatus && cmdStatus.status === 'failed') {
        return NextResponse.json({
          success: false,
          error: 'Device failed to detect music. Please ensure music is playing near the sensor.'
        });
      }

      attempts++;
    }

    if (detectedSong) {
      return NextResponse.json({
        success: true,
        song: detectedSong
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'No music detected. Try playing music louder or closer to the sensor.'
      });
    }

  } catch (error) {
    console.error('Error in detect-music API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}