export default function DeviceBoard({ zones, devices }) {
  return (
    <div className="panel">
      <h2>Device Orchestration</h2>
      <table className="data-table device-table">
        <thead>
          <tr>
            <th>Zone</th>
            <th>Doors</th>
            <th>Alarm</th>
            <th>Sprinkler</th>
            <th>Lighting</th>
            <th>HVAC</th>
            <th>PA</th>
            <th>Display</th>
          </tr>
        </thead>
        <tbody>
          {zones.map((zone) => {
            const d = devices[zone.id];
            if (!d) return null;
            return (
              <tr key={zone.id}>
                <td>{zone.name}</td>
                {["doors", "alarm", "sprinkler", "lighting", "hvac", "pa", "display"].map((key) => (
                  <td key={key} className={d[key] !== "unlocked" && d[key] !== "normal" && d[key] !== "off" && d[key] !== "idle" ? "cell-alert" : ""}>
                    {d[key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
