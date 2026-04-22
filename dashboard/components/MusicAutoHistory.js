'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { format, parseISO } from 'date-fns';

const SERVICE_COLORS = {
  audd:     { bg: 'rgba(96,165,250,0.15)', text: '#60a5fa' },
  acrcloud: { bg: 'rgba(168,85,247,0.15)', text: '#a78bfa' },
};

export default function MusicAutoHistory({ deviceSettings }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRows();
    const sub = supabase
      .channel('music_auto_detections_channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'music_auto_detections',
      }, (payload) => {
        setRows(prev => [payload.new, ...prev].slice(0, 50));
      })
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  const fetchRows = async () => {
    try {
      setLoading(true);
      const { data } = await supabase
        .from('music_auto_detections')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(50);
      setRows(data || []);
    } finally {
      setLoading(false);
    }
  };

  const fmtTime = (ts) => { try { return format(parseISO(ts), 'HH:mm:ss'); } catch { return ''; } };
  const fmtDate = (ts) => { try { return format(parseISO(ts), 'MMM d'); } catch { return ''; } };

  return (
    <div className="card-glow p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <span>📜</span>
          <span>Music Detection History</span>
          {rows.length > 0 && (
            <span className="text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>
              ({rows.length})
            </span>
          )}
        </h2>
        <button
          onClick={fetchRows}
          className="text-xs px-2 py-1 rounded"
          style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)', border: '1px solid var(--border-color)' }}
        >
          ↻ Refresh
        </button>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-xs py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-xs py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>No detections yet</div>
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
