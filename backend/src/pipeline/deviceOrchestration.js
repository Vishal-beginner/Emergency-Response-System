import { initialDeviceState } from "../data/buildingLayout.js";

// Device Orchestration: simulated actuation layer. In production this would
// dispatch commands over BACnet/Modbus/vendor APIs to real controllers.
export const deviceState = initialDeviceState();

const ACTION_TO_FIELD_VALUE = {
  lock: { device: "doors", value: "locked" },
  unlock: { device: "doors", value: "unlocked" },
  on: null, // handled per-device below
  off: null,
  shutdown: { device: "hvac", value: "shutdown" },
  max_ventilation: { device: "hvac", value: "max_ventilation" },
  purge: { device: "hvac", value: "purging" },
  evacuate_announcement: { device: "pa", value: "evacuate_announcement" },
  silent_lockdown_alert: { device: "pa", value: "silent_lockdown_alert" },
  medical_alert: { device: "display", value: "medical_alert" },
};

/** Execute a single {zoneId, device, action} command against simulated device state. */
export function executeAction({ zoneId, device, action }) {
  if (!deviceState[zoneId]) return null;

  let value;
  if (action === "on") value = device === "sprinkler" ? "on" : "on";
  else if (action === "off") value = "off";
  else value = ACTION_TO_FIELD_VALUE[action]?.value ?? action;

  deviceState[zoneId][device] = value;
  return { zoneId, device, value };
}

export function executePlan(plan) {
  const results = [];
  for (const cmd of plan.deviceActions) {
    const result = executeAction(cmd);
    if (result) results.push(result);
  }
  return results;
}

export function getDeviceSnapshot() {
  return JSON.parse(JSON.stringify(deviceState));
}

export function resetZone(zoneId) {
  deviceState[zoneId] = initialDeviceState()[zoneId];
}
