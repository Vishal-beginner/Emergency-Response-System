import { useState } from "react";

const SCENARIO_LABELS = {
  fire: "🔥 Fire",
  gas_leak: "☁️ Gas Leak",
  burglary: "🚪 Burglary",
  armed_intruder: "🔫 Armed Intruder",
  fall: "🧍 Fall Detected",
  panic_button: "🆘 Panic Button",
  recovery: "✅ Recovery Signal (fall)",
};

export default function ScenarioTriggers({ zones, scenarios, onTrigger, busy }) {
  const [scenario, setScenario] = useState(scenarios[0] || "fire");
  const [zoneId, setZoneId] = useState(zones[0]?.id || "");

  return (
    <div className="panel">
      <h2>Simulate Sensor Event</h2>
      <p className="muted small">
        No physical sensors are attached in this prototype -- use this panel to inject a simulated
        sensor event and watch the full detection → planning → orchestration pipeline run live.
      </p>
      <div className="trigger-row">
        <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
          {scenarios.map((s) => (
            <option key={s} value={s}>
              {SCENARIO_LABELS[s] || s}
            </option>
          ))}
        </select>
        <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" disabled={busy || !zoneId} onClick={() => onTrigger(scenario, zoneId)}>
          Trigger
        </button>
      </div>
    </div>
  );
}
