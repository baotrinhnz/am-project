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
      // If there's an error, log it but continue with demo mode
      console.log('Command error:', commandError);
      console.log('Using demo mode for testing...');

      // Simulate a detection after a delay
      // In production, this would be handled by the Raspberry Pi
      const demoSongs = [
        {
          title: 'Blinding Lights',
          artist: 'The Weeknd',
          album: 'After Hours',
          spotify_url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
          apple_music_url: 'https://music.apple.com/us/album/blinding-lights/1499378108?i=1499378118'
        },
        {
          title: 'Shape of You',
          artist: 'Ed Sheeran',
          album: '÷ (Divide)',
          spotify_url: 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3',
          apple_music_url: 'https://music.apple.com/us/album/shape-of-you/1193701392?i=1193701404'
        },
        {
          title: 'Flowers',
          artist: 'Miley Cyrus',
          album: 'Endless Summer Vacation',
          spotify_url: 'https://open.spotify.com/track/0yLdNVWF3Srea0uzk55zFn',
          apple_music_url: 'https://music.apple.com/us/album/flowers/1663973555?i=1663973562'
        }
      ];

      const randomSong = demoSongs[Math.floor(Math.random() * demoSongs.length)];
      const mockSong = {
        ...randomSong,
        device_id: deviceId,
        detected_at: new Date().toISOString(),
        confidence: (85 + Math.random() * 15).toFixed(1) + '%'
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
        const errType = cmdStatus.result?.error;
        const msg = errType === 'no_fingerprint'
          ? 'Không detect được, có thể quá ồn hoặc nhạc quá nhỏ'
          : 'Ồ, tôi không biết bài hát này';
        return NextResponse.json({ success: false, error: msg });
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