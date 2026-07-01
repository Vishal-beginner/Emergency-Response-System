import { ADJACENCY, EXITS, ZONES, zoneById } from "../data/buildingLayout.js";

// AI Planning Agent: given a risk assessment, generates multiple candidate
// emergency action plans. Each plan is a set of device actions plus an
// evacuation strategy. The Scenario Simulation stage will score these and
// pick the one that minimizes projected casualties.

function nearestExit(zoneId) {
  // Simple BFS over the adjacency graph to find the closest exit zone.
  const visited = new Set([zoneId]);
  const queue = [[zoneId, []]];
  while (queue.length) {
    const [current, path] = queue.shift();
    if (EXITS.includes(current)) return { exitZone: current, path };
    for (const next of ADJACENCY[current] || []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([next, [...path, next]]);
      }
    }
  }
  return { exitZone: null, path: [] };
}

function allZoneIds() {
  return ZONES.map((z) => z.id);
}

function buildPlan({ id, name, strategy, deviceActions, evacuationZones, avoidZones, rationale }) {
  return { id, name, strategy, deviceActions, evacuationZones, avoidZones, rationale };
}

export function generatePlans(riskAssessment) {
  const { zoneId, incidentType, severityLevel } = riskAssessment;
  const neighbors = ADJACENCY[zoneId] || [];
  const { exitZone, path } = nearestExit(zoneId);

  switch (incidentType) {
    case "fire":
      return firePlans(zoneId, neighbors, exitZone, path, severityLevel);
    case "gas_leak":
      return gasLeakPlans(zoneId, neighbors, exitZone, path);
    case "armed_intruder":
      return armedIntruderPlans(zoneId, neighbors);
    case "burglary":
      return burglaryPlans(zoneId);
    case "fall":
      return fallPlans(zoneId);
    default:
      return [];
  }
}

function firePlans(zoneId, neighbors, exitZone, path, severityLevel) {
  const otherZones = allZoneIds().filter((z) => z !== zoneId);

  const fullEvac = buildPlan({
    id: "A",
    name: "Full Building Evacuation",
    strategy: "evacuate_all",
    deviceActions: [
      { zoneId, device: "sprinkler", action: "on" },
      { zoneId, device: "alarm", action: "on" },
      { zoneId, device: "doors", action: "lock" }, // contain the fire zone itself
      { zoneId, device: "hvac", action: "shutdown" },
      ...neighbors.map((z) => ({ zoneId: z, device: "doors", action: "unlock" })),
      ...neighbors.map((z) => ({ zoneId: z, device: "alarm", action: "on" })),
      ...otherZones.map((z) => ({ zoneId: z, device: "hvac", action: "purge" })),
      ...otherZones.map((z) => ({ zoneId: z, device: "pa", action: "evacuate_announcement" })),
    ],
    evacuationZones: otherZones,
    avoidZones: [zoneId],
    rationale:
      "Evacuates the entire building via the nearest exits, isolates the fire zone " +
      "(locked doors, sprinklers, HVAC shutdown), and purges smoke from unaffected zones.",
  });

  const containedEvac = buildPlan({
    id: "B",
    name: "Contained Zone Evacuation",
    strategy: "evacuate_zone_and_neighbors",
    deviceActions: [
      { zoneId, device: "sprinkler", action: "on" },
      { zoneId, device: "alarm", action: "on" },
      { zoneId, device: "doors", action: "lock" },
      { zoneId, device: "hvac", action: "shutdown" },
      ...neighbors.map((z) => ({ zoneId: z, device: "doors", action: "unlock" })),
      ...neighbors.map((z) => ({ zoneId: z, device: "alarm", action: "on" })),
      ...neighbors.map((z) => ({ zoneId: z, device: "pa", action: "evacuate_announcement" })),
      ...neighbors.map((z) => ({ zoneId: z, device: "hvac", action: "purge" })),
    ],
    evacuationZones: neighbors,
    avoidZones: [zoneId],
    rationale:
      "Evacuates only the fire zone and its immediate neighbors, leaving distant zones " +
      "in shelter-in-place to reduce corridor congestion, while still isolating the fire.",
  });

  const shelterInPlace = buildPlan({
    id: "C",
    name: "Shelter-in-Place (fire zone only)",
    strategy: "shelter_in_place",
    deviceActions: [
      { zoneId, device: "sprinkler", action: "on" },
      { zoneId, device: "alarm", action: "on" },
      { zoneId, device: "doors", action: "lock" },
      { zoneId, device: "hvac", action: "shutdown" },
    ],
    evacuationZones: [],
    avoidZones: [zoneId],
    rationale:
      "Suppresses the fire in place without a wider evacuation. Lowest disruption, but " +
      "risky if the fire spreads beyond the detected zone.",
  });

  return severityLevel === "critical" || severityLevel === "high"
    ? [fullEvac, containedEvac, shelterInPlace]
    : [containedEvac, shelterInPlace, fullEvac];
}

function gasLeakPlans(zoneId, neighbors, exitZone, path) {
  return [
    buildPlan({
      id: "A",
      name: "Ventilate & Evacuate Zone",
      strategy: "evacuate_zone_and_neighbors",
      deviceActions: [
        { zoneId, device: "hvac", action: "max_ventilation" },
        { zoneId, device: "alarm", action: "on" },
        { zoneId, device: "doors", action: "unlock" },
        ...neighbors.map((z) => ({ zoneId: z, device: "doors", action: "unlock" })),
        ...neighbors.map((z) => ({ zoneId: z, device: "pa", action: "evacuate_announcement" })),
      ],
      evacuationZones: [zoneId, ...neighbors],
      avoidZones: [zoneId],
      rationale: "Maximizes ventilation to disperse gas, unlocks all exits, evacuates zone and neighbors.",
    }),
    buildPlan({
      id: "B",
      name: "Isolate & Ventilate (no evacuation)",
      strategy: "shelter_in_place",
      deviceActions: [
        { zoneId, device: "hvac", action: "max_ventilation" },
        { zoneId, device: "doors", action: "lock" },
      ],
      evacuationZones: [],
      avoidZones: [zoneId],
      rationale: "Isolates the zone and ventilates without a general evacuation. Only safe at low severity.",
    }),
  ];
}

function armedIntruderPlans(zoneId, neighbors) {
  const otherZones = allZoneIds().filter((z) => z !== zoneId && !neighbors.includes(z));
  return [
    buildPlan({
      id: "A",
      name: "Lockdown Corridors, Silent Alert",
      strategy: "lockdown",
      deviceActions: [
        { zoneId, device: "doors", action: "lock" },
        { zoneId, device: "lighting", action: "off" },
        ...neighbors.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
        ...otherZones.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
        ...otherZones.map((z) => ({ zoneId: z, device: "pa", action: "silent_lockdown_alert" })),
      ],
      evacuationZones: [],
      avoidZones: [zoneId, ...neighbors],
      rationale:
        "Locks down the threat zone and all corridors, silences non-essential zones to avoid " +
        "revealing occupant locations, and routes occupants away from the danger zone. No audible alarm " +
        "to avoid provoking the intruder.",
    }),
    buildPlan({
      id: "B",
      name: "Full Lockdown, Audible Alarm",
      strategy: "lockdown",
      deviceActions: [
        { zoneId, device: "doors", action: "lock" },
        { zoneId, device: "alarm", action: "on" },
        ...neighbors.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
        ...otherZones.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
      ],
      evacuationZones: [],
      avoidZones: [zoneId, ...neighbors],
      rationale: "Locks down the whole building with an audible alarm. Simpler but may alert the intruder to occupant positions.",
    }),
  ];
}

function burglaryPlans(zoneId) {
  return [
    buildPlan({
      id: "A",
      name: "Silent Lockdown & Evidence Capture",
      strategy: "silent_security_response",
      deviceActions: [
        { zoneId, device: "doors", action: "lock" },
        { zoneId, device: "lighting", action: "on" },
      ],
      evacuationZones: [],
      avoidZones: [zoneId],
      rationale: "Locks the affected zone, raises lighting for clearer CCTV evidence, and silently dispatches security -- no alarm to avoid tipping off the intruder before security arrives.",
    }),
    buildPlan({
      id: "B",
      name: "Audible Deterrent Alarm",
      strategy: "deterrent",
      deviceActions: [
        { zoneId, device: "doors", action: "lock" },
        { zoneId, device: "alarm", action: "on" },
        { zoneId, device: "lighting", action: "on" },
      ],
      evacuationZones: [],
      avoidZones: [zoneId],
      rationale: "Locks the zone and sounds an audible alarm to deter the intruder immediately, at the cost of losing the element of surprise for responding security.",
    }),
  ];
}

function fallPlans(zoneId) {
  return [
    buildPlan({
      id: "A",
      name: "Dispatch Nearby Responder",
      strategy: "medical_response",
      deviceActions: [
        { zoneId, device: "doors", action: "unlock" },
        { zoneId, device: "display", action: "medical_alert" },
      ],
      evacuationZones: [],
      avoidZones: [],
      rationale: "Unlocks access to the zone for the nearest first-aid-trained staff member and displays a medical alert; escalates to EMS automatically if there is no response.",
    }),
  ];
}
