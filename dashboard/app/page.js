'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { format, subHours, subDays, parseISO } from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useDeviceSettings } from '../hooks/useDeviceSettings';
import { pivotDataForMultiDevice, getDeviceColorMap } from '../lib/multiDeviceData';
import SettingsModal from '../components/SettingsModal';
import MusicAutoHistory from '../components/MusicAutoHistory';
import SimpleServiceStatus from '../components/SimpleServiceStatus';
import BpmWidget from '../components/BpmWidget';
import MusicBpmWidget from '../components/MusicBpmWidget';


// ─── Time Range Options ─────────────────────────────────────────────────────
const TIME_RANGES = [
  { label: '1H', value: 1, unit: 'hours' },
  { label: '6H', value: 6, unit: 'hours' },
  { label: '24H', value: 24, unit: 'hours' },
  { label: '7D', value: 7, unit: 'days' },
  { label: '30D', value: 30, unit: 'days' },
];

// ─── Sensor Config ──────────────────────────────────────────────────────────
// Individual sensors for single charts
const INDIVIDUAL_SENSORS = [
  { key: 'temperature', label: 'Temperature', unit: '°C', color: '#fb7185', icon: '🌡️', decimals: 1 },
  { key: 'humidity', label: 'Humidity', unit: '%', color: '#60a5fa', icon: '💧', decimals: 1 },
  { key: 'pressure', label: 'Pressure', unit: 'hPa', color: '#a78bfa', icon: '🔵', decimals: 0 },
  { key: 'lux', label: 'Light', unit: 'lux', color: '#fbbf24', icon: '☀️', decimals: 0 },
  { key: 'noise_level', label: 'Noise', unit: '', color: '#f472b6', icon: '🔊', decimals: 3 },
  { key: 'gas_oxidising', label: 'Oxidising', unit: 'kΩ', color: '#2dd4bf', icon: '🧪', decimals: 1 },
  { key: 'gas_reducing', label: 'Reducing', unit: 'kΩ', color: '#4ade80', icon: '🧪', decimals: 1 },
  { key: 'gas_nh3', label: 'NH₃', unit: 'kΩ', color: '#fb923c', icon: '🧪', decimals: 1 },
];

// Grouped sensors for combined charts
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
  },
  // Particulate Matter sensor (PMS5003) - disabled as sensor not connected
  // Uncomment when PMS5003 is connected
  // {
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
        <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
        {icon && <span className="text-sm">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-mono font-semibold" style={{ color }}>
          {value ?? '—'}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── Individual Sensor Chart ────────────────────────────────────────────────
function SingleSensorChart({ sensor, data, range, isMultiDevice, devices, deviceColorMap, deviceSettings }) {
  const hasData = isMultiDevice
    ? data.length > 0 && data.some(d => devices?.some(id => d[`${sensor.key}_${id}`] != null))
    : data.length > 0 && data.some(d => d[sensor.key] != null);

  return (
    <div className="card-glow p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{sensor.icon}</span>
        <h3 className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{sensor.label}</h3>
        <span className="text-[10px] ml-auto" style={{ color: 'var(--text-tertiary)' }}>{sensor.unit}</span>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <defs>
              {isMultiDevice ? (
                devices.map(id => (
                  <linearGradient key={id} id={`grad-${sensor.key}-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={deviceColorMap[id]} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={deviceColorMap[id]} stopOpacity={0} />
                  </linearGradient>
                ))
              ) : (
                <linearGradient id={`grad-single-${sensor.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sensor.color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={sensor.color} stopOpacity={0} />
                </linearGradient>
              )}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis
              dataKey="time"
              tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 9 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg px-2.5 py-1.5 shadow-xl text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-color)' }}>
                    <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>{payload[0]?.payload?.time}</p>
                    {payload.filter(p => p.value != null).map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color || p.stroke }} />
                        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{p.name}</span>
                        <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{p.value}</span>
                        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{sensor.unit}</span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {isMultiDevice ? (
              <>
                {devices.map(id => (
                  <Area
                    key={id}
                    type="monotone"
                    dataKey={`${sensor.key}_${id}`}
                    name={deviceSettings?.getDeviceInfo(id).displayName || id}
                    stroke={deviceColorMap[id]}
                    strokeWidth={1.5}
                    fill={`url(#grad-${sensor.key}-${id})`}
                    dot={false}
                    connectNulls
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey={`${sensor.key}_avg`}
                  name="Average"
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  fill="none"
                  dot={false}
                  connectNulls
                />
              </>
            ) : (
              <Area
                type="monotone"
                dataKey={sensor.key}
                stroke={sensor.color}
                strokeWidth={2}
                fill={`url(#grad-single-${sensor.key})`}
                dot={false}
                connectNulls
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[120px] flex items-center justify-center text-xs" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
          No data
        </div>
      )}
      {/* Device legend for multi-device */}
      {isMultiDevice && hasData && (
        <div className="flex flex-wrap gap-2 mt-2">
          {devices.map(id => (
            <div key={id} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: deviceColorMap[id] }} />
              <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{deviceSettings?.getDeviceInfo(id).displayName || id}</span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <span className="w-2 h-0.5" style={{ background: 'rgba(255,255,255,0.5)', borderTop: '1px dashed rgba(255,255,255,0.5)' }} />
            <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Avg</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chart Panel ────────────────────────────────────────────────────────────
function ChartPanel({ title, icon, sensors, data, range, isMultiDevice }) {
  const hasData = isMultiDevice
    ? data.length > 0 && sensors.some(s => data.some(d => d[`${s.key}_avg`] != null))
    : data.length > 0 && sensors.some(s => data.some(d => d[s.key] != null));

  return (
    <div className="card-glow p-5">
      <div className="flex items-center gap-2 mb-4">
        <span>{icon}</span>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{title}</h3>
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
                dataKey={isMultiDevice ? `${s.key}_avg` : s.key}
                name={isMultiDevice ? `${s.label} avg (${s.unit})` : `${s.label} (${s.unit})`}
                stroke={s.color}
                strokeWidth={1.5}
                strokeDasharray={isMultiDevice ? '4 3' : undefined}
                fill={`url(#grad-${s.key})`}
                dot={false}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[220px] flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
          No data available for this period
        </div>
      )}
    </div>
  );
}

// ─── System Info Panel ──────────────────────────────────────────────────────
function SystemInfoPanel({ data, range, devices, selectedDevice }) {
  // Query raw row count for accurate update rate (data state is pivoted in multi-device mode)
  const [rawCount, setRawCount] = useState(0);
  useEffect(() => {
    const since = getTimeAgo(range.unit, range.value).toISOString();
    let q = supabase.from('sensor_readings').select('*', { count: 'exact', head: true }).gte('recorded_at', since);
    if (selectedDevice !== 'all') q = q.eq('device_id', selectedDevice);
    q.then(({ count }) => setRawCount(count || 0));
  }, [range, selectedDevice]);

  const totalReadings = rawCount;
  // Count devices that have data in the latest bucket (works for both pivoted and raw)
  const activeDeviceCount = (() => {
    if (!data.length) return 0;
    const last = data[data.length - 1];
    const fromPivot = devices.filter(id => last[`temperature_${id}`] != null).length;
    if (fromPivot > 0) return fromPivot;
    const twoMinAgo = Date.now() - 120000;
    return new Set(
      data.filter(d => d.recorded_at && new Date(d.recorded_at).getTime() >= twoMinAgo)
          .map(d => d.device_id).filter(Boolean)
    ).size;
  })();

  // Calculate readings per hour
  const timeRangeHours = range.unit === 'hours' ? range.value : range.value * 24;
  const readingsPerHour = timeRangeHours > 0 ? (totalReadings / timeRangeHours).toFixed(1) : '0';

  // Group data by hour for chart
  const hourlyData = [];
  if (data.length > 0) {
    const grouped = {};
    data.forEach(d => {
      const hour = d.time;
      if (!grouped[hour]) {
        grouped[hour] = { time: hour, count: 0 };
      }
      grouped[hour].count++;
    });
    Object.values(grouped).forEach(g => hourlyData.push(g));
  }

  return (
    <div className="card-glow p-5">
      <div className="flex items-center gap-2 mb-4">
        <span>📊</span>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>System Info</h3>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg p-3 cursor-help"
             style={{ background: 'var(--surface-2)', opacity: 0.7 }}
             title="Total sensor readings pushed to Supabase in the selected time range (across all filtered devices).">
          <div className="text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
            Data Points <span className="opacity-60">ⓘ</span>
          </div>
          <div className="text-2xl font-mono font-semibold text-cyan-400">{totalReadings}</div>
        </div>
        <div className="rounded-lg p-3 cursor-help"
             style={{ background: 'var(--surface-2)', opacity: 0.7 }}
             title="Average readings per hour = Data Points ÷ range hours. Each Pi pushes one reading per minute (~60/h), so 2 Pi ≈ 120/h.">
          <div className="text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
            Update Rate <span className="opacity-60">ⓘ</span>
          </div>
          <div className="text-2xl font-mono font-semibold text-emerald-400">{readingsPerHour}<span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>/h</span></div>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', opacity: 0.7 }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Active Devices</div>
          <div className="text-2xl font-mono font-semibold text-purple-400">{activeDeviceCount}</div>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', opacity: 0.7 }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Time Range</div>
          <div className="text-2xl font-mono font-semibold text-amber-400">{range.label}</div>
        </div>
      </div>

      {/* Mini chart showing readings over time */}
      {hourlyData.length > 0 ? (
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={hourlyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="grad-readings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis
              dataKey="time"
              tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-surface-2 border border-white/10 rounded-lg px-3 py-2 shadow-xl text-xs">
                    <p className="text-white/50 mb-1">{payload[0].payload.time}</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span className="text-white/70">Readings:</span>
                      <span className="text-white font-mono font-medium">{payload[0].value}</span>
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#22d3ee"
              strokeWidth={2}
              fill="url(#grad-readings)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[100px] flex items-center justify-center text-xs" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
          No activity data
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
  const [isMultiDevice, setIsMultiDevice] = useState(false);
  const [deviceColorMap, setDeviceColorMap] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);
  const [musicSectionOpen, setMusicSectionOpen] = useState(false);
  const [theme, setTheme] = useState('dark');

  // Device settings hook
  const deviceSettings = useDeviceSettings();

  // Theme toggle effect
  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

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

    if (selectedDevice === 'all' && rows?.length > 0) {
      // Multi-device: pivot data into per-device columns + averages
      const sensorKeys = INDIVIDUAL_SENSORS.map(s => s.key);
      const pivoted = pivotDataForMultiDevice(rows, sensorKeys, range, formatTime);
      const activeDevices = [...new Set(rows.map(r => r.device_id))].filter(Boolean);
      setData(pivoted);
      setDeviceColorMap(getDeviceColorMap(activeDevices));
      setIsMultiDevice(true);
    } else {
      // Single device: downsample and map as before
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
      setIsMultiDevice(false);
    }

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

  // Auto-refresh every 60s (pause when settings modal is open)
  useEffect(() => {
    if (settingsOpen) return;
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData, settingsOpen]);

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
            if (selectedDevice !== 'all') {
              // Single device: append point directly
              setData(prev => {
                const newPoint = { ...payload.new, time: formatTime(payload.new.recorded_at, range) };
                const updated = [...prev, newPoint];
                return updated.length > 200 ? updated.slice(-200) : updated;
              });
            }
            // Multi-device: skip append, rely on 60s auto-refresh for chart update
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
      {/* Header - Top Bar */}
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Ambience Monitor
          </h1>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
            <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">Live</span>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {lastUpdate ? `Last updated: ${format(lastUpdate, 'HH:mm:ss')} · ${format(lastUpdate, 'MMM d')}` : 'Connecting...'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Service Status Indicators */}
          <SimpleServiceStatus devices={devices} deviceSettings={deviceSettings} />
          {/* Theme Toggle - Icon only */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)'
            }}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          {/* Settings - Icon only */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)'
            }}
            title="Device Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Music History Button */}
        <button
          onClick={() => setMusicSectionOpen(o => !o)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all"
          style={musicSectionOpen
            ? { background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.5)', color: '#a78bfa' }
            : { background: 'var(--surface-2)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }
          }
        >
          📜 Music History
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Device Selector - Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDeviceDropdownOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-all"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-color)', color: selectedDevice === 'all' ? 'var(--text-secondary)' : '#a78bfa' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedDevice === 'all' ? 'var(--text-tertiary)' : '#a78bfa' }} />
            {selectedDevice === 'all' ? 'All Devices' : deviceSettings.getDeviceInfo(selectedDevice).displayName}
            <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {deviceDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDeviceDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] rounded-lg shadow-xl overflow-hidden"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-color)' }}
              >
                <button
                  onClick={() => { setSelectedDevice('all'); setDeviceDropdownOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium transition-all text-left"
                  style={selectedDevice === 'all'
                    ? { background: 'rgba(168, 85, 247, 0.15)', color: '#a78bfa' }
                    : { color: 'var(--text-tertiary)' }
                  }
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedDevice === 'all' ? '#a78bfa' : 'var(--text-tertiary)', opacity: selectedDevice === 'all' ? 1 : 0.4 }} />
                  All Devices
                </button>
                {devices.map(deviceId => {
                  const deviceInfo = deviceSettings.getDeviceInfo(deviceId);
                  return (
                    <button
                      key={deviceId}
                      onClick={() => { setSelectedDevice(deviceId); setDeviceDropdownOpen(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium transition-all text-left"
                      style={selectedDevice === deviceId
                        ? { background: 'rgba(168, 85, 247, 0.15)', color: '#a78bfa' }
                        : { color: 'var(--text-tertiary)' }
                      }
                      title={deviceInfo.note || deviceInfo.location || deviceId}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedDevice === deviceId ? '#a78bfa' : 'var(--text-tertiary)', opacity: selectedDevice === deviceId ? 1 : 0.4 }} />
                      <span>{deviceInfo.displayName}</span>
                      {deviceInfo.location && (
                        <span className="ml-1 text-[10px] opacity-50">({deviceInfo.location})</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Time Range Selector */}
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-color)' }}>
          {TIME_RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setRange(r)}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
              style={range.label === r.label
                ? { background: 'rgba(20, 184, 166, 0.2)', color: 'var(--accent-teal)' }
                : { color: 'var(--text-tertiary)' }
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Music Section */}
      {musicSectionOpen && (
        <div className="mb-6">
          <MusicAutoHistory
            deviceSettings={deviceSettings}
            isDarkMode={theme === 'dark'}
          />
        </div>
      )}

      {/* Current Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
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

        {(() => {
          if (isMultiDevice && data.length > 0) {
            // Average of the latest bucket across all devices
            const last = data[data.length - 1];
            const lbl = (s) => `${s} (avg)`;
            return (<>
              <StatCard label={lbl("Temperature")} value={last?.temperature_avg?.toFixed(1)} unit="°C" color="#fb7185" icon="🌡️" />
              <StatCard label={lbl("Humidity")} value={last?.humidity_avg?.toFixed(1)} unit="%" color="#60a5fa" icon="💧" />
              <StatCard label={lbl("Pressure")} value={last?.pressure_avg?.toFixed(0)} unit="hPa" color="#a78bfa" icon="🔵" />
              <StatCard label={lbl("Light")} value={last?.lux_avg?.toFixed(0)} unit="lux" color="#fbbf24" icon="☀️" />
              <StatCard label={lbl("Noise")} value={last?.noise_level_avg?.toFixed(3)} unit="" color="#f472b6" icon="🔊" />
            </>);
          }
          return (<>
            <StatCard label="Temperature" value={latest?.temperature?.toFixed(1)} unit="°C" color="#fb7185" icon="🌡️" />
            <StatCard label="Humidity" value={latest?.humidity?.toFixed(1)} unit="%" color="#60a5fa" icon="💧" />
            <StatCard label="Pressure" value={latest?.pressure?.toFixed(0)} unit="hPa" color="#a78bfa" icon="🔵" />
            <StatCard label="Light" value={latest?.lux?.toFixed(0)} unit="lux" color="#fbbf24" icon="☀️" />
            <StatCard label="Noise" value={latest?.noise_level?.toFixed(3)} unit="" color="#f472b6" icon="🔊" />
          </>);
        })()}
      </div>

      {/* Loading state */}
      {loading && data.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-6 h-6 border-2 rounded-full" style={{ borderColor: 'var(--accent-teal)', borderTopColor: 'transparent' }} />
          <span className="ml-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading sensor data...</span>
        </div>
      )}

      {/* Individual Sensor Charts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 mb-6">
        {INDIVIDUAL_SENSORS.map(sensor => (
          <SingleSensorChart
            key={sensor.key}
            sensor={sensor}
            data={data}
            range={range}
            isMultiDevice={isMultiDevice}
            devices={devices}
            deviceColorMap={deviceColorMap}
            deviceSettings={deviceSettings}
          />
        ))}
      </div>

      {/* Grouped Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SENSOR_GROUPS.map(group => (
          <ChartPanel
            key={group.title}
            title={group.title}
            icon={group.icon}
            sensors={group.sensors}
            data={data}
            range={range}
            isMultiDevice={isMultiDevice}
          />
        ))}
        {/* System Info Panel */}
        <SystemInfoPanel
          data={data}
          range={range}
          devices={devices}
          selectedDevice={selectedDevice}
        />
      </div>

      {/* Beat Rate — full width, two columns */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <BpmWidget range={range} deviceId={selectedDevice} deviceSettings={deviceSettings} />
        <MusicBpmWidget range={range} deviceId={selectedDevice} deviceSettings={deviceSettings} />
      </div>

      {/* Footer */}
      <footer className="mt-10 text-center text-[10px]" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
        Prototype &middot; version 0.{process.env.NEXT_PUBLIC_BUILD_VERSION}
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
