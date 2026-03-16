'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const SimpleServiceStatus = () => {
  const [musicActive, setMusicActive] = useState(false);
  const [sensorActive, setSensorActive] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      // Check if we got sensor data in last 2 minutes
      const twoMinutesAgo = new Date(Date.now() - 120000).toISOString();

      const { data: sensorData } = await supabase
        .from('sensor_readings')
        .select('recorded_at')
        .gte('recorded_at', twoMinutesAgo)
        .limit(1);

      setSensorActive(sensorData && sensorData.length > 0);

      // For music, just check if service processed any commands recently
      const { data: commandData } = await supabase
        .from('device_commands')
        .select('processed_at')
        .gte('processed_at', twoMinutesAgo)
        .limit(1);

      setMusicActive(commandData && commandData.length > 0);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex gap-2 text-xs">
      <div className="flex items-center gap-1">
        <div className={`w-2 h-2 rounded-full ${sensorActive ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-gray-400">Sensor</span>
      </div>
      <div className="flex items-center gap-1">
        <div className={`w-2 h-2 rounded-full ${musicActive ? 'bg-green-500' : 'bg-gray-500'}`} />
        <span className="text-gray-400">Music</span>
      </div>
    </div>
  );
};

export default SimpleServiceStatus;