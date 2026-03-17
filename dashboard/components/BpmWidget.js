'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { format, parseISO } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const LOCAL_RANGES = [
  { label: '5m',  minutes: 5 },
  { label: '30m', minutes: 30 },
  { label: '1H',  minutes: 60 },
  { label: '↑',   minutes: null },  // follow global
];

export default function BpmWidget({ range, deviceId }) {
  const [data, setData] = useState([]);
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [localRange, setLocalRange] = useState(LOCAL_RANGES[0]);

  const effectiveMinutes = localRange.minutes ?? (
    range?.unit === 'days' ? range.value * 24 * 60 : (range?.value || 6) * 60
  );

  const effectiveMinutesRef = useRef(effectiveMinutes);
  useEffect(() => { effectiveMinutesRef.current = effectiveMinutes; }, [effectiveMinutes]);

  const fetchData = async () => {
    const since = new Date(Date.now() - effectiveMinutes * 60 * 1000).toISOString();

    let query = supabase
      .from('bpm_readings')
      .select('bpm, recorded_at')
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true })
      .limit(500);

    if (deviceId && deviceId !== 'all') {
      query = query.eq('device_id', deviceId);
    }

    const { data: rows } = await query;
    if (rows?.length) {
      setData(rows);
      setLatest(rows[rows.length - 1]);
    } else {
      setData([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    const sub = supabase
      .channel('bpm_readings_channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bpm_readings' }, payload => {
        const mins = effectiveMinutesRef.current;
        const cutoff = new Date(Date.now() - mins * 60 * 1000).toISOString();
        setLatest(payload.new);
        setData(prev => [...prev, payload.new].filter(r => r.recorded_at >= cutoff).slice(-500));
      })
      .subscribe();

    return () => supabase.removeChannel(sub);
  }, [range, deviceId, localRange]);

  const formatTime = (ts) => {
    try {
      if (effectiveMinutes <= 60) return format(parseISO(ts), 'HH:mm:ss');
      if (effectiveMinutes <= 1440) return format(parseISO(ts), 'HH:mm');
      return format(parseISO(ts), 'MMM dd HH:mm');
    } catch { return ''; }
  };

  const BPM_TABLE = [
    { bpm: '60–80',   feel: 'Slow, relaxing',        genre: 'Ballad, Ambient, Lo-fi' },
    { bpm: '80–100',  feel: 'Moderate, easy',         genre: 'R&B, Soul, Hip-hop' },
    { bpm: '100–120', feel: 'Energetic, fun',          genre: 'Pop, Indie Pop' },
    { bpm: '~120',    feel: 'Perfect balance',         genre: 'House, Dance Pop' },
    { bpm: '128–140', feel: 'Pumping, intense',        genre: 'EDM, Techno, Trance' },
    { bpm: '140–180+',feel: 'Extremely fast',          genre: 'Drum & Bass, Hardcore' },
  ];

  return (
    <div className="card-glow p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <span>🥁</span> Music Beat
          <span className="text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>(BPM)</span>
          {/* Info icon with hover tooltip */}
          <div className="relative group">
            <button className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold leading-none transition-colors"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)' }}>
              i
            </button>
            <div className="absolute left-0 top-6 z-50 hidden group-hover:block w-72 rounded-lg shadow-xl text-xs"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border-color)' }}>
              <table className="w-full border-collapse">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>BPM</th>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Feel</th>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Genre</th>
                  </tr>
                </thead>
                <tbody>
                  {BPM_TABLE.map((row, i) => (
                    <tr key={i} style={{ borderBottom: i < BPM_TABLE.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                      <td className="px-3 py-1.5 font-mono font-medium" style={{ color: '#fbbf24' }}>{row.bpm}</td>
                      <td className="px-3 py-1.5" style={{ color: 'var(--text-secondary)' }}>{row.feel}</td>
                      <td className="px-3 py-1.5" style={{ color: 'var(--text-tertiary)' }}>{row.genre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </h2>
        <div className="flex items-center gap-2">
          {/* Local range pills */}
          <div className="flex gap-0.5">
            {LOCAL_RANGES.map(r => (
              <button
                key={r.label}
                onClick={() => setLocalRange(r)}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium transition-all"
                style={localRange.label === r.label
                  ? { background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)' }
                  : { background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid transparent' }
                }
                title={r.minutes === null ? 'Follow global range' : `Last ${r.label}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
            live
          </span>
        </div>
      </div>

      {/* Current BPM */}
      <div className="mb-4">
        {loading ? (
          <div className="text-2xl font-mono font-bold" style={{ color: 'var(--text-tertiary)' }}>—</div>
        ) : latest ? (
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-mono font-bold" style={{ color: '#fbbf24' }}>
              {Math.round(latest.bpm)}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>BPM</span>
          </div>
        ) : (
          <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No data yet</div>
        )}
      </div>

      {/* Chart */}
      {data.length > 1 && (
        <ResponsiveContainer width="100%" height={80}>
          <AreaChart data={data} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
            <defs>
              <linearGradient id="bpmGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="recorded_at" tickFormatter={formatTime}
              tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }}
              stroke="var(--border-color)" tickLine={false} />
            <YAxis domain={['auto', 'auto']}
              tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }}
              stroke="var(--border-color)" tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 11 }}
              labelFormatter={formatTime}
              formatter={(v) => [`${Math.round(v)} BPM`, 'Beat Rate']}
            />
            <Area type="monotone" dataKey="bpm" stroke="#fbbf24" strokeWidth={1.5}
              fill="url(#bpmGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
