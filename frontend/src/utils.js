export const SEVERITY_COLORS = {
  low: "#2f9e44",
  medium: "#f08c00",
  high: "#e8590c",
  critical: "#c92a2a",
};

export function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function zoneHazardLevel(zoneId, incidents) {
  const open = incidents.filter((inc) => inc.status !== "resolved" && inc.status !== "rejected");

  const hazardIncident = open.find((inc) => (inc.affectedZones ?? [inc.zoneId]).includes(zoneId));
  if (hazardIncident) return hazardIncident.severityLevel;

  const predicted = open.find((inc) => inc.predictedDestination === zoneId);
  if (predicted) return "predicted";

  const evacuating = open.find((inc) =>
    inc.chosenPlanId && inc.plans.find((p) => p.id === inc.chosenPlanId)?.evacuationZones?.includes(zoneId)
  );
  if (evacuating) return "evacuating";

  return "normal";
}
