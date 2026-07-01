import { ADJACENCY, zoneById } from "../data/buildingLayout.js";

// Risk Assessment stage: combines classification confidence with occupancy
// exposure and cascading-spread potential (via the zone adjacency graph) to
// produce a severity score and human-readable rationale. Recomputed every
// closed-loop tick against `affectedZones` -- the live hazard footprint --
// so severity tracks fire spread/gas dispersion/threat movement as it happens.

const SEVERITY_WEIGHTS = {
  fire: 1.0,
  gas_leak: 0.95,
  armed_intruder: 1.0,
  burglary: 0.5,
  fall: 0.6,
};

export function assessRisk(classification, sensors, affectedZones) {
  const { zoneId, primary } = classification;
  const zone = zoneById(zoneId);
  const hazardZones = affectedZones && affectedZones.length ? affectedZones : [zoneId];

  const neighborSet = new Set();
  for (const hz of hazardZones) {
    for (const n of ADJACENCY[hz] || []) {
      if (!hazardZones.includes(n)) neighborSet.add(n);
    }
  }
  const neighbors = [...neighborSet];

  const exposedOccupants =
    hazardZones.reduce((sum, z) => sum + (sensors[z]?.occupancy ?? 0), 0) +
    neighbors.reduce((sum, n) => sum + (sensors[n]?.occupancy ?? 0), 0);

  const weight = SEVERITY_WEIGHTS[primary.type] ?? 0.5;
  const occupancyFactor = Math.min(1, exposedOccupants / 40);
  const spreadFactor = Math.min(1, (hazardZones.length - 1) * 0.15);
  const severityScore = Math.min(1, weight * 0.6 + occupancyFactor * 0.3 + spreadFactor * 0.1);

  let severityLevel = "low";
  if (severityScore >= 0.8) severityLevel = "critical";
  else if (severityScore >= 0.6) severityLevel = "high";
  else if (severityScore >= 0.35) severityLevel = "medium";

  const spreadNote =
    hazardZones.length > 1
      ? ` Hazard has spread to ${hazardZones.length} zone(s) (${hazardZones
          .map((z) => zoneById(z).name)
          .join(", ")}).`
      : "";

  const rationale =
    `${primary.label} detected in ${zone.name} with ${(primary.confidence * 100).toFixed(0)}% confidence. ` +
    `${exposedOccupants} occupant(s) exposed across the hazard zone(s) and ${neighbors.length} neighboring zone(s), ` +
    `yielding ${severityLevel} severity (score ${severityScore.toFixed(2)}).${spreadNote}`;

  return {
    zoneId,
    incidentType: primary.type,
    label: primary.label,
    confidence: primary.confidence,
    severityScore,
    severityLevel,
    exposedOccupants,
    affectedZones: hazardZones,
    neighborZones: neighbors,
    rationale,
  };
}
