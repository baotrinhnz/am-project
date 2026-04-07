// ─── Multi-Device Data Utilities ────────────────────────────────────────────
// Pivots flat sensor_readings rows into aligned time-bucketed data
// with per-device columns and averages.

const DEVICE_COLORS = [
  '#60a5fa', // blue
  '#4ade80', // green
  '#fb923c', // orange
  '#a78bfa', // purple
  '#f472b6', // pink
  '#22d3ee', // cyan
  '#facc15', // yellow
  '#f87171', // red
];

export function getDeviceColorMap(devices) {
  const sorted = [...devices].sort();
  const map = {};
  sorted.forEach((id, i) => {
    map[id] = DEVICE_COLORS[i % DEVICE_COLORS.length];
  });
  return map;
}

function getBucketMs(range) {
  const { value, unit } = range;
  if (unit === 'hours' && value <= 1) return 60_000;       // 1 min
  if (unit === 'hours' && value <= 6) return 3 * 60_000;   // 3 min
  if (unit === 'hours' && value <= 24) return 10 * 60_000; // 10 min
  if (unit === 'days' && value <= 7) return 60 * 60_000;   // 1 hour
  return 4 * 60 * 60_000;                                  // 4 hours
}

export function pivotDataForMultiDevice(rows, sensorKeys, range, formatTimeFn) {
  if (!rows || rows.length === 0) return [];

  const bucketMs = getBucketMs(range);
  const deviceIds = [...new Set(rows.map(r => r.device_id))].filter(Boolean).sort();

  // Group rows into time buckets per device
  // buckets: Map<bucketKey, Map<deviceId, { sums, counts }>>
  const buckets = new Map();

  for (const row of rows) {
    const epoch = new Date(row.recorded_at).getTime();
    const bucketKey = Math.floor(epoch / bucketMs) * bucketMs;

    if (!buckets.has(bucketKey)) buckets.set(bucketKey, new Map());
    const deviceMap = buckets.get(bucketKey);

    if (!deviceMap.has(row.device_id)) {
      deviceMap.set(row.device_id, { sums: {}, counts: {} });
    }
    const acc = deviceMap.get(row.device_id);

    for (const key of sensorKeys) {
      const val = row[key];
      if (val != null && typeof val === 'number') {
        acc.sums[key] = (acc.sums[key] || 0) + val;
        acc.counts[key] = (acc.counts[key] || 0) + 1;
      }
    }
  }

  // Build pivoted array sorted by time
  const sortedBuckets = [...buckets.keys()].sort((a, b) => a - b);
  const result = [];

  for (const bucketKey of sortedBuckets) {
    const deviceMap = buckets.get(bucketKey);
    const point = {
      time: formatTimeFn(new Date(bucketKey + bucketMs / 2), range),
      _epoch: bucketKey,
    };

    // Per-device values
    for (const key of sensorKeys) {
      const avgDevices = [];

      for (const deviceId of deviceIds) {
        const acc = deviceMap.get(deviceId);
        if (acc && acc.counts[key]) {
          const avg = acc.sums[key] / acc.counts[key];
          point[`${key}_${deviceId}`] = Math.round(avg * 10000) / 10000;
          avgDevices.push(avg);
        } else {
          point[`${key}_${deviceId}`] = null;
        }
      }

      // Average across devices
      if (avgDevices.length > 0) {
        point[`${key}_avg`] = Math.round((avgDevices.reduce((a, b) => a + b, 0) / avgDevices.length) * 10000) / 10000;
      } else {
        point[`${key}_avg`] = null;
      }
    }

    result.push(point);
  }

  return result;
}
