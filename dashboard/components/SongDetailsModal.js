'use client';

import { format, parseISO } from 'date-fns';

export default function SongDetailsModal({ song, position, isDarkMode }) {
  if (!song) return null;

  const formatDateTime = (timestamp) => {
    try {
      return format(parseISO(timestamp), 'MMM d, yyyy • HH:mm:ss');
    } catch {
      return '';
    }
  };

  return (
    <div
      className={`absolute z-50 w-80 p-4 rounded-lg shadow-2xl border ${
        isDarkMode
          ? 'bg-gray-800 border-gray-700'
          : 'bg-white border-gray-200'
      }`}
      style={{
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)',
      }}
    >
      {/* Arrow pointing to the song item */}
      <div
        className={`absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 ${
          isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        } border-l border-t`}
      />

      {/* Song Details */}
      <div className="relative">
        {/* Title */}
        <h3 className={`font-bold text-lg mb-2 ${
          isDarkMode ? 'text-white' : 'text-gray-900'
        }`}>
          {song.title || 'Unknown Title'}
        </h3>

        {/* Artist & Album */}
        <div className={`space-y-1 mb-3 ${
          isDarkMode ? 'text-gray-300' : 'text-gray-700'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Artist:</span>
            <span className="text-sm">{song.artist || 'Unknown'}</span>
          </div>
          {song.album && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Album:</span>
              <span className="text-sm">{song.album}</span>
            </div>
          )}
          {song.release_date && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Released:</span>
              <span className="text-sm">{song.release_date}</span>
            </div>
          )}
          {song.label && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Label:</span>
              <span className="text-sm">{song.label}</span>
            </div>
          )}
        </div>

        {/* Detection Time */}
        <div className={`text-xs mb-3 pb-3 border-b ${
          isDarkMode
            ? 'text-gray-400 border-gray-700'
            : 'text-gray-500 border-gray-200'
        }`}>
          Detected: {formatDateTime(song.detected_at)}
        </div>

        {/* Music Service Links */}
        {(song.spotify_url || song.apple_music_url) && (
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${
              isDarkMode ? 'text-gray-400' : 'text-gray-500'
            }`}>
              Listen on:
            </span>
            {song.spotify_url && (
              <a
                href={song.spotify_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                <span>Spotify</span>
              </a>
            )}
            {song.apple_music_url && (
              <a
                href={song.apple_music_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.078 1.596-.31 2.3-.81a5.384 5.384 0 001.93-2.37c.223-.57.348-1.17.408-1.78.061-.655.07-1.313.07-1.97V8.09c0-.6-.02-1.2-.07-1.79l.002-.08c0-.063-.01-.13-.02-.19z"/>
                </svg>
                <span>Apple</span>
              </a>
            )}
          </div>
        )}

        {/* Device ID */}
        <div className={`text-xs mt-3 ${
          isDarkMode ? 'text-gray-500' : 'text-gray-400'
        }`}>
          Device: {song.device_id}
        </div>
      </div>
    </div>
  );
}