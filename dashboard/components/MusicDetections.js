'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { format, parseISO } from 'date-fns';
import MusicListeningModal from './MusicListeningModalNew';
import SongDetailsModal from './SongDetailsModal';

export default function MusicDetections({ devices = [], deviceSettings, isDarkMode }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [hoveredSong, setHoveredSong] = useState(null);
  const [modalPosition, setModalPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef(null);

  useEffect(() => {
    fetchSongs();

    const subscription = supabase
      .channel('music_detections_channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'music_detections',
      }, (payload) => {
        setSongs(prev => [payload.new, ...prev].slice(0, 10));
      })
      .subscribe();

    return () => supabase.removeChannel(subscription);
  }, []);

  const fetchSongs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('music_detections')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      setSongs(data || []);
    } catch (err) {
      console.error('Error fetching music:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (ts) => { try { return format(parseISO(ts), 'HH:mm:ss'); } catch { return ''; } };
  const formatDate = (ts) => { try { return format(parseISO(ts), 'MMM d, yyyy'); } catch { return ''; } };

  const handleMouseEnter = (song, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    setModalPosition({ top: rect.bottom - containerRect.top + 10, left: rect.left - containerRect.left + rect.width / 2 });
    setHoveredSong(song);
  };

  return (
    <div ref={containerRef} className="card-glow p-5 relative">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <span>🎵</span>
          <span>Music Detected</span>
          {songs.length > 0 && (
            <span className="text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>(last {songs.length})</span>
          )}
        </h2>
        <div className="flex-1" />
        <button
          onClick={fetchSongs}
          className="text-xs px-2 py-1.5 rounded-lg transition-all"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)' }}
          title="Refresh"
        >
          ↻
        </button>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
          style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}
        >
          🎤 Listen Now
        </button>
      </div>

      {/* Song List */}
      {loading ? (
        <div className="text-center py-8 text-xs" style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : songs.length === 0 ? (
        <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
          <div className="text-3xl mb-2">🎤</div>
          <p className="text-xs">No music detected yet. Click "Listen Now" to start.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {songs.map((song, index) => (
            <div
              key={song.id || index}
              className="p-3 rounded-lg transition-all hover:scale-[1.01] cursor-pointer"
              style={{
                background: 'var(--surface-2)',
                border: index === 0 ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--border-color)',
              }}
              onMouseEnter={(e) => handleMouseEnter(song, e)}
              onMouseLeave={() => setHoveredSong(null)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                    style={index === 0
                      ? { background: 'rgba(59,130,246,0.2)', color: '#60a5fa' }
                      : { background: 'var(--surface-1)', color: 'var(--text-tertiary)' }
                    }>
                    #{songs.length - index}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {song.title || 'Unknown Title'}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {song.artist || 'Unknown Artist'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {song.spotify_url && (
                    <a href={song.spotify_url} target="_blank" rel="noopener noreferrer"
                      className="text-green-500 hover:text-green-400 transition-colors" title="Spotify">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                    </a>
                  )}
                  {song.apple_music_url && (
                    <a href={song.apple_music_url} target="_blank" rel="noopener noreferrer"
                      className="text-pink-500 hover:text-pink-400 transition-colors" title="Apple Music">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.078 1.596-.31 2.3-.81a5.384 5.384 0 001.93-2.37c.223-.57.348-1.17.408-1.78.061-.655.07-1.313.07-1.97V8.09c0-.6-.02-1.2-.07-1.79l.002-.08c0-.063-.01-.13-.02-.19z"/>
                      </svg>
                    </a>
                  )}
                  <div className="text-right text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    <div>{formatDate(song.detected_at)}</div>
                    <div>{formatTime(song.detected_at)}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 text-center text-[10px]"
        style={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-tertiary)', opacity: 0.5 }}>
        Music recognition powered by AudD · MEMS Microphone on Enviro+
      </div>

      {/* Listening Modal */}
      <MusicListeningModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onDetected={fetchSongs}
        devices={devices}
        deviceSettings={deviceSettings}
      />

      {hoveredSong && (
        <SongDetailsModal song={hoveredSong} position={modalPosition} isDarkMode={isDarkMode} />
      )}
    </div>
  );
}
