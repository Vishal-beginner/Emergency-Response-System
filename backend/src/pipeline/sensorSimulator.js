import { ZONES, initialSensorState } from "../data/buildingLayout.js";

// Live sensor state, keyed by zone id. In a real system this would be fed by
// message-bus ingestion from physical sensor gateways (MQTT/OPC-UA/etc).
export const sensorState = initialSensorState();

const SCENARIOS = {
  fire: (zoneId) => ({
    smoke: 78,
    heat: 62,
    gas: 5,
    motion: true,
  }),
  gas_leak: (zoneId) => ({
    smoke: 5,
    heat: 22,
    gas: 85,
    motion: false,
  }),
  burglary: (zoneId) => ({
    doorForced: true,
    motion: true,
    occupancy: 0,
  }),
  armed_intruder: (zoneId) => ({
    weaponDetected: true,
    motion: true,
  }),
  fall: (zoneId) => ({
    uwbStationarySec: 180,
    motion: false,
  }),
  panic_button: (zoneId) => ({
    panicButton: true,
  }),
  recovery: (zoneId) => ({
    uwbStationarySec: 0,
    motion: true,
  }),
};

export function listScenarios() {
  return Object.keys(SCENARIOS);
}

/**
 * Simulate a burst of raw sensor readings for a given scenario/zone. Returns
 * the list of {zoneId, channel, value} readings that were "ingested" so the
 * fusion stage can process them like it would real telemetry.
 */
export function triggerScenario(scenarioKey, zoneId) {
  const factory = SCENARIOS[scenarioKey];
  if (!factory) throw new Error(`Unknown scenario: ${scenarioKey}`);
  if (!ZONES.some((z) => z.id === zoneId)) throw new Error(`Unknown zone: ${zoneId}`);

  const patch = factory(zoneId);
  const readings = [];
  const zone = sensorState[zoneId];
  for (const [channel, value] of Object.entries(patch)) {
    zone[channel] = value;
    readings.push({ zoneId, channel, value });
  }
  zone.updatedAt = new Date().toISOString();
  return readings;
}

/**
 * Apply a raw channel patch to a zone's sensors, bypassing the named-scenario
 * lookup. Used by the closed-loop tick engine (hazardDynamics) to evolve
 * sensor readings between operator-triggered scenarios -- e.g. fire growth,
 * gas dispersion, or a moving intruder's coordinates.
 */
export function applyPatch(zoneId, patch) {
  const zone = sensorState[zoneId];
  if (!zone) return;
  Object.assign(zone, patch);
  zone.updatedAt = new Date().toISOString();
}

/** Reset a zone's sensors back to baseline (used after incident closure). */
export function resetZone(zoneId) {
  const baseline = initialSensorState()[zoneId];
  sensorState[zoneId] = baseline;
}

export function getSensorSnapshot() {
  return JSON.parse(JSON.stringify(sensorState));
}
