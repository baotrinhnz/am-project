-- ============================================
-- Device Settings Table
-- For storing custom display names, locations, and notes for devices
-- ============================================

-- 1. Create the device_settings table
CREATE TABLE IF NOT EXISTS device_settings (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT UNIQUE NOT NULL,
    display_name TEXT,
    location TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Index for faster lookups
CREATE INDEX idx_device_settings_device_id ON device_settings (device_id);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE device_settings ENABLE ROW LEVEL SECURITY;

-- 4. Policy: allow public read (for the dashboard)
CREATE POLICY "Allow public read" ON device_settings
    FOR SELECT
    USING (true);

-- 5. Policy: allow public insert/update (for the settings UI)
CREATE POLICY "Allow public insert" ON device_settings
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public update" ON device_settings
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- 6. Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger to auto-update updated_at
CREATE TRIGGER update_device_settings_updated_at
    BEFORE UPDATE ON device_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
