// Threat Detection stage: a lightweight anomaly/rule engine over fused
// sensor data. Returns per-zone anomaly scores; anything above the
// detection threshold is forwarded to classification.

const DETECTION_THRESHOLD = 0.35;

export function detectAnomalies(fusedByZone) {
  const anomalies = [];
  for (const fused of Object.values(fusedByZone)) {
    const score = anomalyScore(fused);
    if (score >= DETECTION_THRESHOLD) {
      anomalies.push({ zoneId: fused.zoneId, score, fused });
    }
  }
  return anomalies.sort((a, b) => b.score - a.score);
}

function anomalyScore(f) {
  let score = 0;
  score += f.smokeScore * 0.9;
  score += f.heatScore * 0.7;
  score += f.gasScore * 0.9;
  if (f.weaponDetected) score += 0.95;
  if (f.panicButton) score += 0.85;
  if (f.doorForced && f.afterHours) score += 0.7;
  if (f.doorForced && f.occupancy === 0) score += 0.5;
  if (f.uwbStationarySec >= 90 && f.occupancy > 0) score += 0.6;
  return Math.min(1, score);
}

export { DETECTION_THRESHOLD };
