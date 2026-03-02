import { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ─── Generate mock data ─────────────────────────────────────────────────────
function generateMockData(hours = 24) {
  const now = Date.now();
  const points = Math.min(hours * 4, 200);
  const step = (hours * 3600000) / points;
  return Array.from({ length: points }, (_, i) => {
    const t = now - (points - i) * step;
    const h = new Date(t).getHours();
    const dayFactor = Math.sin((h - 6) * Math.PI / 12);
    return {
      time: new Date(t).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" }),
      temperature: +(20 + dayFactor * 5 + (Math.random() - 0.5) * 2).toFixed(1),
      humidity: +(60 - dayFactor * 15 + (Math.random() - 0.5) * 5).toFixed(1),
      pressure: +(1013 + Math.sin(i / 20) * 3 + (Math.random() - 0.5) * 1).toFixed(1),
      lux: +(Math.max(0, dayFactor * 400 + (Math.random() - 0.5) * 50)).toFixed(0),
      noise_level: +(0.1 + Math.random() * 0.3).toFixed(3),
      gas_oxidising: +(40 + Math.random() * 30).toFixed(1),
      gas_reducing: +(300 + Math.random() * 200).toFixed(1),
      gas_nh3: +(50 + Math.random() * 80).toFixed(1),
      pm1: +(2 + Math.random() * 5).toFixed(1),
      pm25: +(5 + Math.random() * 15).toFixed(1),
      pm10: +(10 + Math.random() * 25).toFixed(1),
    };
  });
}

const TIME_RANGES = [
  { label: "1H", hours: 1 },
  { label: "6H", hours: 6 },
  { label: "24H", hours: 24 },
  { label: "7D", hours: 168 },
];

const SENSOR_GROUPS = [
  {
    title: "Climate", icon: "🌡️",
    sensors: [
      { key: "temperature", label: "Temp", unit: "°C", color: "#fb7185" },
      { key: "humidity", label: "Humidity", unit: "%", color: "#60a5fa" },
      { key: "pressure", label: "Pressure", unit: "hPa", color: "#a78bfa" },
    ],
  },
  {
    title: "Light & Sound", icon: "💡",
    sensors: [
      { key: "lux", label: "Light", unit: "lux", color: "#fbbf24" },
      { key: "noise_level", label: "Noise", unit: "", color: "#f472b6" },
    ],
  },
  {
    title: "Gas Levels", icon: "🧪",
    sensors: [
      { key: "gas_oxidising", label: "Oxidising", unit: "kΩ", color: "#2dd4bf" },
      { key: "gas_reducing", label: "Reducing", unit: "kΩ", color: "#4ade80" },
      { key: "gas_nh3", label: "NH₃", unit: "kΩ", color: "#fbbf24" },
    ],
  },
  {
    title: "Particulate Matter", icon: "🌫️",
    sensors: [
      { key: "pm1", label: "PM1.0", unit: "µg/m³", color: "#86efac" },
      { key: "pm25", label: "PM2.5", unit: "µg/m³", color: "#fbbf24" },
      { key: "pm10", label: "PM10", unit: "µg/m³", color: "#fb7185" },
    ],
  },
];

function getAQI(pm25) {
  if (pm25 <= 12) return { label: "Good", color: "#4ade80", bg: "rgba(74,222,128,0.08)" };
  if (pm25 <= 35) return { label: "Moderate", color: "#fbbf24", bg: "rgba(251,191,36,0.08)" };
  if (pm25 <= 55) return { label: "Unhealthy (SG)", color: "#fb923c", bg: "rgba(251,146,60,0.08)" };
  return { label: "Unhealthy", color: "#fb7185", bg: "rgba(251,113,133,0.08)" };
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#161b24", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color, display: "inline-block" }} />
          <span style={{ color: "rgba(255,255,255,0.5)" }}>{p.name}:</span>
          <span style={{ color: "#fff", fontFamily: "monospace", fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, unit, color, icon }) {
  return (
    <div style={{ background: "#0f1319", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        <span style={{ fontSize: 13 }}>{icon}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 26, fontFamily: "monospace", fontWeight: 700, color }}>{value ?? "—"}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{unit}</span>
      </div>
    </div>
  );
}

function ChartPanel({ title, icon, sensors, data }) {
  return (
    <div style={{ background: "#0f1319", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.3), transparent)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{title}</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            {sensors.map(s => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.15} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend iconType="circle" iconSize={5} wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }} />
          {sensors.map(s => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={`${s.label} (${s.unit})`} stroke={s.color} strokeWidth={1.5} fill={`url(#g-${s.key})`} dot={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Dashboard() {
  const [range, setRange] = useState(TIME_RANGES[2]);
  const data = useMemo(() => generateMockData(range.hours), [range]);
  const latest = data[data.length - 1];
  const aqi = getAQI(latest?.pm25 || 0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ background: "#0a0e14", minHeight: "100vh", color: "#e2e8f0", fontFamily: "'Segoe UI', system-ui, sans-serif", position: "relative" }}>
      {/* Grid bg */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(45,212,191,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.03) 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "32px 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 32 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>Enviro+ Air Monitor</h1>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399", animation: "pulse 2s ease-in-out infinite" }} />
                <span style={{ fontSize: 9, color: "#34d399", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Live</span>
              </span>
            </div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>
              rpi-enviro-01 · Auckland, NZ · Updated {now.toLocaleTimeString("en-NZ")}
            </p>
          </div>
          <div style={{ display: "flex", gap: 2, padding: 3, background: "#161b24", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
            {TIME_RANGES.map(r => (
              <button key={r.label} onClick={() => setRange(r)} style={{
                padding: "6px 14px", fontSize: 11, fontWeight: 500, borderRadius: 6, border: "none", cursor: "pointer", transition: "all 0.2s",
                background: range.label === r.label ? "rgba(45,212,191,0.15)" : "transparent",
                color: range.label === r.label ? "#2dd4bf" : "rgba(255,255,255,0.35)",
              }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
          {/* AQI */}
          <div style={{ gridColumn: "span 2", background: aqi.bg, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Air Quality</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 32, fontFamily: "monospace", fontWeight: 700, color: aqi.color }}>{latest?.pm25}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>PM2.5 µg/m³</span>
            </div>
            <span style={{ display: "inline-block", marginTop: 8, padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: aqi.color, background: `${aqi.color}15` }}>
              {aqi.label}
            </span>
          </div>
          <StatCard label="Temperature" value={latest?.temperature} unit="°C" color="#fb7185" icon="🌡️" />
          <StatCard label="Humidity" value={latest?.humidity} unit="%" color="#60a5fa" icon="💧" />
          <StatCard label="Pressure" value={latest?.pressure} unit="hPa" color="#a78bfa" icon="🔵" />
          <StatCard label="Light" value={latest?.lux} unit="lux" color="#fbbf24" icon="☀️" />
        </div>

        {/* Charts */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))", gap: 16 }}>
          {SENSOR_GROUPS.map(g => (
            <ChartPanel key={g.title} title={g.title} icon={g.icon} sensors={g.sensors} data={data} />
          ))}
        </div>

        <p style={{ textAlign: "center", marginTop: 40, fontSize: 10, color: "rgba(255,255,255,0.1)" }}>
          Enviro+ Monitor · Raspberry Pi 4B · PIM458 · Supabase + Vercel
        </p>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.5)} }
      `}</style>
    </div>
  );
}
