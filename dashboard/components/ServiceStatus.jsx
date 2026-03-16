import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Music, Thermometer } from 'lucide-react';

const ServiceStatus = () => {
  const [services, setServices] = useState({
    ambience: { status: 'checking', lastCheck: null },
    music: { status: 'checking', lastCheck: null }
  });

  const checkServiceStatus = async () => {
    try {
      // Check both services
      const response = await fetch('/api/service-status');
      if (response.ok) {
        const data = await response.json();
        setServices({
          ambience: {
            status: data.ambience ? 'running' : 'stopped',
            lastCheck: new Date()
          },
          music: {
            status: data.music ? 'running' : 'stopped',
            lastCheck: new Date()
          }
        });
      } else {
        // If API fails, mark as unknown
        setServices({
          ambience: { status: 'unknown', lastCheck: new Date() },
          music: { status: 'unknown', lastCheck: new Date() }
        });
      }
    } catch (error) {
      console.error('Error checking service status:', error);
      setServices({
        ambience: { status: 'error', lastCheck: new Date() },
        music: { status: 'error', lastCheck: new Date() }
      });
    }
  };

  useEffect(() => {
    // Initial check
    checkServiceStatus();

    // Check every 30 seconds
    const interval = setInterval(checkServiceStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'stopped':
        return 'bg-red-500';
      case 'checking':
        return 'bg-yellow-500 animate-pulse';
      case 'unknown':
        return 'bg-gray-500';
      case 'error':
        return 'bg-orange-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'running':
        return 'Service is running';
      case 'stopped':
        return 'Service is stopped';
      case 'checking':
        return 'Checking service...';
      case 'unknown':
        return 'Status unknown';
      case 'error':
        return 'Connection error';
      default:
        return 'Unknown status';
    }
  };

  return (
    <div className="flex items-center gap-4 p-3 bg-gray-800 rounded-lg shadow-lg">
      {/* Ambience Service Status */}
      <div className="flex items-center gap-2 group relative">
        <div className="relative">
          <Thermometer className="w-5 h-5 text-gray-300" />
          <div
            className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${getStatusColor(services.ambience.status)} border border-gray-700`}
            aria-label={`Ambience monitoring service: ${getStatusText(services.ambience.status)}`}
          />
        </div>

        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
            <div className="font-semibold">Ambience Monitor</div>
            <div>{getStatusText(services.ambience.status)}</div>
            {services.ambience.lastCheck && (
              <div className="text-gray-400 text-[10px]">
                Last check: {services.ambience.lastCheck.toLocaleTimeString()}
              </div>
            )}
          </div>
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      </div>

      {/* Music Recognition Service Status */}
      <div className="flex items-center gap-2 group relative">
        <div className="relative">
          <Music className="w-5 h-5 text-gray-300" />
          <div
            className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${getStatusColor(services.music.status)} border border-gray-700`}
            aria-label={`Music recognition service: ${getStatusText(services.music.status)}`}
          />
        </div>

        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
            <div className="font-semibold">Music Recognition</div>
            <div>{getStatusText(services.music.status)}</div>
            {services.music.lastCheck && (
              <div className="text-gray-400 text-[10px]">
                Last check: {services.music.lastCheck.toLocaleTimeString()}
              </div>
            )}
          </div>
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      </div>

      {/* Connection Status Text */}
      <div className="text-xs text-gray-400 ml-2">
        {services.ambience.status === 'running' && services.music.status === 'running' ? (
          <span className="text-green-400">All services online</span>
        ) : services.ambience.status === 'checking' || services.music.status === 'checking' ? (
          <span className="text-yellow-400">Checking services...</span>
        ) : (
          <span className="text-orange-400">Some services offline</span>
        )}
      </div>
    </div>
  );
};

export default ServiceStatus;