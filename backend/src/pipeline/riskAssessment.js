import { ADJACENCY, zoneById } from "../data/buildingLayout.js";

// Risk Assessment stage: combines classification confidence with occupancy
// exposure and cascading-spread potential (via the zone adjacency graph) to
// produce a severity score and human-readable rationale.

const SEVERITY_WEIGHTS = {
  fire: 1.0,
  gas_leak: 0.95,
  armed_intruder: 1.0,
  burglary: 0.5,
  fall: 0.6,
};

export function assessRisk(classification, sensors) {
  const { zoneId, primary } = classification;
  const zone = zoneById(zoneId);
  const neighbors = ADJACENCY[zoneId] || [];
  const exposedOccupants =
    (sensors[zoneId]?.occupancy ?? 0) +
    neighbors.reduce((sum, n) => sum + (sensors[n]?.occupancy ?? 0), 0);

  const weight = SEVERITY_WEIGHTS[primary.type] ?? 0.5;
  const occupancyFactor = Math.min(1, exposedOccupants / 40);
  const severityScore = Math.min(1, weight * 0.65 + occupancyFactor * 0.35);

  let severityLevel = "low";
  if (severityScore >= 0.8) severityLevel = "critical";
  else if (severityScore >= 0.6) severityLevel = "high";
  else if (severityScore >= 0.35) severityLevel = "medium";

  const rationale =
    `${primary.label} detected in ${zone.name} with ${(primary.confidence * 100).toFixed(0)}% confidence. ` +
    `${exposedOccupants} occupant(s) exposed across the zone and its ${neighbors.length} neighboring zone(s), ` +
    `yielding ${severityLevel} severity (score ${severityScore.toFixed(2)}).`;

  return {
    zoneId,
    incidentType: primary.type,
    label: primary.label,
    confidence: primary.confidence,
    severityScore,
    severityLevel,
    exposedOccupants,
    neighborZones: neighbors,
    rationale,
  };
}
