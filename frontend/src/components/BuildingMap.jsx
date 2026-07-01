import { SEVERITY_COLORS, zoneHazardLevel } from "../utils";

const STATUS_COLORS = {
  normal: "#343a40",
  evacuating: "#1971c2",
  ...SEVERITY_COLORS,
};

export default function BuildingMap({ zones, incidents, selectedZone, onSelectZone }) {
  const floors = [...new Set(zones.map((z) => z.floor))].sort();

  return (
    <div className="panel">
      <h2>Building Map</h2>
      {floors.map((floor) => (
        <div key={floor} className="floor-row">
          <div className="floor-label">Floor {floor}</div>
          <div className="zone-grid">
            {zones
              .filter((z) => z.floor === floor)
              .map((zone) => {
                const status = zoneHazardLevel(zone.id, incidents);
                const color = STATUS_COLORS[status] || STATUS_COLORS.normal;
                return (
                  <button
                    key={zone.id}
                    className={`zone-tile ${selectedZone === zone.id ? "zone-tile-selected" : ""}`}
                    style={{ borderColor: color, background: `${color}22` }}
                    onClick={() => onSelectZone(zone.id)}
                    title={zone.name}
                  >
                    <div className="zone-tile-name">{zone.name}</div>
                    {zone.isExit && <div className="zone-tile-exit">EXIT: {zone.exitName}</div>}
                    <div className="zone-tile-status" style={{ color }}>
                      {status.toUpperCase()}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
