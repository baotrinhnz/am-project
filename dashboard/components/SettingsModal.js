'use client';

import { useState, useEffect } from 'react';

export default function SettingsModal({ isOpen, onClose, devices, deviceSettings, onSave }) {
  const [editedSettings, setEditedSettings] = useState({});
  const [saving, setSaving] = useState(false);

  // Initialize settings when modal opens
  useEffect(() => {
    if (isOpen) {
      const initial = {};
      devices.forEach(deviceId => {
        const info = deviceSettings.getDeviceInfo(deviceId);
        initial[deviceId] = {
          displayName: info.displayName === deviceId ? '' : info.displayName,
          location: info.location,
          note: info.note,
          bpmConfidenceThreshold: info.bpmConfidenceThreshold ?? 0.4,
        };
      });
      setEditedSettings(initial);
    }
  }, [isOpen, devices, deviceSettings]);

  const handleSave = async () => {
    setSaving(true);

    // Save all devices
    for (const deviceId of devices) {
      const config = editedSettings[deviceId];
      if (config) {
        await onSave(deviceId, config);
      }
    }

    setSaving(false);
    onClose();
  };

  const updateDevice = (deviceId, field, value) => {
    setEditedSettings(prev => ({
      ...prev,
      [deviceId]: {
        ...prev[deviceId],
        [field]: value,
      }
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-surface-1 border border-white/10 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Device Settings</h2>
            <p className="text-xs text-white/40 mt-1">Customize display names, locations, and notes for your devices</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors text-2xl w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {devices.length === 0 ? (
            <div className="text-center py-10 text-white/40">
              No devices found. Start collecting data to see devices here.
            </div>
          ) : (
            <div className="space-y-6">
              {devices.map(deviceId => {
                const config = editedSettings[deviceId] || {};
                return (
                  <div key={deviceId} className="bg-surface-2 border border-white/5 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-teal-400" />
                      <span className="font-mono text-sm text-white/60">{deviceId}</span>
                    </div>

                    <div className="space-y-3">
                      {/* Display Name */}
                      <div>
                        <label className="block text-xs text-white/50 mb-1.5">
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={config.displayName || ''}
                          onChange={(e) => updateDevice(deviceId, 'displayName', e.target.value)}
                          placeholder={deviceId}
                          className="w-full bg-surface-1 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-teal-400/50 focus:ring-1 focus:ring-teal-400/20"
                        />
                      </div>

                      {/* Location */}
                      <div>
                        <label className="block text-xs text-white/50 mb-1.5">
                          Location
                        </label>
                        <input
                          type="text"
                          value={config.location || ''}
                          onChange={(e) => updateDevice(deviceId, 'location', e.target.value)}
                          placeholder="e.g., Living Room, Office, Bedroom"
                          className="w-full bg-surface-1 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-teal-400/50 focus:ring-1 focus:ring-teal-400/20"
                        />
                      </div>

                      {/* Note */}
                      <div>
                        <label className="block text-xs text-white/50 mb-1.5">
                          Note <span className="text-white/30">(shown on hover)</span>
                        </label>
                        <textarea
                          value={config.note || ''}
                          onChange={(e) => updateDevice(deviceId, 'note', e.target.value)}
                          placeholder="e.g., Near window, south-facing"
                          rows={2}
                          className="w-full bg-surface-1 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-teal-400/50 focus:ring-1 focus:ring-teal-400/20 resize-none"
                        />
                      </div>

                      {/* BPM Confidence Threshold */}
                      <div>
                        <label className="block text-xs text-white/50 mb-1.5">
                          Music Beat Confidence Threshold
                          <span className="ml-2 text-amber-400 font-mono">{(config.bpmConfidenceThreshold ?? 0.4).toFixed(2)}</span>
                          <span className="text-white/30 ml-1">(0 = all beats, 1 = music only)</span>
                        </label>
                        <input
                          type="range"
                          min="0" max="1" step="0.05"
                          value={config.bpmConfidenceThreshold ?? 0.4}
                          onChange={(e) => updateDevice(deviceId, 'bpmConfidenceThreshold', parseFloat(e.target.value))}
                          className="w-full accent-amber-400"
                        />
                        <div className="flex justify-between text-[10px] text-white/30 mt-1">
                          <span>Ambient</span>
                          <span>↑ threshold</span>
                          <span>Music only</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-white/60 hover:text-white/80 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-teal-500/20 text-teal-400 rounded-md hover:bg-teal-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
