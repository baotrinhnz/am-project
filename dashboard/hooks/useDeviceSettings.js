import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useDeviceSettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  // Load settings from database on mount
  const loadSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('device_settings')
      .select('*');

    if (error) {
      console.error('Failed to load device settings:', error);
    } else if (data) {
      // Convert array to object keyed by device_id
      const settingsMap = {};
      data.forEach(setting => {
        settingsMap[setting.device_id] = setting;
      });
      setSettings(settingsMap);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Save or update a device setting
  const saveDeviceSetting = async (deviceId, config) => {
    const payload = {
      device_id: deviceId,
      display_name: config.displayName || null,
      location: config.location || null,
      note: config.note || null,
    };

    // Upsert (insert or update if exists)
    const { data, error } = await supabase
      .from('device_settings')
      .upsert(payload, { onConflict: 'device_id' })
      .select()
      .single();

    if (error) {
      console.error('Failed to save device setting:', error);
      return false;
    }

    // Update local state
    setSettings(prev => ({
      ...prev,
      [deviceId]: data
    }));

    return true;
  };

  // Get device display info
  const getDeviceInfo = (deviceId) => {
    const setting = settings[deviceId];
    return {
      displayName: setting?.display_name || deviceId,
      location: setting?.location || '',
      note: setting?.note || '',
    };
  };

  // Delete a device setting
  const deleteDeviceSetting = async (deviceId) => {
    const { error } = await supabase
      .from('device_settings')
      .delete()
      .eq('device_id', deviceId);

    if (error) {
      console.error('Failed to delete device setting:', error);
      return false;
    }

    // Update local state
    setSettings(prev => {
      const updated = { ...prev };
      delete updated[deviceId];
      return updated;
    });

    return true;
  };

  return {
    settings,
    loading,
    saveDeviceSetting,
    getDeviceInfo,
    deleteDeviceSetting,
    reloadSettings: loadSettings,
  };
}
