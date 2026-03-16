'use client';

import { useState, useRef, useEffect } from 'react';

export default function MusicListeningModal({ isOpen, onClose, onDetected, devices = [], deviceSettings }) {
  const [musicDevice, setMusicDevice] = useState('');
  const [status, setStatus] = useState('idle'); // idle | listening | thinking | success | error
  const [detectedSong, setDetectedSong] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const thinkingTimerRef = useRef(null);

  // Auto-select first device
  useEffect(() => {
    if (devices.length > 0 && !musicDevice) {
      setMusicDevice(devices[0]);
    }
  }, [devices]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setDetectedSong(null);
      setError(null);
    }
  }, [isOpen]);

  const getDeviceName = (id) => {
    if (!deviceSettings) return id;
    const info = deviceSettings.getDeviceInfo(id);
    return info?.displayName || id;
  };

  const handleListenNow = async () => {
    if (!musicDevice) return;

    abortRef.current = new AbortController();
    setStatus('listening');
    setDetectedSong(null);
    setError(null);

    // After 10s (recording duration), switch to "thinking"
    thinkingTimerRef.current = setTimeout(() => {
      setStatus(prev => prev === 'listening' ? 'thinking' : prev);
    }, 10000);

    try {
      const res = await fetch('/api/detect-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: musicDevice }),
        signal: abortRef.current.signal,
      });
      clearTimeout(thinkingTimerRef.current);
      const data = await res.json();

      if (data.success && data.song) {
        setDetectedSong(data.song);
        setStatus('success');
        onDetected?.();
      } else {
        setError(data.error || 'No music detected');
        setStatus('error');
      }
    } catch (err) {
      clearTimeout(thinkingTimerRef.current);
      if (err.name === 'AbortError') {
        setStatus('idle');
      } else {
        setError('Cannot connect to device. Check if the device is online.');
        setStatus('error');
      }
    }
  };

  const handleCancel = () => {
    clearTimeout(thinkingTimerRef.current);
    abortRef.current?.abort();
    setStatus('idle');
    setError(null);
  };

  const handleClose = () => {
    handleCancel();
    onClose();
  };

  if (!isOpen) return null;

  const isDetecting = status === 'listening' || status === 'thinking';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={!isDetecting ? handleClose : undefined}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-sm rounded-xl shadow-2xl"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-color)' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--border-color)' }}>
            <h2 className="text-sm font-semibold flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}>
              🎵 Music Detection
            </h2>
            {!isDetecting && (
              <button onClick={handleClose}
                className="w-6 h-6 flex items-center justify-center rounded opacity-50 hover:opacity-100 transition-opacity text-xs"
                style={{ color: 'var(--text-secondary)' }}>
                ✕
              </button>
            )}
          </div>

          {/* Content */}
          <div className="px-5 pt-4 pb-2">

            {/* Device selector */}
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>Device</span>
              {devices.length > 0 ? (
                <select
                  value={musicDevice}
                  onChange={e => setMusicDevice(e.target.value)}
                  disabled={isDetecting}
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-lg outline-none"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    opacity: isDetecting ? 0.6 : 1,
                  }}
                >
                  {devices.map(id => (
                    <option key={id} value={id}>{getDeviceName(id)}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-red-400">No device available</span>
              )}
            </div>

            {/* ── Idle ── */}
            {status === 'idle' && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-color)' }}>
                  <span className="text-3xl">🎤</span>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Play music near the sensor</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>then press Listen Now</p>
              </div>
            )}

            {/* ── Listening / Thinking ── */}
            {isDetecting && (
              <div className="text-center py-4">
                <div className="relative w-32 h-32 mx-auto mb-5">
                  <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
                  <div className="absolute inset-2 rounded-full bg-blue-500/20 animate-ping"
                    style={{ animationDelay: '200ms' }} />
                  <div className="absolute inset-4 rounded-full bg-blue-500/20 animate-ping"
                    style={{ animationDelay: '400ms' }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                      <span className="text-4xl">{status === 'listening' ? '🎤' : '🤔'}</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {status === 'listening' ? 'I am listening to the music' : 'I am thinking...'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {status === 'listening' ? 'Recording audio from microphone...' : 'Sending to AudD for analysis...'}
                </p>
              </div>
            )}

            {/* ── Success ── */}
            {status === 'success' && detectedSong && (
              <div className="text-center py-2">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)' }}>
                  <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>Song detected!</p>
                <div className="rounded-lg p-4 text-left"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-color)' }}>
                  <p className="font-semibold text-sm mb-0.5" style={{ color: 'var(--text-primary)' }}>
                    {detectedSong.title || detectedSong.song_title}
                  </p>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    {detectedSong.artist}{detectedSong.album && ` · ${detectedSong.album}`}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {detectedSong.spotify_url && (
                      <a href={detectedSong.spotify_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs transition-colors">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                        </svg>
                        Spotify
                      </a>
                    )}
                    {detectedSong.apple_music_url && (
                      <a href={detectedSong.apple_music_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                        Apple Music
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Error ── */}
            {status === 'error' && (
              <div className="text-center py-2">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-red-400 mb-2">Detection Failed</p>
                <div className="rounded-lg px-4 py-3 text-xs text-left"
                  style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                  {error}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 flex justify-end gap-2"
            style={{ borderTop: '1px solid var(--border-color)' }}>

            {isDetecting && (
              <button onClick={handleCancel}
                className="px-4 py-2 text-xs font-medium rounded-lg transition-all"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                Cancel
              </button>
            )}

            {!isDetecting && (
              <button onClick={handleClose}
                className="px-4 py-2 text-xs rounded-lg transition-all"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                Close
              </button>
            )}

            {(status === 'idle' || status === 'error') && (
              <button
                onClick={handleListenNow}
                disabled={!musicDevice || devices.length === 0}
                className="px-4 py-2 text-xs font-medium rounded-lg transition-all"
                style={(!musicDevice || devices.length === 0)
                  ? { background: 'var(--surface-2)', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)', opacity: 0.4, cursor: 'not-allowed' }
                  : { background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', color: '#60a5fa', cursor: 'pointer' }
                }
              >
                {status === 'error' ? 'Try Again' : '🎤 Listen Now'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
