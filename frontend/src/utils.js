export const SEVERITY_COLORS = {
  low: "#2f9e44",
  medium: "#f08c00",
  high: "#e8590c",
  critical: "#c92a2a",
};

export const INCIDENT_LABELS = {
  fire: "Fire",
  gas_leak: "Gas Leak",
  armed_intruder: "Armed Intruder",
  burglary: "Burglary",
  fall: "Fall / Medical",
};

export function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function zoneHazardLevel(zoneId, incidents) {
  const relevant = incidents.filter(
    (inc) => inc.status !== "resolved" && (inc.zoneId === zoneId || inc.plans?.some((p) => p.avoidZones?.includes(zoneId)))
  );
  if (relevant.some((inc) => inc.zoneId === zoneId)) {
    const inc = relevant.find((i) => i.zoneId === zoneId);
    return inc.severityLevel;
  }
  const evacuating = incidents.find(
    (inc) =>
      inc.status !== "resolved" &&
      inc.chosenPlanId &&
      inc.plans.find((p) => p.id === inc.chosenPlanId)?.evacuationZones?.includes(zoneId)
  );
  if (evacuating) return "evacuating";
  return "normal";
}
