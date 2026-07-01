// Data Fusion stage: combine raw multi-modal sensor channels into a single
// normalized hazard vector per zone, with the contributing evidence retained
// for explainability (per the "explainable AI decisions" requirement).

const THRESHOLDS = {
  smoke: 40,
  heat: 45,
  gas: 40,
  uwbStationarySec: 90,
};

export function fuseZone(zoneId, sensors) {
  const s = sensors[zoneId];
  const evidence = [];

  const smokeScore = clamp01(s.smoke / 100);
  if (s.smoke >= THRESHOLDS.smoke) evidence.push(`smoke sensor reading ${s.smoke}/100`);

  const heatScore = clamp01((s.heat - 20) / 60);
  if (s.heat >= THRESHOLDS.heat) evidence.push(`heat sensor reading ${s.heat}°C`);

  const gasScore = clamp01(s.gas / 100);
  if (s.gas >= THRESHOLDS.gas) evidence.push(`gas sensor reading ${s.gas}/100`);

  if (s.doorForced) evidence.push("forced-entry door sensor triggered");
  if (s.motion) evidence.push("motion sensor active");
  if (s.weaponDetected) evidence.push("CCTV vision model flagged a weapon");
  if (s.panicButton) evidence.push("panic button activated");
  if (s.uwbStationarySec >= THRESHOLDS.uwbStationarySec) {
    evidence.push(`UWB/wearable tag stationary for ${s.uwbStationarySec}s`);
  }

  return {
    zoneId,
    smokeScore,
    heatScore,
    gasScore,
    motion: s.motion,
    doorForced: s.doorForced,
    weaponDetected: s.weaponDetected,
    panicButton: s.panicButton,
    uwbStationarySec: s.uwbStationarySec,
    occupancy: s.occupancy,
    afterHours: isAfterHours(),
    evidence,
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// Demo helper: treat the current wall-clock hour as the building's occupancy
// schedule so burglary-after-hours logic has something real to key off of.
function isAfterHours() {
  const hour = new Date().getHours();
  return hour < 7 || hour >= 20;
}
