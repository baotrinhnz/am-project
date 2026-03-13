-- Create table for storing detected music/songs
CREATE TABLE IF NOT EXISTS music_detections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(100) NOT NULL,
    title VARCHAR(500),
    artist VARCHAR(500),
    album VARCHAR(500),
    release_date VARCHAR(50),
    label VARCHAR(200),
    spotify_url TEXT,
    apple_music_url TEXT,
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Index for performance
    INDEX idx_music_device_time (device_id, detected_at DESC)
);

-- Enable Row Level Security
ALTER TABLE music_detections ENABLE ROW LEVEL SECURITY;

-- Create policy for read access
CREATE POLICY "Allow public read access" ON music_detections
    FOR SELECT
    TO public
    USING (true);

-- Create policy for service role insert
CREATE POLICY "Allow service role insert" ON music_detections
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Add comment
COMMENT ON TABLE music_detections IS 'Stores music/songs detected by the MEMS microphone using AudD API';
COMMENT ON COLUMN music_detections.device_id IS 'ID of the Raspberry Pi device';
COMMENT ON COLUMN music_detections.title IS 'Song title';
COMMENT ON COLUMN music_detections.artist IS 'Artist name';
COMMENT ON COLUMN music_detections.album IS 'Album name';
COMMENT ON COLUMN music_detections.spotify_url IS 'Spotify track URL if available';
COMMENT ON COLUMN music_detections.apple_music_url IS 'Apple Music URL if available';
COMMENT ON COLUMN music_detections.detected_at IS 'Timestamp when the song was detected';