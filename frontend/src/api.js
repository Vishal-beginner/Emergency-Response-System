import { io } from "socket.io-client";

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function connectSocket() {
  return io(API_BASE, { transports: ["websocket", "polling"] });
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function getLayout() {
  return request("/api/layout");
}

export function getScenarios() {
  return request("/api/scenarios");
}

export function getState() {
  return request("/api/state");
}

export function triggerScenario(scenario, zoneId) {
  return request("/api/scenarios/trigger", {
    method: "POST",
    body: JSON.stringify({ scenario, zoneId }),
  });
}

export function approvePlan(incidentId, planId, approver) {
  return request(`/api/incidents/${incidentId}/approve`, {
    method: "POST",
    body: JSON.stringify({ planId, approver }),
  });
}

export function rejectIncident(incidentId, reason, approver) {
  return request(`/api/incidents/${incidentId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason, approver }),
  });
}

export function resolveIncident(incidentId, summary) {
  return request(`/api/incidents/${incidentId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ summary }),
  });
}

export function getAuditLog() {
  return request("/api/audit-log");
}

export function getIncidentReport(incidentId) {
  return request(`/api/incidents/${incidentId}/report`);
}
