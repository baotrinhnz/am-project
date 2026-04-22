'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { format, parseISO, startOfDay, endOfDay, subDays } from 'date-fns';

const SERVICE_COLORS = {
  audd:     { bg: 'rgba(96,165,250,0.15)', text: '#60a5fa' },
  acrcloud: { bg: 'rgba(168,85,247,0.15)', text: '#a78bfa' },
};

const DATE_OPTIONS = [
  { label: 'Today',        days: 0 },
  { label: 'Yesterday',    days: 1 },
  { label: 'Last 7 days',  days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'All time',     days: null },
];

export default function MusicAutoHistory({ deviceSettings }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState([]);

  const [dateFilter, setDateFilter] = useState(DATE_OPTIONS[0]);
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('music_auto_detections')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(500);

      if (dateFilter.days !== null) {
        const now = new Date();
        const start = dateFilter.days === 0 ? startOfDay(now) : startOfDay(subDays(now, dateFilter.days));
        const end = dateFilter.days === 1 ? endOfDay(subDays(now, 1)) : endOfDay(now);
        query = query.gte('detected_at', start.toISOString()).lte('detected_at', end.toISOString());
      }
      if (deviceFilter !== 'all') {
        query = query.eq('device_id', deviceFilter);
      }
      if (statusFilter === 'detected') {
        query = query.eq('status', 'detected');
      }

      const { data } = await query;
      setRows(data || []);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, deviceFilter, statusFilter]);

  useEffect(() => {
    supabase.from('music_auto_detections')
      .select('device_id')
      .limit(1000)
      .then(({ data }) => {
        if (data) setDevices([...new Set(data.map(r => r.device_id))].filter(Boolean).sort());
      });
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    const sub = supabase
      .channel('music_auto_detections_channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'music_auto_detections',
      }, () => fetchRows())
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [fetchRows]);

  const fmtTime = (ts) => { try { return format(parseISO(ts), 'HH:mm:ss'); } catch { return ''; } };
  const fmtDate = (ts) => { try { return format(parseISO(ts), 'MMM d'); } catch { return ''; } };

  const detectedCount = rows.filter(r => r.status === 'detected').length;

  return (
    <div className="card-glow p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <span>📜</span>
          <span>Music Detection History</span>
          <span className="text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>
            ({rows.length} total · {detectedCount} detected)
          </span>
        </h2>
        <button
          onClick={fetchRows}
          className="text-xs px-2 py-1 rounded"
          style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)', border: '1px solid var(--border-color)' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-color)' }}>
          {DATE_OPTIONS.map(opt => (
            <button key={opt.label}
              onClick={() => setDateFilter(opt)}
              className="px-2.5 py-1 text-[11px] font-medium rounded transition-all"
              style={dateFilter.label === opt.label
                ? { background: 'rgba(168,85,247,0.2)', color: '#a78bfa' }
                : { color: 'var(--text-tertiary)' }
              }>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setDeviceFilter('all')}
            className="px-2.5 py-1 text-[11px] font-medium rounded transition-all"
            style={deviceFilter === 'all'
              ? { background: 'rgba(96,165,250,0.2)', color: '#60a5fa' }
              : { color: 'var(--text-tertiary)' }
            }>
            All devices
          </button>
          {devices.map(id => (
            <button key={id}
              onClick={() => setDeviceFilter(id)}
              className="px-2.5 py-1 text-[11px] font-medium rounded transition-all"
              style={deviceFilter === id
                ? { background: 'rgba(96,165,250,0.2)', color: '#60a5fa' }
                : { color: 'var(--text-tertiary)' }
              }>
              {deviceSettings?.getDeviceInfo?.(id)?.displayName || id}
            </button>
          ))}
        </div>

        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setStatusFilter('all')}
            className="px-2.5 py-1 text-[11px] font-medium rounded transition-all"
            style={statusFilter === 'all'
              ? { background: 'rgba(74,222,128,0.2)', color: '#4ade80' }
              : { color: 'var(--text-tertiary)' }
            }>
            All
          </button>
          <button
            onClick={() => setStatusFilter('detected')}
            className="px-2.5 py-1 text-[11px] font-medium rounded transition-all"
            style={statusFilter === 'detected'
              ? { background: 'rgba(74,222,128,0.2)', color: '#4ade80' }
              : { color: 'var(--text-tertiary)' }
            }>
            Detected only
          </button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-xs py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-xs py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>No detections for this filter</div>
      ) : (
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0" style={{ background: 'var(--surface-1)' }}>
              <tr style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
                <th className="text-left py-2 px-2 font-medium">Time</th>
                <th className="text-left py-2 px-2 font-medium">Device</th>
                <th className="text-left py-2 px-2 font-medium">Service</th>
                <th className="text-left py-2 px-2 font-medium">Title</th>
                <th className="text-left py-2 px-2 font-medium">Artist</th>
                <th className="text-left py-2 px-2 font-medium">Genre</th>
                <th className="text-left py-2 px-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const detected = r.status === 'detected';
                const rowOpacity = detected ? 1 : 0.35;
                const device = deviceSettings?.getDeviceInfo?.(r.device_id)?.displayName || r.device_id;
                const svcColor = SERVICE_COLORS[r.service] || { bg: 'var(--surface-2)', text: 'var(--text-secondary)' };
                return (
                  <tr key={r.id}
                      style={{ opacity: rowOpacity, borderBottom: '1px solid var(--border-color)' }}>
                    <td className="py-2 px-2 font-mono whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                      <div>{fmtTime(r.detected_at)}</div>
                      <div className="text-[9px] opacity-60">{fmtDate(r.detected_at)}</div>
                    </td>
                    <td className="py-2 px-2" style={{ color: 'var(--text-secondary)' }}>{device}</td>
                    <td className="py-2 px-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase"
                            style={{ background: svcColor.bg, color: svcColor.text }}>
                        {r.service}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {r.title || '—'}
                    </td>
                    <td className="py-2 px-2" style={{ color: 'var(--text-secondary)' }}>{r.artist || '—'}</td>
                    <td className="py-2 px-2" style={{ color: 'var(--text-tertiary)' }}>{r.genre || '—'}</td>
                    <td className="py-2 px-2 text-[10px] uppercase" style={{ color: 'var(--text-tertiary)' }}>
                      {r.status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
