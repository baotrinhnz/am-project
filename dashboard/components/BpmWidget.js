'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { format, parseISO } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function BpmWidget({ range, deviceId }) {
  const [data, setData] = useState([]);
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const hours = range?.unit === 'days' ? range.value * 24 : (range?.value || 6);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

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
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    const sub = supabase
      .channel('bpm_readings_channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bpm_readings' }, payload => {
        setLatest(payload.new);
        setData(prev => [...prev.slice(-499), payload.new]);
      })
      .subscribe();

    return () => supabase.removeChannel(sub);
  }, [range, deviceId]);

  const formatTime = (ts) => {
    try {
      const hours = range?.unit === 'days' ? range.value * 24 : (range?.value || 6);
      return format(parseISO(ts), hours <= 24 ? 'HH:mm' : 'MMM dd HH:mm');
    } catch { return ''; }
  };

  return (
    <div className="card-glow p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <span>🥁</span> Beat Rate
        </h2>
        <span className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
          live
        </span>
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
            <XAxis dataKey="recorded_at" tickFormatter={formatTime} tick={{ fontSize: 9 }}
              stroke="var(--border-color)" tickLine={false} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9 }} stroke="var(--border-color)" tickLine={false} />
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
