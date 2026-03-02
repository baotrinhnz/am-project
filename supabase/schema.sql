-- ============================================
-- Enviro+ Air Quality Monitoring - Supabase Schema
-- ============================================

-- 1. Create the sensor_readings table
CREATE TABLE IF NOT EXISTS sensor_readings (
    id BIGSERIAL PRIMARY KEY,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- BME280
    temperature REAL,          -- °C
    pressure REAL,             -- hPa
    humidity REAL,             -- %

    -- LTR-559
    lux REAL,                  -- lux
    proximity REAL,            -- proximity value (0-1)

    -- MICS6814 gas sensor (via ADS1015 ADC)
    gas_oxidising REAL,        -- kΩ (NO2, O3)
    gas_reducing REAL,         -- kΩ (CO, NH3, H2)
    gas_nh3 REAL,              -- kΩ (NH3)

    -- MEMS microphone
    noise_level REAL,          -- amplitude / dB proxy

    -- PM sensor (if connected)
    pm1 REAL,                  -- µg/m³
    pm25 REAL,                 -- µg/m³
    pm10 REAL,                 -- µg/m³

    -- Device identifier (useful if you add more Pi's later)
    device_id TEXT DEFAULT 'rpi-enviro-01'
);

-- 2. Index for time-series queries
CREATE INDEX idx_sensor_readings_recorded_at ON sensor_readings (recorded_at DESC);
CREATE INDEX idx_sensor_readings_device ON sensor_readings (device_id, recorded_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;

-- 4. Policy: allow anonymous read (for the dashboard)
CREATE POLICY "Allow public read" ON sensor_readings
    FOR SELECT
    USING (true);

-- 5. Policy: allow insert with service_role key (from Raspberry Pi)
CREATE POLICY "Allow service insert" ON sensor_readings
    FOR INSERT
    WITH CHECK (true);

-- 6. Optional: auto-delete old data after 90 days (run via pg_cron or manually)
-- DELETE FROM sensor_readings WHERE recorded_at < NOW() - INTERVAL '90 days';

-- 7. Useful view: hourly averages
CREATE OR REPLACE VIEW hourly_averages AS
SELECT
    date_trunc('hour', recorded_at) AS hour,
    device_id,
    ROUND(AVG(temperature)::numeric, 1) AS avg_temp,
    ROUND(AVG(humidity)::numeric, 1) AS avg_humidity,
    ROUND(AVG(pressure)::numeric, 1) AS avg_pressure,
    ROUND(AVG(lux)::numeric, 1) AS avg_lux,
    ROUND(AVG(gas_oxidising)::numeric, 1) AS avg_gas_oxidising,
    ROUND(AVG(gas_reducing)::numeric, 1) AS avg_gas_reducing,
    ROUND(AVG(gas_nh3)::numeric, 1) AS avg_gas_nh3,
    ROUND(AVG(noise_level)::numeric, 1) AS avg_noise,
    ROUND(AVG(pm25)::numeric, 1) AS avg_pm25,
    COUNT(*) AS sample_count
FROM sensor_readings
GROUP BY date_trunc('hour', recorded_at), device_id
ORDER BY hour DESC;
