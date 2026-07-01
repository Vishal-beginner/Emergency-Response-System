import { ADJACENCY, zoneById } from "../data/buildingLayout.js";

// Scenario Simulation stage: estimate the outcome of each candidate plan and
// rank them, selecting the one that minimizes projected casualty exposure
// (per the Casualty Protection Strategy: "life safety over asset protection").

const HAZARD_EXPOSURE_BY_STRATEGY = {
  evacuate_all: 0.15,
  evacuate_zone_and_neighbors: 0.25,
  shelter_in_place: 0.55,
  lockdown: 0.2,
  silent_security_response: 0.1,
  deterrent: 0.15,
  medical_response: 0.05,
};

const EVAC_TIME_SEC_BY_STRATEGY = {
  evacuate_all: 180,
  evacuate_zone_and_neighbors: 90,
  shelter_in_place: 20,
  lockdown: 40,
  silent_security_response: 30,
  deterrent: 30,
  medical_response: 60,
};

export function simulatePlans(plans, riskAssessment, sensors) {
  const { zoneId, severityScore } = riskAssessment;

  const scored = plans.map((plan) => {
    const exposureAtHazard = sensors[zoneId]?.occupancy ?? 0;
    const neighborOccupancy = (ADJACENCY[zoneId] || []).reduce(
      (sum, z) => sum + (sensors[z]?.occupancy ?? 0),
      0
    );

    const baseExposure = HAZARD_EXPOSURE_BY_STRATEGY[plan.strategy] ?? 0.4;
    const severityAdjustedExposure = Math.min(1, baseExposure * (0.6 + severityScore * 0.6));

    const projectedExposedOccupants = Math.round(
      exposureAtHazard * severityAdjustedExposure +
        (plan.evacuationZones.length === 0 ? neighborOccupancy * severityAdjustedExposure * 0.5 : 0)
    );

    const evacTimeSec = EVAC_TIME_SEC_BY_STRATEGY[plan.strategy] ?? 60;

    // Composite score: lower is better/safer. Weighs casualty exposure far
    // above evacuation time, matching the "life safety over asset
    // protection" casualty-protection principle.
    const riskScore = projectedExposedOccupants * 10 + evacTimeSec * 0.05;

    return {
      ...plan,
      simulation: {
        projectedExposedOccupants,
        evacTimeSec,
        riskScore: Number(riskScore.toFixed(2)),
      },
    };
  });

  scored.sort((a, b) => a.simulation.riskScore - b.simulation.riskScore);
  return scored;
}
