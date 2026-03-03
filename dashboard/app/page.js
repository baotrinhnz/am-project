'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { format, subHours, subDays, parseISO } from 'date-fns';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useDeviceSettings } from '../hooks/useDeviceSettings';
import SettingsModal from '../components/SettingsModal';

// ─── Time Range Options ─────────────────────────────────────────────────────
const TIME_RANGES = [
  { label: '1H', value: 1, unit: 'hours' },
  { label: '6H', value: 6, unit: 'hours' },
  { label: '24H', value: 24, unit: 'hours' },
  { label: '7D', value: 7, unit: 'days' },
  { label: '30D', value: 30, unit: 'days' },
];

// ─── Sensor Config ──────────────────────────────────────────────────────────
const SENSOR_GROUPS = [
  {
    title: 'Climate',
    icon: '🌡️',
    sensors: [
      { key: 'temperature', label: 'Temperature', unit: '°C', color: '#fb7185', decimals: 1 },
      { key: 'humidity', label: 'Humidity', unit: '%', color: '#60a5fa', decimals: 1 },
      { key: 'pressure', label: 'Pressure', unit: 'hPa', color: '#a78bfa', decimals: 0 },
    ]
  },
  {
    title: 'Light & Sound',
    icon: '💡',
    sensors: [
      { key: 'lux', label: 'Light', unit: 'lux', color: '#fbbf24', decimals: 0 },
      { key: 'noise_level', label: 'Noise', unit: '', color: '#f472b6', decimals: 3 },
    ]
  },
  {
    title: 'Gas Levels',
    icon: '🧪',
    sensors: [
      { key: 'gas_oxidising', label: 'Oxidising', unit: 'kΩ', color: '#2dd4bf', decimals: 1 },
      { key: 'gas_reducing', label: 'Reducing', unit: 'kΩ', color: '#4ade80', decimals: 1 },
      { key: 'gas_nh3', label: 'NH₃', unit: 'kΩ', color: '#fbbf24', decimals: 1 },
    ]
  }
  // Particulate Matter sensor (PMS5003) - disabled as sensor not connected
  // Uncomment when PMS5003 is connected
  // ,{
  //   title: 'Particulate Matter',
  //   icon: '🌫️',
  //   sensors: [
  //     { key: 'pm1', label: 'PM1.0', unit: 'µg/m³', color: '#86efac', decimals: 1 },
  //     { key: 'pm25', label: 'PM2.5', unit: 'µg/m³', color: '#fbbf24', decimals: 1 },
  //     { key: 'pm10', label: 'PM10', unit: 'µg/m³', color: '#fb7185', decimals: 1 },
  //   ]
  // }
];

// ─── Helpers ────────────────────────────────────────────────────────────────
function getTimeAgo(unit, value) {
  const now = new Date();
  return unit === 'hours' ? subHours(now, value) : subDays(now, value);
}

function formatTime(isoStr, range) {
  try {
    const d = typeof isoStr === 'string' ? parseISO(isoStr) : isoStr;
    if (range.value <= 24 && range.unit === 'hours') return format(d, 'HH:mm');
    if (range.value <= 7) return format(d, 'EEE HH:mm');
    return format(d, 'MMM dd');
  } catch {
    return '';
  }
}

function getAQILevel(pm25) {
  if (pm25 == null) return { label: 'N/A', color: '#64748b', bg: 'rgba(100,116,139,0.1)' };
  if (pm25 <= 12) return { label: 'Good', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' };
  if (pm25 <= 35) return { label: 'Moderate', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' };
  if (pm25 <= 55) return { label: 'Unhealthy (SG)', color: '#fb923c', bg: 'rgba(251,146,60,0.1)' };
  if (pm25 <= 150) return { label: 'Unhealthy', color: '#fb7185', bg: 'rgba(251,113,133,0.1)' };
  return { label: 'Hazardous', color: '#dc2626', bg: 'rgba(220,38,38,0.15)' };
}

// ─── Custom Tooltip ─────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, range }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-2 border border-white/10 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-white/50 mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white/70">{p.name}:</span>
          <span className="text-white font-mono font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, unit, color, icon }) {
  return (
    <div className="card-glow p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
        {icon && <span className="text-sm">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-mono font-semibold" style={{ color }}>
          {value ?? '—'}
        </span>
        <span className="text-xs text-white/30">{unit}</span>
      </div>
    </div>
  );
}

// ─── Chart Panel ────────────────────────────────────────────────────────────
function ChartPanel({ title, icon, sensors, data, range }) {
  const hasData = data.length > 0 && sensors.some(s => data.some(d => d[s.key] != null));

  return (
    <div className="card-glow p-5">
      <div className="flex items-center gap-2 mb-4">
        <span>{icon}</span>
        <h3 className="text-sm font-semibold text-white/80">{title}</h3>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <defs>
              {sensors.map(s => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="time"
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip range={range} />} />
            <Legend
              iconType="circle"
              iconSize={6}
              wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}
            />
            {sensors.map(s => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={`${s.label} (${s.unit})`}
                stroke={s.color}
                strokeWidth={1.5}
                fill={`url(#grad-${s.key})`}
                dot={false}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[220px] flex items-center justify-center text-white/20 text-sm">
          No data available for this period
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState([]);
  const [latest, setLatest] = useState(null);
  const [range, setRange] = useState(TIME_RANGES[2]); // default 24H
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState('all');
  const [devices, setDevices] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Device settings hook
  const deviceSettings = useDeviceSettings();

  // Fetch available devices
  const fetchDevices = useCallback(async () => {
    const { data: rows } = await supabase
      .from('sensor_readings')
      .select('device_id')
      .order('recorded_at', { ascending: false })
      .limit(1000);

    if (rows) {
      const uniqueDevices = [...new Set(rows.map(r => r.device_id))].filter(Boolean);
      setDevices(uniqueDevices);
      if (uniqueDevices.length > 0 && selectedDevice === 'all') {
        // Keep 'all' selected by default
      }
    }
  }, [selectedDevice]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const since = getTimeAgo(range.unit, range.value).toISOString();

    let query = supabase
      .from('sensor_readings')
      .select('*')
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true })
      .limit(2000);

    // Filter by device if not 'all'
    if (selectedDevice !== 'all') {
      query = query.eq('device_id', selectedDevice);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error('Supabase fetch error:', error);
      setLoading(false);
      return;
    }

    // Downsample if too many points (keep ~200 max for smooth charts)
    let processed = rows || [];
    if (processed.length > 200) {
      const step = Math.ceil(processed.length / 200);
      processed = processed.filter((_, i) => i % step === 0);
    }

    const chartData = processed.map(r => ({
      ...r,
      time: formatTime(r.recorded_at, range),
    }));

    setData(chartData);
    if (rows?.length > 0) {
      setLatest(rows[rows.length - 1]);
      setLastUpdate(new Date());
    }
    setLoading(false);
  }, [range, selectedDevice]);

  // Fetch devices on mount
  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Fetch on mount and range change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('sensor_readings_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_readings' },
        (payload) => {
          // Only update if matches selected device or viewing all
          if (selectedDevice === 'all' || payload.new.device_id === selectedDevice) {
            setLatest(payload.new);
            setLastUpdate(new Date());
            // Add to chart data
            setData(prev => {
              const newPoint = { ...payload.new, time: formatTime(payload.new.recorded_at, range) };
              const updated = [...prev, newPoint];
              // Keep max 200 points
              return updated.length > 200 ? updated.slice(-200) : updated;
            });
          }
          // Always refresh device list when new device appears
          fetchDevices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [range, selectedDevice, fetchDevices]);

  // AQI disabled as PMS5003 sensor not connected
  // const aqi = getAQILevel(latest?.pm25);

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Ambience Monitor
            </h1>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
              <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">Live</span>
            </div>
          </div>
          <p className="text-xs text-white/30">
            {latest?.device_id ? deviceSettings.getDeviceInfo(latest.device_id).displayName : 'rpi-enviro-01'} &middot;{' '}
            {lastUpdate ? `Updated ${format(lastUpdate, 'HH:mm:ss')}` : 'Connecting...'} &middot; BaoT
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Settings Button */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-2 border border-white/5 text-white/60 hover:text-white/80 hover:border-white/10 transition-all"
            title="Device Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
          {/* Device Selector */}
          <div className="flex gap-1 p-1 bg-surface-2 rounded-lg border border-white/5">
            <button
              onClick={() => setSelectedDevice('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                selectedDevice === 'all'
                  ? 'bg-purple-500/20 text-purple-400 shadow-sm'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              All Devices
            </button>
            {devices.map(deviceId => {
              const deviceInfo = deviceSettings.getDeviceInfo(deviceId);
              return (
                <button
                  key={deviceId}
                  onClick={() => setSelectedDevice(deviceId)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap relative group ${
                    selectedDevice === deviceId
                      ? 'bg-purple-500/20 text-purple-400 shadow-sm'
                      : 'text-white/40 hover:text-white/60'
                  }`}
                  title={deviceInfo.note || deviceInfo.location || deviceId}
                >
                  <span>{deviceInfo.displayName}</span>
                  {deviceInfo.location && (
                    <span className="ml-1.5 text-[10px] opacity-50">({deviceInfo.location})</span>
                  )}
                  {/* Tooltip for note */}
                  {deviceInfo.note && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface-1 border border-white/20 rounded-lg shadow-xl text-xs text-white/80 whitespace-normal max-w-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50">
                      <div className="font-medium text-white mb-1">{deviceInfo.displayName}</div>
                      {deviceInfo.location && (
                        <div className="text-white/50 text-[10px] mb-1">📍 {deviceInfo.location}</div>
                      )}
                      <div className="text-white/70">{deviceInfo.note}</div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-surface-1 border-r border-b border-white/20 rotate-45" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Time Range Selector */}
          <div className="flex gap-1 p-1 bg-surface-2 rounded-lg border border-white/5">
            {TIME_RANGES.map(r => (
              <button
                key={r.label}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  range.label === r.label
                    ? 'bg-teal-500/20 text-teal-400 shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Current Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {/* AQI Status - Hidden as PMS5003 not connected */}
        {/* Uncomment when PMS5003 is connected
        <div className="col-span-2 card-glow p-4"
             style={{ background: aqi.bg }}>
          <span className="text-xs text-white/40 uppercase tracking-wider">Air Quality</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono" style={{ color: aqi.color }}>
              {latest?.pm25 != null ? latest.pm25.toFixed(1) : '—'}
            </span>
            <span className="text-xs text-white/30">PM2.5 µg/m³</span>
          </div>
          <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: aqi.color, background: `${aqi.color}15` }}>
            {aqi.label}
          </span>
        </div>
        */}

        <StatCard label="Temperature" value={latest?.temperature?.toFixed(1)} unit="°C" color="#fb7185" icon="🌡️" />
        <StatCard label="Humidity" value={latest?.humidity?.toFixed(1)} unit="%" color="#60a5fa" icon="💧" />
        <StatCard label="Pressure" value={latest?.pressure?.toFixed(0)} unit="hPa" color="#a78bfa" icon="🔵" />
        <StatCard label="Light" value={latest?.lux?.toFixed(0)} unit="lux" color="#fbbf24" icon="☀️" />
      </div>

      {/* Loading state */}
      {loading && data.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full" />
          <span className="ml-3 text-white/40 text-sm">Loading sensor data...</span>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SENSOR_GROUPS.map(group => (
          <ChartPanel
            key={group.title}
            title={group.title}
            icon={group.icon}
            sensors={group.sensors}
            data={data}
            range={range}
          />
        ))}
      </div>

      {/* Footer */}
      <footer className="mt-10 text-center text-[10px] text-white/15">
        Enviro+ Monitor &middot; Raspberry Pi 4B &middot; PIM458 &middot; Supabase + Vercel
      </footer>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        devices={devices}
        deviceSettings={deviceSettings}
        onSave={deviceSettings.saveDeviceSetting}
      />
    </div>
  );
}
