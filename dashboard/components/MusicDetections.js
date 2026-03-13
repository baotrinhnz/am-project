'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import MusicListeningModal from './MusicListeningModal';
import SongDetailsModal from './SongDetailsModal';

export default function MusicDetections({ deviceId, isDarkMode }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [hoveredSong, setHoveredSong] = useState(null);
  const [modalPosition, setModalPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef(null);

  useEffect(() => {
    fetchSongs();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel('music_detections_channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'music_detections',
        filter: `device_id=eq.${deviceId}`
      }, (payload) => {
        console.log('New song detected:', payload.new);
        setSongs(prev => [payload.new, ...prev].slice(0, 10)); // Keep last 10 songs
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [deviceId]);

  const fetchSongs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('music_detections')
        .select('*')
        .eq('device_id', deviceId)
        .order('detected_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setSongs(data || []);
    } catch (err) {
      console.error('Error fetching music detections:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp) => {
    try {
      return format(parseISO(timestamp), 'HH:mm:ss');
    } catch {
      return '';
    }
  };

  const formatDate = (timestamp) => {
    try {
      return format(parseISO(timestamp), 'MMM d, yyyy');
    } catch {
      return '';
    }
  };

  const formatRelativeTime = (timestamp) => {
    try {
      return formatDistanceToNow(parseISO(timestamp), { addSuffix: true });
    } catch {
      return '';
    }
  };

  const handleMouseEnter = (song, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();

    setModalPosition({
      top: rect.bottom - containerRect.top + 10,
      left: rect.left - containerRect.left + rect.width / 2
    });
    setHoveredSong(song);
  };

  const handleMouseLeave = () => {
    setHoveredSong(null);
  };

  return (
    <div ref={containerRef} className={`relative p-6 rounded-lg border ${
      isDarkMode
        ? 'bg-gray-800 border-gray-700'
        : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-xl font-semibold flex items-center gap-2 ${
          isDarkMode ? 'text-white' : 'text-gray-900'
        }`}>
          <span>🎵</span>
          <span>Music Detected</span>
          {songs.length > 0 && (
            <span className={`text-sm font-normal ${
              isDarkMode ? 'text-gray-400' : 'text-gray-500'
            }`}>
              (last {songs.length})
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalOpen(true)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all transform hover:scale-105 flex items-center gap-2 ${
              isDarkMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20'
                : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20'
            }`}
          >
            <span>🎤</span>
            <span>Listen Now</span>
          </button>
          <button
            onClick={fetchSongs}
            className={`px-3 py-1 rounded-md text-sm transition-colors ${
              isDarkMode
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className={`text-center py-8 ${
          isDarkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          Loading music history...
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500">
          Error: {error}
        </div>
      ) : songs.length === 0 ? (
        <div className={`text-center py-8 ${
          isDarkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          <div className="text-4xl mb-2">🎤</div>
          <p>No music detected yet</p>
          <p className="text-sm mt-1">Click "Listen Now" to start detecting!</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {songs.map((song, index) => (
            <div
              key={song.id || index}
              className={`p-3 rounded-lg transition-all hover:scale-[1.01] cursor-pointer ${
                isDarkMode
                  ? 'bg-gray-700 hover:bg-gray-600'
                  : 'bg-gray-50 hover:bg-gray-100'
              } ${index === 0 ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}`}
              onMouseEnter={(e) => handleMouseEnter(song, e)}
              onMouseLeave={handleMouseLeave}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded ${
                      index === 0
                        ? 'bg-blue-500 text-white'
                        : isDarkMode
                          ? 'bg-gray-600 text-gray-300'
                          : 'bg-gray-200 text-gray-600'
                    }`}>
                      #{songs.length - index}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold truncate ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        {song.title || 'Unknown Title'}
                      </h3>
                      <p className={`text-sm truncate ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {song.artist || 'Unknown Artist'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    {song.spotify_url && (
                      <a
                        href={song.spotify_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-500 hover:text-green-400 transition-colors"
                        title="Open in Spotify"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                        </svg>
                      </a>
                    )}
                    {song.apple_music_url && (
                      <a
                        href={song.apple_music_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-pink-500 hover:text-pink-400 transition-colors"
                        title="Open in Apple Music"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.078 1.596-.31 2.3-.81a5.384 5.384 0 001.93-2.37c.223-.57.348-1.17.408-1.78.061-.655.07-1.313.07-1.97V8.09c0-.6-.02-1.2-.07-1.79l.002-.08c0-.063-.01-.13-.02-.19zm-3.48 5.65c0 .893 0 1.783-.006 2.674-.006.854-.04 1.705-.215 2.543-.16.767-.482 1.453-1.076 1.97-.67.576-1.46.876-2.33.958-.507.048-1.016.06-1.525.06-2.6.002-5.198 0-7.797.002-1.185 0-2.37 0-3.556-.002a9.574 9.574 0 01-1.12-.066c-.743-.098-1.414-.337-1.954-.885a3.42 3.42 0 01-.835-1.363c-.165-.57-.24-1.156-.27-1.747-.04-.873-.04-1.747-.04-2.62V10.75c0-.714 0-1.43.006-2.144.007-.695.025-1.39.14-2.076.118-.698.373-1.336.87-1.857.603-.63 1.36-.95 2.24-1.04.644-.066 1.29-.073 1.94-.073 1.863 0 3.726-.002 5.59 0 1.928.002 3.855-.002 5.782 0 .863 0 1.725.013 2.58.108.976.108 1.823.476 2.476 1.227.57.66.873 1.444.983 2.308.065.515.093 1.033.095 1.552.002.926.002 1.852.002 2.778z"/>
                        </svg>
                      </a>
                    )}
                    <span className={`${
                      isDarkMode ? 'text-gray-500' : 'text-gray-400'
                    }`}>
                      🕐 {formatTime(song.detected_at)}
                    </span>
                    <span className={`${
                      isDarkMode ? 'text-gray-500' : 'text-gray-400'
                    }`}>
                      • {formatRelativeTime(song.detected_at)}
                    </span>
                  </div>
                </div>
                <div className={`text-xs text-right ml-3 ${
                  isDarkMode ? 'text-gray-500' : 'text-gray-400'
                }`}>
                  {formatDate(song.detected_at)}
                  <div className="mt-1">
                    {formatTime(song.detected_at)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={`mt-4 pt-4 border-t text-center text-xs ${
        isDarkMode
          ? 'border-gray-700 text-gray-500'
          : 'border-gray-200 text-gray-400'
      }`}>
        Music recognition powered by AudD • MEMS Microphone on Enviro+
      </div>

      {/* Music Listening Modal */}
      <MusicListeningModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          fetchSongs(); // Refresh list after detection
        }}
        deviceId={deviceId}
        isDarkMode={isDarkMode}
      />

      {/* Song Details Hover Modal */}
      {hoveredSong && (
        <SongDetailsModal
          song={hoveredSong}
          position={modalPosition}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
}