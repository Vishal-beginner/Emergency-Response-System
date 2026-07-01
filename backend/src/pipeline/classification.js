// Threat Classification stage: turns an anomaly into a labeled incident type
// with a confidence score, using the evidence gathered during fusion.
// This stands in for the trained ML classifier a production system would use;
// the rule weights below are the "model" for this prototype.

const RULES = [
  {
    type: "fire",
    label: "Fire",
    test: (f) => f.smokeScore > 0.3 || f.heatScore > 0.3,
    confidence: (f) => 0.5 + 0.3 * f.smokeScore + 0.2 * f.heatScore,
  },
  {
    type: "gas_leak",
    label: "Gas Leak",
    test: (f) => f.gasScore > 0.3,
    confidence: (f) => 0.55 + 0.4 * f.gasScore,
  },
  {
    type: "armed_intruder",
    label: "Armed Intruder",
    test: (f) => f.weaponDetected || f.panicButton,
    confidence: (f) => {
      if (f.weaponDetected && f.panicButton) return 0.97;
      return f.weaponDetected ? 0.9 : 0.8;
    },
  },
  {
    type: "burglary",
    label: "Burglary / Unauthorized Entry",
    // Forced entry into a zone the occupancy sensors say is empty is
    // unauthorized regardless of clock time; after-hours timing is
    // corroborating evidence that boosts confidence rather than gating it.
    test: (f) => f.doorForced && f.occupancy === 0,
    confidence: (f) => 0.75 + (f.afterHours ? 0.2 : 0),
  },
  {
    type: "fall",
    label: "Fall / Medical Emergency",
    test: (f) => f.uwbStationarySec >= 90 && f.occupancy > 0,
    confidence: (f) => 0.6 + Math.min(0.3, f.uwbStationarySec / 600),
  },
];

/**
 * Classify a single zone's fused evidence. May match multiple rules (e.g. a
 * fire that also trips motion); we keep the highest-confidence match as the
 * primary classification but retain all matches for the record.
 */
export function classifyZone(fused) {
  const matches = RULES.filter((r) => r.test(fused)).map((r) => ({
    type: r.type,
    label: r.label,
    confidence: Math.min(0.99, r.confidence(fused)),
  }));

  if (matches.length === 0) return null;

  matches.sort((a, b) => b.confidence - a.confidence);
  return {
    zoneId: fused.zoneId,
    primary: matches[0],
    allMatches: matches,
    evidence: fused.evidence,
  };
}
