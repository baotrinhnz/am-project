const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function setupDeviceStatusTable() {
  console.log('Setting up device_status table...');

  try {
    // Create table using Supabase SQL editor would be better, but we'll use RPC
    // For now, we'll just insert a test record to ensure table exists

    // Try to insert/update a device status
    const { data, error } = await supabase
      .from('device_status')
      .upsert({
        device_id: 'rpi-enviro-01',
        last_seen: new Date().toISOString(),
        service_name: 'music-recognition',
        status: 'initializing'
      }, {
        onConflict: 'device_id,service_name'
      });

    if (error) {
      console.log('Table might not exist, please create it using SQL:');
      console.log(`
CREATE TABLE IF NOT EXISTS device_status (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL,
  service_name VARCHAR(100) NOT NULL DEFAULT 'music-recognition',
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_id, service_name)
);

-- Create index for faster queries
CREATE INDEX idx_device_status_device_id ON device_status(device_id);
CREATE INDEX idx_device_status_last_seen ON device_status(last_seen);

-- Enable RLS
ALTER TABLE device_status ENABLE ROW LEVEL SECURITY;

-- Create policy for service to update its own status
CREATE POLICY "Service can update own status" ON device_status
  FOR ALL USING (true) WITH CHECK (true);
      `);
      console.error('Error:', error.message);
    } else {
      console.log('✅ Device status table is ready!');

      // Clean up test record
      await supabase
        .from('device_status')
        .update({ status: 'idle' })
        .eq('device_id', 'rpi-enviro-01');
    }

  } catch (error) {
    console.error('Setup failed:', error);
  }
}

setupDeviceStatusTable();