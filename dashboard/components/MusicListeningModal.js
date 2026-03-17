'use client';

import { useState, useEffect } from 'react';

export default function MusicListeningModal({
  isOpen,
  onClose,
  deviceId,
  isDarkMode
}) {
  const [status, setStatus] = useState('idle'); // idle, listening, success, error
  const [detectedSong, setDetectedSong] = useState(null);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (isOpen && status === 'idle') {
      startListening();
    }
  }, [isOpen]);

  useEffect(() => {
    if (status === 'listening' && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, status]);

  const startListening = async () => {
    setStatus('listening');
    setDetectedSong(null);
    setError(null);
    setCountdown(25); // 25s covers worst case: bpm cycle (5s) + recording (10s) + AudD (~2s)

    try {
      // Call API to trigger music detection on Raspberry Pi
      const response = await fetch('/api/detect-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId })
      });

      const data = await response.json();

      if (data.success && data.song) {
        setDetectedSong(data.song);
        setStatus('success');
      } else if (data.error) {
        setError(data.error);
        setStatus('error');
      } else {
        setError('No music detected. Try playing music louder or closer to the sensor.');
        setStatus('error');
      }
    } catch (err) {
      console.error('Detection error:', err);
      setError('Failed to connect to device. Please check if the device is online.');
      setStatus('error');
    }
  };

  const handleClose = () => {
    setStatus('idle');
    setDetectedSong(null);
    setError(null);
    setCountdown(0);
    onClose();
  };

  const handleRetry = () => {
    startListening();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={status !== 'listening' ? handleClose : undefined}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className={`relative w-full max-w-md rounded-xl shadow-2xl transition-all ${
          isDarkMode ? 'bg-gray-800' : 'bg-white'
        }`}>
          {/* Header */}
          <div className={`px-6 py-4 border-b ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <h2 className={`text-xl font-semibold flex items-center gap-2 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              <span className="text-2xl">🎵</span>
              <span>Music Detection</span>
            </h2>
          </div>

          {/* Content */}
          <div className="px-6 py-6">
            {/* Listening State */}
            {status === 'listening' && (
              <div className="text-center">
                <div className="relative w-32 h-32 mx-auto mb-6">
                  {/* Animated circles */}
                  <div className="absolute inset-0 rounded-full bg-blue-500 opacity-20 animate-ping" />
                  <div className="absolute inset-2 rounded-full bg-blue-500 opacity-30 animate-ping animation-delay-200" />
                  <div className="absolute inset-4 rounded-full bg-blue-500 opacity-40 animate-ping animation-delay-400" />

                  {/* Center icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center">
                      <span className="text-4xl">🎤</span>
                    </div>
                  </div>

                  {/* Countdown */}
                  {countdown > 0 && (
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                      {countdown}s
                    </div>
                  )}
                </div>

                <h3 className={`text-lg font-semibold mb-2 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Listening to music...
                </h3>
                <p className={`text-sm ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Please play music near the sensor
                </p>
              </div>
            )}

            {/* Success State */}
            {status === 'success' && detectedSong && (
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <h3 className={`text-lg font-semibold mb-4 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Song Detected!
                </h3>

                <div className={`p-4 rounded-lg ${
                  isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                }`}>
                  <h4 className={`font-bold text-lg mb-1 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {detectedSong.title}
                  </h4>
                  <p className={`text-sm mb-3 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {detectedSong.artist}
                    {detectedSong.album && ` • ${detectedSong.album}`}
                  </p>

                  {/* Music service links */}
                  <div className="flex justify-center gap-3">
                    {detectedSong.spotify_url && (
                      <a
                        href={detectedSong.spotify_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                        </svg>
                        Spotify
                      </a>
                    )}
                    {detectedSong.apple_music_url && (
                      <a
                        href={detectedSong.apple_music_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.078 1.596-.31 2.3-.81a5.384 5.384 0 001.93-2.37c.223-.57.348-1.17.408-1.78.061-.655.07-1.313.07-1.97V8.09c0-.6-.02-1.2-.07-1.79l.002-.08c0-.063-.01-.13-.02-.19z"/>
                        </svg>
                        Apple Music
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error State */}
            {status === 'error' && (
              <div className="text-center">
                <div className="text-6xl mx-auto mb-4">
                  {error === "I don't know this song" ? '🤷' : '😕'}
                </div>

                <h3 className={`text-lg font-semibold mb-2 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  {error === "I don't know this song" ? 'Oh....' : 'Detection Failed'}
                </h3>
                <p className={`text-sm mb-4 text-center ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {error}
                </p>

                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`px-6 py-4 border-t flex justify-end ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <button
              onClick={handleClose}
              disabled={status === 'listening'}
              className={`px-4 py-2 rounded-lg transition-colors ${
                status === 'listening'
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : isDarkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              {status === 'listening' ? 'Please wait...' : 'Close'}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        .animation-delay-200 {
          animation-delay: 200ms;
        }
        .animation-delay-400 {
          animation-delay: 400ms;
        }
      `}</style>
    </>
  );
}