import { ZONES } from "../data/buildingLayout.js";
import { fuseZone } from "./dataFusion.js";
import { detectAnomalies } from "./threatDetection.js";

// World Model: the "Understand" stage of the closed loop. Composes a single
// live view of hazards, occupants and devices per zone, independent of any
// one incident, so both the pipeline and the dashboard have one source of
// truth for "what does the system currently believe is true about the
// building." This is recomputed every tick from the latest fused sensor data.

export function buildWorldModel(sensors, devices, incidents) {
  const activeByZone = {};
  for (const inc of incidents) {
    if (inc.status === "resolved" || inc.status === "rejected") continue;
    for (const z of inc.affectedZones ?? [inc.zoneId]) {
      activeByZone[z] = inc.id;
    }
  }

  const anomalyScores = Object.fromEntries(
    detectAnomalies(
      Object.fromEntries(ZONES.map((z) => [z.id, fuseZone(z.id, sensors)]))
    ).map((a) => [a.zoneId, a.score])
  );

  const zones = {};
  for (const zone of ZONES) {
    const score = anomalyScores[zone.id] ?? 0;
    zones[zone.id] = {
      zoneId: zone.id,
      name: zone.name,
      hazardScore: Number(score.toFixed(2)),
      hazardLevel: score >= 0.6 ? "critical" : score >= 0.35 ? "elevated" : "normal",
      occupancy: sensors[zone.id]?.occupancy ?? 0,
      devices: devices[zone.id],
      activeIncidentId: activeByZone[zone.id] ?? null,
    };
  }

  return { zones, generatedAt: new Date().toISOString() };
}
