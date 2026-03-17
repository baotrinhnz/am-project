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

  return (
    <div className="card-glow p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <span>🥁</span> Music Beat
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
