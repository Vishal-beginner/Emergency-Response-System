import { useEffect, useState, useCallback } from "react";
import { connectSocket, getLayout, getScenarios, getState, triggerScenario, approvePlan, rejectIncident, resolveIncident } from "./api";
import BuildingMap from "./components/BuildingMap";
import SensorPanel from "./components/SensorPanel";
import ScenarioTriggers from "./components/ScenarioTriggers";
import IncidentFeed from "./components/IncidentFeed";
import DeviceBoard from "./components/DeviceBoard";
import NotificationsPanel from "./components/NotificationsPanel";
import AuditTimeline from "./components/AuditTimeline";

export default function App() {
  const [zones, setZones] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [state, setState] = useState({ sensors: {}, devices: {}, incidents: [], notifications: [], tick: 0 });
  const [selectedZone, setSelectedZone] = useState(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    getLayout().then((d) => {
      setZones(d.zones);
      setSelectedZone(d.zones[0]?.id ?? null);
    });
    getScenarios().then((d) => setScenarios(d.scenarios));
    getState().then(setState);

    const socket = connectSocket();
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("state", (s) => {
      setState(s);
      setRefreshToken((t) => t + 1);
    });
    return () => socket.disconnect();
  }, []);

  const withBusy = useCallback((fn) => async (...args) => {
    setBusy(true);
    setError(null);
    try {
      await fn(...args);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleTrigger = withBusy((scenario, zoneId) => triggerScenario(scenario, zoneId));
  const handleApprove = withBusy((incidentId, planId) => approvePlan(incidentId, planId, "demo-operator"));
  const handleReject = withBusy((incidentId, reason) => rejectIncident(incidentId, reason, "demo-operator"));
  const handleResolve = withBusy((incidentId, summary) => resolveIncident(incidentId, summary));

  return (
    <div className="app">
      <header className="app-header">
        <h1>Emergency Response System</h1>
        <span className={`conn-badge ${connected ? "conn-ok" : "conn-bad"}`}>
          {connected ? "● Live" : "○ Disconnected"}
        </span>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <ScenarioTriggers zones={zones} scenarios={scenarios} onTrigger={handleTrigger} busy={busy} />

      <div className="grid-layout">
        <div className="col">
          <BuildingMap
            zones={zones}
            incidents={state.incidents}
            selectedZone={selectedZone}
            onSelectZone={setSelectedZone}
            tick={state.tick}
          />
          <SensorPanel zones={zones} sensors={state.sensors} selectedZone={selectedZone} />
        </div>

        <div className="col col-wide">
          <IncidentFeed
            incidents={state.incidents}
            zones={zones}
            onApprove={handleApprove}
            onReject={handleReject}
            onResolve={handleResolve}
            busy={busy}
          />
        </div>

        <div className="col">
          <DeviceBoard zones={zones} devices={state.devices} />
          <NotificationsPanel notifications={state.notifications} />
        </div>
      </div>

      <AuditTimeline refreshToken={refreshToken} />
    </div>
  );
}
