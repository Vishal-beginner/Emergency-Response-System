// Static topology of the demo building. Real deployments would load this
// from a BIM/CAD import or facility management system.

export const ZONES = [
  { id: "Z1", name: "Main Lobby", floor: 1, isExit: true, exitName: "Main Entrance", baseOccupancy: 8 },
  { id: "Z2", name: "East Wing Offices", floor: 1, isExit: false, baseOccupancy: 22 },
  { id: "Z3", name: "West Wing Offices", floor: 1, isExit: false, baseOccupancy: 18 },
  { id: "Z4", name: "Server Room", floor: 1, isExit: false, baseOccupancy: 2 },
  { id: "Z5", name: "Cafeteria", floor: 2, isExit: false, baseOccupancy: 15 },
  { id: "Z6", name: "North Corridor", floor: 2, isExit: true, exitName: "North Exit", baseOccupancy: 3 },
];

// Adjacency graph used for evacuation routing and hazard-spread simulation.
export const ADJACENCY = {
  Z1: ["Z2", "Z3", "Z6"],
  Z2: ["Z1", "Z4", "Z6"],
  Z3: ["Z1", "Z5"],
  Z4: ["Z2"],
  Z5: ["Z3", "Z6"],
  Z6: ["Z1", "Z2", "Z5"],
};

export const EXITS = ZONES.filter((z) => z.isExit).map((z) => z.id);

export function zoneById(id) {
  return ZONES.find((z) => z.id === id);
}

// Devices controllable per zone. State is simulated (no real hardware).
export function initialDeviceState() {
  const devices = {};
  for (const zone of ZONES) {
    devices[zone.id] = {
      doors: "unlocked",
      alarm: "off",
      sprinkler: "off",
      lighting: "normal",
      hvac: "normal",
      pa: "idle",
      display: "idle",
    };
  }
  return devices;
}

// Sensor baseline. Every zone reports these channels.
export function initialSensorState() {
  const sensors = {};
  for (const zone of ZONES) {
    sensors[zone.id] = {
      smoke: 0, // 0-100 ppm-normalized
      heat: 21, // celsius
      gas: 0, // 0-100 ppm-normalized
      motion: false,
      doorForced: false,
      occupancy: zone.baseOccupancy,
      uwbStationarySec: 0, // longest time any tracked tag has been motionless
      weaponDetected: false,
      panicButton: false,
      updatedAt: new Date().toISOString(),
    };
  }
  return sensors;
}
