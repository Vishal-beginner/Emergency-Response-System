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
  const { zoneId, incidentType, severityLevel, affectedZones, predictedDestination, escalatedToEMS } = riskAssessment;
  const hazardZones = affectedZones && affectedZones.length ? affectedZones : [zoneId];
  const neighborSet = new Set();
  for (const hz of hazardZones) {
    for (const n of ADJACENCY[hz] || []) if (!hazardZones.includes(n)) neighborSet.add(n);
  }
  const neighbors = [...neighborSet];

  switch (incidentType) {
    case "fire":
      return firePlans(hazardZones, neighbors, severityLevel);
    case "gas_leak":
      return gasLeakPlans(hazardZones, neighbors);
    case "armed_intruder":
      return armedIntruderPlans(zoneId, neighbors, predictedDestination);
    case "burglary":
      return burglaryPlans(zoneId, predictedDestination);
    case "fall":
      return fallPlans(zoneId, escalatedToEMS);
    default:
      return [];
  }
}

function firePlans(hazardZones, neighbors, severityLevel) {
  const otherZones = allZoneIds().filter((z) => !hazardZones.includes(z));
  const hazardName = hazardZones.map((z) => zoneById(z).name).join(", ");

  const fullEvac = buildPlan({
    id: "A",
    name: "Full Building Evacuation",
    strategy: "evacuate_all",
    deviceActions: [
      ...hazardZones.map((z) => ({ zoneId: z, device: "sprinkler", action: "on" })),
      ...hazardZones.map((z) => ({ zoneId: z, device: "alarm", action: "on" })),
      ...hazardZones.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
      ...hazardZones.map((z) => ({ zoneId: z, device: "hvac", action: "shutdown" })),
      ...neighbors.map((z) => ({ zoneId: z, device: "doors", action: "unlock" })),
      ...neighbors.map((z) => ({ zoneId: z, device: "alarm", action: "on" })),
      ...otherZones.map((z) => ({ zoneId: z, device: "hvac", action: "purge" })),
      ...otherZones.map((z) => ({ zoneId: z, device: "pa", action: "evacuate_announcement" })),
    ],
    evacuationZones: otherZones,
    avoidZones: hazardZones,
    rationale:
      `Evacuates the entire building via the nearest exits, isolates the fire zone(s) (${hazardName}) ` +
      "with locked doors/sprinklers/HVAC shutdown, and purges smoke from unaffected zones.",
  });

  const containedEvac = buildPlan({
    id: "B",
    name: "Contained Zone Evacuation",
    strategy: "evacuate_zone_and_neighbors",
    deviceActions: [
      ...hazardZones.map((z) => ({ zoneId: z, device: "sprinkler", action: "on" })),
      ...hazardZones.map((z) => ({ zoneId: z, device: "alarm", action: "on" })),
      ...hazardZones.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
      ...hazardZones.map((z) => ({ zoneId: z, device: "hvac", action: "shutdown" })),
      ...neighbors.map((z) => ({ zoneId: z, device: "doors", action: "unlock" })),
      ...neighbors.map((z) => ({ zoneId: z, device: "alarm", action: "on" })),
      ...neighbors.map((z) => ({ zoneId: z, device: "pa", action: "evacuate_announcement" })),
      ...neighbors.map((z) => ({ zoneId: z, device: "hvac", action: "purge" })),
    ],
    evacuationZones: neighbors,
    avoidZones: hazardZones,
    rationale:
      `Evacuates only the fire zone(s) (${hazardName}) and their immediate neighbors, leaving distant zones ` +
      "in shelter-in-place to reduce corridor congestion, while still isolating the fire.",
  });

  const shelterInPlace = buildPlan({
    id: "C",
    name: "Shelter-in-Place (fire zone only)",
    strategy: "shelter_in_place",
    deviceActions: [
      ...hazardZones.map((z) => ({ zoneId: z, device: "sprinkler", action: "on" })),
      ...hazardZones.map((z) => ({ zoneId: z, device: "alarm", action: "on" })),
      ...hazardZones.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
      ...hazardZones.map((z) => ({ zoneId: z, device: "hvac", action: "shutdown" })),
    ],
    evacuationZones: [],
    avoidZones: hazardZones,
    rationale:
      "Suppresses the fire in place without a wider evacuation. Lowest disruption, but " +
      "risky if the fire spreads beyond the detected zone(s).",
  });

  return severityLevel === "critical" || severityLevel === "high"
    ? [fullEvac, containedEvac, shelterInPlace]
    : [containedEvac, shelterInPlace, fullEvac];
}

function gasLeakPlans(hazardZones, neighbors) {
  return [
    buildPlan({
      id: "A",
      name: "Ventilate & Evacuate Zone",
      strategy: "evacuate_zone_and_neighbors",
      deviceActions: [
        ...hazardZones.map((z) => ({ zoneId: z, device: "hvac", action: "max_ventilation" })),
        ...hazardZones.map((z) => ({ zoneId: z, device: "alarm", action: "on" })),
        ...hazardZones.map((z) => ({ zoneId: z, device: "doors", action: "unlock" })),
        ...neighbors.map((z) => ({ zoneId: z, device: "doors", action: "unlock" })),
        ...neighbors.map((z) => ({ zoneId: z, device: "pa", action: "evacuate_announcement" })),
      ],
      evacuationZones: [...hazardZones, ...neighbors],
      avoidZones: hazardZones,
      rationale: "Maximizes ventilation to disperse gas, unlocks all exits, evacuates zone(s) and neighbors.",
    }),
    buildPlan({
      id: "B",
      name: "Isolate & Ventilate (no evacuation)",
      strategy: "shelter_in_place",
      deviceActions: [
        ...hazardZones.map((z) => ({ zoneId: z, device: "hvac", action: "max_ventilation" })),
        ...hazardZones.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
      ],
      evacuationZones: [],
      avoidZones: hazardZones,
      rationale: "Isolates the zone(s) and ventilates without a general evacuation. Only safe at low severity.",
    }),
  ];
}

function armedIntruderPlans(zoneId, neighbors, predictedDestination) {
  const otherZones = allZoneIds().filter((z) => z !== zoneId && !neighbors.includes(z));
  const preemptive = predictedDestination && predictedDestination !== zoneId ? [predictedDestination] : [];
  const preemptiveNote = preemptive.length
    ? ` Predicted trajectory targets ${zoneById(preemptive[0]).name}, which is pre-emptively locked; the rest ` +
      "of the building stays passable as safe corridors and is re-locked each cycle as the prediction updates."
    : "";

  return [
    buildPlan({
      id: "A",
      name: "Predictive Corridor Lockdown, Silent Alert",
      strategy: "lockdown",
      // Targeted, not blanket: only the threat zone and its currently
      // predicted destination are locked, so the rest of the building
      // remains open as a safe corridor -- and gets re-targeted every
      // closed-loop cycle as the prediction is recomputed from live
      // occupancy data, rather than sealing the whole building at once.
      deviceActions: [
        { zoneId, device: "doors", action: "lock" },
        { zoneId, device: "lighting", action: "off" },
        ...preemptive.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
        ...otherZones.map((z) => ({ zoneId: z, device: "pa", action: "silent_lockdown_alert" })),
      ],
      evacuationZones: [],
      avoidZones: [zoneId, ...preemptive],
      rationale:
        "Locks down only the threat zone and its predicted destination, leaving other corridors passable " +
        "for evacuation. No audible alarm to avoid provoking the intruder." + preemptiveNote,
    }),
    buildPlan({
      id: "B",
      name: "Full Building Lockdown, Audible Alarm",
      strategy: "lockdown",
      deviceActions: [
        { zoneId, device: "doors", action: "lock" },
        { zoneId, device: "alarm", action: "on" },
        ...neighbors.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
        ...otherZones.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
      ],
      evacuationZones: [],
      avoidZones: [zoneId, ...neighbors, ...preemptive],
      rationale: `Locks down the whole building immediately with an audible alarm -- maximum containment, at the cost of alerting the intruder to occupant positions and blocking all evacuation routes.${preemptiveNote}`,
    }),
  ];
}

function burglaryPlans(zoneId, predictedDestination) {
  const preemptive = predictedDestination && predictedDestination !== zoneId ? [predictedDestination] : [];
  const preemptiveNote = preemptive.length
    ? ` Predicted destination is ${zoneById(preemptive[0]).name} -- access to it is locked down pre-emptively.`
    : "";
  return [
    buildPlan({
      id: "A",
      name: "Silent Lockdown & Evidence Capture",
      strategy: "silent_security_response",
      deviceActions: [
        { zoneId, device: "doors", action: "lock" },
        { zoneId, device: "lighting", action: "on" },
        ...preemptive.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
      ],
      evacuationZones: [],
      avoidZones: [zoneId, ...preemptive],
      rationale: `Locks the affected zone, raises lighting for clearer CCTV evidence, and silently dispatches security -- no alarm to avoid tipping off the intruder before security arrives.${preemptiveNote}`,
    }),
    buildPlan({
      id: "B",
      name: "Audible Deterrent Alarm",
      strategy: "deterrent",
      deviceActions: [
        { zoneId, device: "doors", action: "lock" },
        { zoneId, device: "alarm", action: "on" },
        { zoneId, device: "lighting", action: "on" },
        ...preemptive.map((z) => ({ zoneId: z, device: "doors", action: "lock" })),
      ],
      evacuationZones: [],
      avoidZones: [zoneId, ...preemptive],
      rationale: `Locks the zone and sounds an audible alarm to deter the intruder immediately, at the cost of losing the element of surprise for responding security.${preemptiveNote}`,
    }),
  ];
}

function fallPlans(zoneId, escalatedToEMS) {
  const plans = [
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

  if (escalatedToEMS) {
    plans.unshift(
      buildPlan({
        id: "E",
        name: "Auto-Escalate to Emergency Medical Services",
        strategy: "ems_escalation",
        deviceActions: [
          { zoneId, device: "doors", action: "unlock" },
          { zoneId, device: "display", action: "medical_alert" },
          { zoneId, device: "pa", action: "evacuate_announcement" },
        ],
        evacuationZones: [],
        avoidZones: [],
        rationale:
          "Continuous monitoring found no recovery signal within the escalation window -- automatically " +
          "dispatches EMS, unlocks access, and clears a path for responders rather than waiting on staff.",
      })
    );
  }

  return plans;
}
