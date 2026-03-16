-- Create device_status table for tracking service heartbeats
CREATE TABLE IF NOT EXISTS device_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL,
  service_name VARCHAR(100) NOT NULL DEFAULT 'music-recognition',
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_id, service_name)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_device_status_device_id ON device_status(device_id);
CREATE INDEX IF NOT EXISTS idx_device_status_last_seen ON device_status(last_seen);

-- Enable RLS
ALTER TABLE device_status ENABLE ROW LEVEL SECURITY;

-- Create policy for service to update its own status
CREATE POLICY "Service can update own status" ON device_status
  FOR ALL USING (true) WITH CHECK (true);

-- Insert initial record
INSERT INTO device_status (device_id, service_name, status, metadata)
VALUES ('rpi-enviro-01', 'music-recognition', 'initializing', '{}')
ON CONFLICT (device_id, service_name) DO UPDATE
SET last_seen = NOW(), status = 'initializing';