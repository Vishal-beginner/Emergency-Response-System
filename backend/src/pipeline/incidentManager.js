import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { sensorState, triggerScenario, resetZone as resetSensorZone, getSensorSnapshot } from "./sensorSimulator.js";
import { fuseAll } from "./dataFusion.js";
import { detectAnomalies } from "./threatDetection.js";
import { classifyZone } from "./classification.js";
import { assessRisk } from "./riskAssessment.js";
import { generatePlans } from "./planningAgent.js";
import { simulatePlans } from "./scenarioSimulation.js";
import { decideApproval } from "./actionApproval.js";
import { executePlan, getDeviceSnapshot, resetZone as resetDeviceZone } from "./deviceOrchestration.js";
import { generateGuidance } from "./occupantGuidance.js";
import { buildNotifications } from "./notificationService.js";
import { record, archiveIncident } from "../util/auditLog.js";
import { zoneById } from "../data/buildingLayout.js";

export const bus = new EventEmitter();

/** Active incidents keyed by id. Resolved incidents are archived to disk and removed from here. */
const incidents = new Map();
const notificationFeed = [];

function emitUpdate() {
  bus.emit("update", getFullState());
}

export function getFullState() {
  return {
    sensors: getSensorSnapshot(),
    devices: getDeviceSnapshot(),
    incidents: Array.from(incidents.values()),
    notifications: notificationFeed.slice(-50),
  };
}

function pushNotifications(list) {
  for (const n of list) {
    notificationFeed.push({ ...n, timestamp: new Date().toISOString() });
  }
  bus.emit("notifications", list);
}

/**
 * Run the fixed pipeline (fuse -> detect -> classify -> assess -> plan ->
 * simulate) for a single zone and return the assembled artifacts, without
 * mutating incident state. Used both for new incidents and for the feedback
 * loop's replanning check.
 */
function runPipelineForZone(zoneId) {
  const fused = fuseAll(sensorState)[zoneId];
  const classification = classifyZone(fused);
  if (!classification) return null;

  const risk = assessRisk(classification, sensorState);
  const rawPlans = generatePlans(risk);
  const simulatedPlans = simulatePlans(rawPlans, risk, sensorState);
  return { fused, classification, risk, simulatedPlans };
}

function startIncident(zoneId, pipelineResult) {
  const { risk, simulatedPlans } = pipelineResult;
  const id = randomUUID();
  const approval = decideApproval(risk);
  const bestPlan = simulatedPlans[0];

  const incident = {
    id,
    zoneId,
    zoneName: zoneById(zoneId).name,
    incidentType: risk.incidentType,
    label: risk.label,
    confidence: risk.confidence,
    severityLevel: risk.severityLevel,
    severityScore: risk.severityScore,
    exposedOccupants: risk.exposedOccupants,
    rationale: risk.rationale,
    status: approval.autoApprove ? "active" : "pending_approval",
    plans: simulatedPlans,
    chosenPlanId: approval.autoApprove ? bestPlan.id : null,
    guidance: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  };

  incidents.set(id, incident);

  record(id, "detection", `Anomaly detected in ${incident.zoneName}`, { evidence: pipelineResult.classification.evidence });
  record(id, "classification", `Classified as ${risk.label}`, { allMatches: pipelineResult.classification.allMatches });
  record(id, "risk_assessment", risk.rationale, { severityScore: risk.severityScore, exposedOccupants: risk.exposedOccupants });
  record(id, "planning", `Generated ${simulatedPlans.length} candidate plan(s)`, {
    plans: simulatedPlans.map((p) => ({ id: p.id, name: p.name, riskScore: p.simulation.riskScore })),
  });
  record(id, "approval", approval.reason, { autoApprove: approval.autoApprove });

  if (approval.autoApprove) {
    executeChosenPlan(incident, bestPlan, "auto-approval policy");
  }

  emitUpdate();
  return incident;
}

function executeChosenPlan(incident, plan, approvedBy) {
  const results = executePlan(plan);
  record(incident.id, "device_orchestration", `Executed plan "${plan.name}"`, { commands: results });

  const guidance = generateGuidance(plan, incident);
  incident.guidance = guidance;
  record(incident.id, "occupant_guidance", "Generated evacuation/shelter instructions", { guidance });

  const risk = {
    zoneId: incident.zoneId,
    incidentType: incident.incidentType,
    label: incident.label,
    confidence: incident.confidence,
    severityLevel: incident.severityLevel,
    exposedOccupants: incident.exposedOccupants,
  };
  const notifications = buildNotifications(risk, plan, incident.id);
  pushNotifications(notifications);
  record(incident.id, "notification", `Notified ${notifications.map((n) => n.audience).join(", ")}`, { notifications });

  incident.status = "active";
  incident.chosenPlanId = plan.id;
  incident.approvedBy = approvedBy;
  incident.updatedAt = new Date().toISOString();
}

/** Entry point: ingest new sensor readings (from a simulated scenario trigger) and run the pipeline. */
export function ingestScenario(scenarioKey, zoneId) {
  triggerScenario(scenarioKey, zoneId);
  record(null, "sensor_ingestion", `Scenario "${scenarioKey}" triggered in zone ${zoneId}`, { scenarioKey, zoneId });

  const pipelineResult = runPipelineForZone(zoneId);
  if (!pipelineResult) {
    emitUpdate();
    return null;
  }

  const existing = Array.from(incidents.values()).find(
    (inc) => inc.zoneId === zoneId && inc.status !== "resolved"
  );

  if (!existing) {
    return startIncident(zoneId, pipelineResult);
  }

  return replan(existing, pipelineResult);
}

/** Continuous Feedback: re-evaluate an active incident against fresh sensor data and replan if conditions changed materially. */
function replan(incident, pipelineResult) {
  const { risk, simulatedPlans } = pipelineResult;
  const severityIncreased = risk.severityScore > incident.severityScore + 0.05;
  const typeChanged = risk.incidentType !== incident.incidentType;

  if (!severityIncreased && !typeChanged) {
    record(incident.id, "feedback", "New sensor data received; conditions unchanged, no replan needed.", {
      severityScore: risk.severityScore,
    });
    emitUpdate();
    return incident;
  }

  incident.version += 1;
  incident.incidentType = risk.incidentType;
  incident.label = risk.label;
  incident.confidence = risk.confidence;
  incident.severityLevel = risk.severityLevel;
  incident.severityScore = risk.severityScore;
  incident.exposedOccupants = risk.exposedOccupants;
  incident.rationale = risk.rationale;
  incident.plans = simulatedPlans;
  incident.updatedAt = new Date().toISOString();

  record(incident.id, "feedback", `Conditions changed (severity ${incident.severityLevel}); replanning triggered (v${incident.version})`, {
    severityScore: risk.severityScore,
  });

  const approval = decideApproval(risk);
  record(incident.id, "approval", approval.reason, { autoApprove: approval.autoApprove });

  if (approval.autoApprove) {
    executeChosenPlan(incident, simulatedPlans[0], "auto-approval policy (replan)");
  } else {
    incident.status = "pending_approval";
    incident.chosenPlanId = null;
  }

  emitUpdate();
  return incident;
}

export function approvePlan(incidentId, planId, approver = "operator") {
  const incident = incidents.get(incidentId);
  if (!incident) throw new Error("Incident not found");
  const plan = incident.plans.find((p) => p.id === planId);
  if (!plan) throw new Error("Plan not found");

  record(incident.id, "approval", `Operator "${approver}" approved plan "${plan.name}"`, { planId });
  executeChosenPlan(incident, plan, approver);
  emitUpdate();
  return incident;
}

export function rejectIncident(incidentId, reason, approver = "operator") {
  const incident = incidents.get(incidentId);
  if (!incident) throw new Error("Incident not found");
  incident.status = "rejected";
  incident.updatedAt = new Date().toISOString();
  record(incident.id, "approval", `Operator "${approver}" rejected all plans: ${reason}`, { reason });
  emitUpdate();
  return incident;
}

export function resolveIncident(incidentId, summary = "") {
  const incident = incidents.get(incidentId);
  if (!incident) throw new Error("Incident not found");

  incident.status = "resolved";
  incident.resolvedAt = new Date().toISOString();
  incident.updatedAt = incident.resolvedAt;
  incident.closureSummary = summary;

  record(incident.id, "incident_closure", `Incident closed. ${summary}`.trim(), {});

  archiveIncident(incident);
  incidents.delete(incidentId);

  resetSensorZone(incident.zoneId);
  resetDeviceZone(incident.zoneId);

  emitUpdate();
  return incident;
}
