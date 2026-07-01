import { zoneById } from "../data/buildingLayout.js";

// Notification Service: simulated multi-channel alerting to security staff,
// external emergency responders, and building administrators. In production
// this would integrate with SMS/radio/CAD dispatch APIs.

export function buildNotifications(riskAssessment, chosenPlan, incidentId) {
  const zone = zoneById(riskAssessment.zoneId);
  const notifications = [];

  notifications.push({
    id: `${incidentId}-security`,
    audience: "security",
    priority: riskAssessment.severityLevel,
    message: `${riskAssessment.label} in ${zone.name} (confidence ${(riskAssessment.confidence * 100).toFixed(
      0
    )}%). Plan "${chosenPlan.name}" is executing. Proceed to ${zone.name}.`,
  });

  if (["fire", "gas_leak", "armed_intruder"].includes(riskAssessment.incidentType)) {
    const responderType =
      riskAssessment.incidentType === "armed_intruder" ? "police" : "fire department";
    notifications.push({
      id: `${incidentId}-responders`,
      audience: "emergency_responders",
      priority: riskAssessment.severityLevel,
      message: `Dispatch requested: ${responderType} to building, ${zone.name} (floor ${zone.floor}). ` +
        `Incident: ${riskAssessment.label}. Exposed occupants: ${riskAssessment.exposedOccupants}.`,
    });
  }

  if (riskAssessment.incidentType === "fall") {
    notifications.push({
      id: `${incidentId}-responders`,
      audience: "emergency_responders",
      priority: riskAssessment.severityLevel,
      message: `Medical assistance requested at ${zone.name} (floor ${zone.floor}). Escalating to EMS if no on-site response.`,
    });
  }

  notifications.push({
    id: `${incidentId}-admin`,
    audience: "administrators",
    priority: riskAssessment.severityLevel,
    message: `Incident opened: ${riskAssessment.label} in ${zone.name}. Severity: ${riskAssessment.severityLevel}. Automated plan "${chosenPlan.name}" selected.`,
  });

  return notifications;
}
