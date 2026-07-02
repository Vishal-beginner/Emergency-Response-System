import { io } from "socket.io-client";

// Defaults to same-origin (relative requests), which the Vite dev server
// proxies through to the backend -- this is what makes the app work when
// accessed via a forwarded/proxied URL, not just plain localhost. Set
// VITE_API_URL only if the backend is hosted on a different origin entirely
// (e.g. a separate production deployment).
export const API_BASE = import.meta.env.VITE_API_URL || "";

export function connectSocket() {
  const opts = { transports: ["websocket", "polling"] };
  return API_BASE ? io(API_BASE, opts) : io(opts);
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
