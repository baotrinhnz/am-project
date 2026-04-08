'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const SimpleServiceStatus = ({ devices = [], deviceSettings }) => {
  const [deviceStatus, setDeviceStatus] = useState({});

  useEffect(() => {
    const checkStatus = async () => {
      if (devices.length === 0) return;

      const twoMinutesAgo = new Date(Date.now() - 120000).toISOString();
      const status = {};

      for (const deviceId of devices) {
        const { data } = await supabase
          .from('sensor_readings')
          .select('recorded_at')
          .eq('device_id', deviceId)
          .gte('recorded_at', twoMinutesAgo)
          .limit(1);

        status[deviceId] = data && data.length > 0;
      }

      setDeviceStatus(status);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [devices]);

  if (devices.length === 0) return null;

  return (
    <div className="flex gap-3 text-xs">
      {devices.map(id => {
        const name = deviceSettings?.getDeviceInfo(id)?.displayName || id;
        const online = deviceStatus[id];
        return (
          <div key={id} className="flex items-center gap-1" title={`${name}: ${online ? 'Online' : 'Offline'}`}>
            <div className={`w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-700'}`} />
            <span style={{ color: 'var(--text-tertiary)' }}>{name}</span>
          </div>
        );
      })}
    </div>
  );
};

export default SimpleServiceStatus;
