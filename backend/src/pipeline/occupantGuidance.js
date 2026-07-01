import { ADJACENCY, EXITS, zoneById } from "../data/buildingLayout.js";

// Occupant Guidance: computes dynamic, hazard-aware evacuation instructions
// per zone for display boards / phone push (simulated here as messages
// pushed to each zone's "display" channel).

function routeToNearestExit(zoneId, avoidZones) {
  if (EXITS.includes(zoneId) && !avoidZones.includes(zoneId)) return { exit: zoneId, path: [zoneId] };

  const visited = new Set([zoneId]);
  const queue = [[zoneId, [zoneId]]];
  while (queue.length) {
    const [current, path] = queue.shift();
    for (const next of ADJACENCY[current] || []) {
      if (visited.has(next) || avoidZones.includes(next)) continue;
      const nextPath = [...path, next];
      if (EXITS.includes(next)) return { exit: next, path: nextPath };
      visited.add(next);
      queue.push([next, nextPath]);
    }
  }
  return { exit: null, path: [] };
}

export function generateGuidance(plan, riskAssessment) {
  const instructions = {};

  for (const zoneId of plan.evacuationZones) {
    const { exit, path } = routeToNearestExit(zoneId, plan.avoidZones);
    if (exit) {
      const exitZone = zoneById(exit);
      instructions[zoneId] = {
        message: `EVACUATE NOW via ${exitZone.exitName ?? exitZone.name}. Route: ${path
          .map((z) => zoneById(z).name)
          .join(" -> ")}. Avoid ${riskAssessment.label} hazard zone.`,
        path,
        exit,
      };
    } else {
      instructions[zoneId] = {
        message: `SHELTER IN PLACE. No safe route to an exit avoiding the hazard zone -- await responder guidance.`,
        path: [],
        exit: null,
      };
    }
  }

  for (const zoneId of plan.avoidZones) {
    if (!instructions[zoneId]) {
      instructions[zoneId] = {
        message: `HAZARD ZONE. Do not enter. Follow staff/responder instructions.`,
        path: [],
        exit: null,
      };
    }
  }

  return instructions;
}
