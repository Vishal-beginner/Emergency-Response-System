export default function EvacuationGuidance({ guidance, zones }) {
  const zoneName = (id) => zones.find((z) => z.id === id)?.name || id;
  const entries = Object.entries(guidance || {});
  if (entries.length === 0) return null;

  return (
    <div className="guidance-box">
      <h4>Occupant Guidance</h4>
      <ul>
        {entries.map(([zoneId, info]) => (
          <li key={zoneId}>
            <strong>{zoneName(zoneId)}:</strong> {info.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
