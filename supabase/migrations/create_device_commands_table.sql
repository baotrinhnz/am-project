-- Create table for device commands (remote control from dashboard)
CREATE TABLE IF NOT EXISTS device_commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(100) NOT NULL,
    command VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,

    -- Index for efficient polling
    INDEX idx_commands_device_status (device_id, status),
    INDEX idx_commands_created (created_at DESC)
);

-- Enable Row Level Security
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;

-- Create policy for service role to insert commands
CREATE POLICY "Allow service role full access" ON device_commands
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create policy for anon/authenticated to insert commands (from dashboard)
CREATE POLICY "Allow authenticated insert" ON device_commands
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Create policy for anon to insert (for public dashboard)
CREATE POLICY "Allow anon insert" ON device_commands
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Add comments
COMMENT ON TABLE device_commands IS 'Commands queue for remote control of devices';
COMMENT ON COLUMN device_commands.device_id IS 'Target device ID';
COMMENT ON COLUMN device_commands.command IS 'Command type (e.g., detect_music, restart, etc.)';
COMMENT ON COLUMN device_commands.status IS 'Command status: pending, processing, completed, failed';
COMMENT ON COLUMN device_commands.result IS 'JSON result data from command execution';
COMMENT ON COLUMN device_commands.processed_at IS 'When the command was processed by the device';