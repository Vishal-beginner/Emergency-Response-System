export default function SensorPanel({ zones, sensors, selectedZone }) {
  const zone = zones.find((z) => z.id === selectedZone);
  const s = sensors[selectedZone];
  if (!zone || !s) {
    return (
      <div className="panel">
        <h2>Sensors</h2>
        <p className="muted">Select a zone to view live sensor readings.</p>
      </div>
    );
  }

  const rows = [
    ["Smoke", `${s.smoke}/100`, s.smoke >= 40],
    ["Heat", `${s.heat}°C`, s.heat >= 45],
    ["Gas", `${s.gas}/100`, s.gas >= 40],
    ["Motion", s.motion ? "Detected" : "None", s.motion],
    ["Door", s.doorForced ? "Forced" : "Secure", s.doorForced],
    ["Occupancy", s.occupancy, false],
    ["UWB stationary", `${s.uwbStationarySec}s`, s.uwbStationarySec >= 90],
    ["Weapon (vision)", s.weaponDetected ? "Detected" : "None", s.weaponDetected],
    ["Panic button", s.panicButton ? "Pressed" : "Idle", s.panicButton],
  ];

  return (
    <div className="panel">
      <h2>Sensors — {zone.name}</h2>
      <table className="data-table">
        <tbody>
          {rows.map(([label, value, alert]) => (
            <tr key={label} className={alert ? "row-alert" : ""}>
              <td>{label}</td>
              <td>{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted small">Updated {new Date(s.updatedAt).toLocaleTimeString()}</div>
    </div>
  );
}
