import { ADJACENCY, zoneById, ZONES } from "../data/buildingLayout.js";
import { sensorState, applyPatch } from "./sensorSimulator.js";
import { deviceState } from "./deviceOrchestration.js";

// Hazard Dynamics: advances the simulated physical world by one tick for
// every incident type that the requirements call out as needing continuous,
// real-time adaptive tracking (fire spread/smoke propagation, a moving
// burglar/intruder whose destination is predicted, and a fall victim whose
// condition is continuously monitored). This is what makes "Observe" produce
// genuinely new information every cycle instead of a static snapshot.

const FIRE_GROWTH = { smoke: 9, heat: 5 };
const FIRE_DECAY = { smoke: 8, heat: 5 };
const FIRE_SPREAD_SOURCE_THRESHOLD = 55; // smoke level a zone must reach before it can ignite neighbors
const FIRE_SPREAD_INCREMENT = 12;
const FIRE_CONTAINED_EXIT_THRESHOLD = 20; // below this a zone is dropped from affectedZones
const FIRE_SUPPRESSION_DELAY_TICKS = 3; // ticks of continued growth after sprinklers activate

const GAS_DECAY_VENTILATED = 12;
const GAS_DECAY_PASSIVE = 3;
const GAS_SPREAD_SOURCE_THRESHOLD = 55;
const GAS_SPREAD_INCREMENT = 8;
const GAS_CONTAINED_EXIT_THRESHOLD = 15;
const GAS_VENTILATION_DELAY_TICKS = 1;

const FALL_WORSEN_STEP_SEC = 25;
const FALL_EMS_ESCALATION_THRESHOLD_SEC = 240;

function clamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Advance a fire incident: grows/spreads smoke+heat through the adjacency
 * graph while the origin's sprinkler is off, and recedes once suppression is
 * active. `incident.affectedZones` is the live set of hazardous zones that
 * feeds risk assessment, planning (evacuation/avoid zones) and guidance --
 * so as the fire spreads or is contained, the plan area grows/shrinks with it.
 */
export function advanceFire(incident) {
  const affected = new Set(incident.affectedZones ?? [incident.zoneId]);
  incident.fireTicks = (incident.fireTicks ?? 0) + 1;
  // Sprinklers take a moment to knock down a fire that's already spreading --
  // suppression only takes effect after a short ramp-up, so the fire is still
  // observed growing/spreading for a beat even on an auto-approved response.
  const sprinklerOn = deviceState[incident.zoneId]?.sprinkler === "on";
  const contained = sprinklerOn && incident.fireTicks > FIRE_SUPPRESSION_DELAY_TICKS;

  for (const zoneId of [...affected]) {
    const s = sensorState[zoneId];
    if (!s) continue;
    if (contained) {
      applyPatch(zoneId, {
        smoke: clamp(s.smoke - FIRE_DECAY.smoke),
        heat: clamp(s.heat - FIRE_DECAY.heat, 20, 200),
      });
    } else {
      applyPatch(zoneId, {
        smoke: clamp(s.smoke + FIRE_GROWTH.smoke),
        heat: clamp(s.heat + FIRE_GROWTH.heat, 20, 200),
      });
    }
  }

  if (!contained) {
    for (const zoneId of [...affected]) {
      if (sensorState[zoneId].smoke < FIRE_SPREAD_SOURCE_THRESHOLD) continue;
      for (const neighbor of ADJACENCY[zoneId] || []) {
        if (affected.has(neighbor)) continue;
        if (deviceState[neighbor]?.doors === "locked") continue; // sealed off, spread blocked
        const n = sensorState[neighbor];
        applyPatch(neighbor, { smoke: clamp(n.smoke + FIRE_SPREAD_INCREMENT) });
        if (sensorState[neighbor].smoke >= 30) affected.add(neighbor);
      }
    }
  }

  for (const zoneId of [...affected]) {
    if (sensorState[zoneId].smoke < FIRE_CONTAINED_EXIT_THRESHOLD && zoneId !== incident.zoneId) {
      affected.delete(zoneId);
    }
  }

  incident.affectedZones = [...affected];
  return incident.affectedZones;
}

export function advanceGasLeak(incident) {
  const affected = new Set(incident.affectedZones ?? [incident.zoneId]);
  incident.gasTicks = (incident.gasTicks ?? 0) + 1;
  const ventilatingDevice = deviceState[incident.zoneId]?.hvac === "max_ventilation";
  const ventilating = ventilatingDevice && incident.gasTicks > GAS_VENTILATION_DELAY_TICKS;

  for (const zoneId of [...affected]) {
    const s = sensorState[zoneId];
    if (!s) continue;
    const decay = ventilating ? GAS_DECAY_VENTILATED : GAS_DECAY_PASSIVE;
    applyPatch(zoneId, { gas: clamp(s.gas - decay) });
  }

  if (!ventilating) {
    for (const zoneId of [...affected]) {
      if (sensorState[zoneId].gas < GAS_SPREAD_SOURCE_THRESHOLD) continue;
      for (const neighbor of ADJACENCY[zoneId] || []) {
        if (affected.has(neighbor)) continue;
        const n = sensorState[neighbor];
        applyPatch(neighbor, { gas: clamp(n.gas + GAS_SPREAD_INCREMENT) });
        if (sensorState[neighbor].gas >= 25) affected.add(neighbor);
      }
    }
  }

  for (const zoneId of [...affected]) {
    if (sensorState[zoneId].gas < GAS_CONTAINED_EXIT_THRESHOLD && zoneId !== incident.zoneId) {
      affected.delete(zoneId);
    }
  }

  incident.affectedZones = [...affected];
  return incident.affectedZones;
}

/**
 * Advance a moving threat (burglar or armed intruder): predicts a
 * destination, then takes one step per tick along the shortest path toward
 * it -- unless the next zone is locked down, in which case the threat is
 * physically contained by the device orchestration that already ran. This is
 * what "dynamically controls access" actually means: locking doors changes
 * the simulated intruder's real trajectory, not just a displayed message.
 */
export function advanceThreatMovement(incident) {
  const current = incident.zoneId;
  const destination = predictDestination(incident, current);
  incident.predictedDestination = destination;

  if (!destination || destination === current) return { moved: false, current };

  const path = shortestPath(current, destination);
  const next = path[1]; // path[0] is current zone
  if (!next) return { moved: false, current };

  if (deviceState[next]?.doors === "locked") {
    return { moved: false, current, blockedBy: next };
  }

  const oldSensors = sensorState[current];
  const isArmed = incident.incidentType === "armed_intruder";
  applyPatch(current, {
    doorForced: false,
    motion: false,
    weaponDetected: false,
    panicButton: false,
  });
  applyPatch(next, {
    doorForced: true,
    motion: true,
    weaponDetected: isArmed ? true : sensorState[next].weaponDetected,
    panicButton: oldSensors.panicButton,
  });

  incident.zoneId = next;
  incident.affectedZones = [next];
  incident.pathTaken = [...(incident.pathTaken || [current]), next];
  return { moved: true, from: current, to: next };
}

function predictDestination(incident, current) {
  if (incident.incidentType === "burglary") {
    // Heads for the highest-value, least-monitored asset zone.
    const target = ZONES.find((z) => z.id === "Z4") ? "Z4" : ZONES[0].id;
    return target !== current ? target : incident.predictedDestination ?? target;
  }
  if (incident.incidentType === "armed_intruder") {
    // Predicted to move toward wherever the most occupants currently are --
    // the worst-case path -- recomputed every tick as occupants evacuate.
    let best = null;
    let bestOccupancy = -1;
    for (const zone of ZONES) {
      if (zone.id === current) continue;
      const occ = sensorState[zone.id]?.occupancy ?? 0;
      if (occ > bestOccupancy) {
        bestOccupancy = occ;
        best = zone.id;
      }
    }
    return best;
  }
  return incident.predictedDestination ?? current;
}

function shortestPath(from, to) {
  if (from === to) return [from];
  const visited = new Set([from]);
  const queue = [[from]];
  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];
    for (const next of ADJACENCY[last] || []) {
      if (visited.has(next)) continue;
      const nextPath = [...path, next];
      if (next === to) return nextPath;
      visited.add(next);
      queue.push(nextPath);
    }
  }
  return [from];
}

/**
 * Advance a fall/medical incident: condition worsens the longer the victim
 * remains motionless (continuous monitoring), auto-escalating to EMS past a
 * threshold -- or de-escalates immediately if a "recovery" signal (occupant
 * moved) has been observed.
 */
export function advanceFall(incident) {
  const zoneId = incident.zoneId;
  const s = sensorState[zoneId];
  if (!s) return { escalated: false };

  if (s.motion) {
    // Recovery signal observed -- de-escalate immediately.
    return { deescalated: true };
  }

  const worsened = clamp(s.uwbStationarySec + FALL_WORSEN_STEP_SEC, 0, 3600);
  applyPatch(zoneId, { uwbStationarySec: worsened });

  const shouldEscalate = worsened >= FALL_EMS_ESCALATION_THRESHOLD_SEC && !incident.escalatedToEMS;
  return { escalated: shouldEscalate, stationarySec: worsened };
}

export function advanceHazard(incident) {
  switch (incident.incidentType) {
    case "fire":
      return { kind: "fire", affectedZones: advanceFire(incident) };
    case "gas_leak":
      return { kind: "gas_leak", affectedZones: advanceGasLeak(incident) };
    case "burglary":
    case "armed_intruder":
      return { kind: "threat_movement", ...advanceThreatMovement(incident) };
    case "fall":
      return { kind: "fall", ...advanceFall(incident) };
    default:
      return { kind: "none" };
  }
}
