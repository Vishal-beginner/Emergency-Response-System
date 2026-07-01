import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { sensorState, triggerScenario, resetZone as resetSensorZone, getSensorSnapshot } from "./sensorSimulator.js";
import { fuseZone } from "./dataFusion.js";
import { classifyZone } from "./classification.js";
import { assessRisk } from "./riskAssessment.js";
import { generatePlans } from "./planningAgent.js";
import { simulatePlans } from "./scenarioSimulation.js";
import { decideApproval } from "./actionApproval.js";
import { executePlan, getDeviceSnapshot, resetZone as resetDeviceZone } from "./deviceOrchestration.js";
import { generateGuidance } from "./occupantGuidance.js";
import { buildNotifications } from "./notificationService.js";
import { verifyExecution } from "./monitor.js";
import { advanceHazard } from "./hazardDynamics.js";
import { buildWorldModel } from "./worldModel.js";
import { record, archiveIncident } from "../util/auditLog.js";
import { zoneById } from "../data/buildingLayout.js";

export const bus = new EventEmitter();

export const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS) || 4000;

/** Active incidents keyed by id. Resolved incidents are archived to disk and removed from here. */
const incidents = new Map();
const notificationFeed = [];
let tickCount = 0;
let clockHandle = null;

function emitUpdate() {
  bus.emit("update", getFullState());
}

export function getFullState() {
  const incidentList = Array.from(incidents.values());
  return {
    sensors: getSensorSnapshot(),
    devices: getDeviceSnapshot(),
    incidents: incidentList,
    notifications: notificationFeed.slice(-50),
    worldModel: buildWorldModel(sensorState, getDeviceSnapshot(), incidentList),
    tick: tickCount,
    tickIntervalMs: TICK_INTERVAL_MS,
  };
}

function pushNotifications(list) {
  for (const n of list) {
    notificationFeed.push({ ...n, timestamp: new Date().toISOString() });
  }
  bus.emit("notifications", list);
}

function isOpen(incident) {
  return incident.status === "active" || incident.status === "pending_approval";
}

/**
 * Run fuse -> classify -> assess -> plan -> simulate for a single zone and
 * return the assembled artifacts, without mutating any incident state. Used
 * both to start brand-new incidents and, each tick, to reassess existing ones.
 */
function runPipelineForZone(zoneId, affectedZones, extra = {}) {
  const fused = fuseZone(zoneId, sensorState);
  const classification = classifyZone(fused);
  if (!classification) return null;

  const risk = assessRisk(classification, sensorState, affectedZones);
  Object.assign(risk, extra);
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
    originZoneId: zoneId,
    zoneName: zoneById(zoneId).name,
    incidentType: risk.incidentType,
    label: risk.label,
    confidence: risk.confidence,
    severityLevel: risk.severityLevel,
    severityScore: risk.severityScore,
    exposedOccupants: risk.exposedOccupants,
    rationale: risk.rationale,
    affectedZones: risk.affectedZones,
    predictedDestination: null,
    escalatedToEMS: false,
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
  const verification = verifyExecution(results);
  record(incident.id, "device_orchestration", `Executed plan "${plan.name}"`, { commands: results });

  if (!verification.allOk) {
    record(
      incident.id,
      "monitor",
      `Execution verification found ${verification.failed.length} failed device command(s) after automatic retry`,
      { failed: verification.failed }
    );
  } else {
    record(incident.id, "monitor", "Execution verified: all device commands confirmed applied.", {
      commandCount: verification.succeeded.length,
    });
  }

  const guidance = generateGuidance(plan, incident);
  incident.guidance = guidance;
  record(incident.id, "occupant_guidance", "Generated evacuation/shelter instructions", { guidance });

  const notifications = buildNotifications(incident, plan, incident.id);
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

  const existing = Array.from(incidents.values()).find((inc) => inc.zoneId === zoneId && isOpen(inc));
  const pipelineResult = runPipelineForZone(zoneId, existing ? existing.affectedZones : [zoneId], {
    predictedDestination: existing?.predictedDestination,
    escalatedToEMS: existing?.escalatedToEMS,
  });

  let result = null;
  if (!pipelineResult) {
    if (existing && !existing.subsidedLogged) {
      record(
        existing.id,
        "detect_change",
        `Hazard readings in ${zoneById(zoneId).name} have subsided below detection thresholds (recovery signal observed). Awaiting operator resolution.`,
        {}
      );
      existing.subsidedLogged = true;
    }
  } else if (existing) {
    existing.subsidedLogged = false;
    result = applyReassessment(existing, pipelineResult, "operator-triggered sensor event");
  } else {
    result = startIncident(zoneId, pipelineResult);
  }

  emitUpdate();
  return result;
}

function detectChange(incident, risk) {
  const reasons = [];
  const severityDelta = risk.severityScore - incident.severityScore;
  if (Math.abs(severityDelta) > 0.04) {
    reasons.push(
      `Severity ${severityDelta > 0 ? "increased" : "decreased"} to ${risk.severityLevel} (score ${risk.severityScore.toFixed(2)}).`
    );
  }
  if (risk.incidentType !== incident.incidentType) {
    reasons.push(`Classification changed from ${incident.label} to ${risk.label}.`);
  }
  const prevZones = new Set(incident.affectedZones ?? [incident.zoneId]);
  const nextZones = new Set(risk.affectedZones);
  const zonesChanged = prevZones.size !== nextZones.size || [...nextZones].some((z) => !prevZones.has(z));
  if (zonesChanged) {
    reasons.push(`Hazard footprint is now ${risk.affectedZones.map((z) => zoneById(z).name).join(", ")}.`);
  }
  const previousDestination = incident.previousPredictedDestination ?? incident.predictedDestination;
  if (risk.predictedDestination && risk.predictedDestination !== previousDestination) {
    reasons.push(`Predicted destination updated to ${zoneById(risk.predictedDestination).name}.`);
  }
  if (incident.forceReplan) {
    reasons.push("Escalation event requires an immediate replan.");
  }
  return { any: reasons.length > 0, reasons };
}

/** Detect Change + Plan + Simulate + Approve/Execute for an already-open incident, given fresh pipeline output. */
function applyReassessment(incident, pipelineResult, trigger) {
  const { risk, simulatedPlans } = pipelineResult;
  const change = detectChange(incident, risk);
  incident.forceReplan = false;

  if (!change.any) {
    record(incident.id, "monitor", `Reassessed (${trigger}); no material change detected.`, {
      severityScore: risk.severityScore,
    });
    return incident;
  }

  record(incident.id, "detect_change", change.reasons.join(" "), {
    severityScore: risk.severityScore,
    affectedZones: risk.affectedZones,
  });

  incident.version += 1;
  incident.zoneName = zoneById(incident.zoneId).name;
  incident.incidentType = risk.incidentType;
  incident.label = risk.label;
  incident.confidence = risk.confidence;
  incident.severityLevel = risk.severityLevel;
  incident.severityScore = risk.severityScore;
  incident.exposedOccupants = risk.exposedOccupants;
  incident.rationale = risk.rationale;
  incident.affectedZones = risk.affectedZones;
  if (risk.predictedDestination) incident.predictedDestination = risk.predictedDestination;
  incident.plans = simulatedPlans;
  incident.updatedAt = new Date().toISOString();

  record(incident.id, "planning", `Replanned: generated ${simulatedPlans.length} candidate plan(s) (v${incident.version})`, {
    plans: simulatedPlans.map((p) => ({ id: p.id, name: p.name, riskScore: p.simulation.riskScore })),
  });

  const approval = decideApproval(risk);
  record(incident.id, "approval", approval.reason, { autoApprove: approval.autoApprove });

  if (approval.autoApprove) {
    executeChosenPlan(incident, simulatedPlans[0], "auto-approval policy (replan)");
  } else {
    incident.status = "pending_approval";
    incident.chosenPlanId = null;
  }

  return incident;
}

/**
 * The closed loop's heartbeat: Observe (advance simulated hazard physics) ->
 * Understand/Detect Change (refuse and diff) -> Risk Assessment -> Plan ->
 * Simulate -> Execute/Monitor -> Replan, for every currently open incident.
 * Runs on a fixed interval so plans keep evolving with zero further user
 * input, exactly as the closed-loop requirement specifies.
 */
export function tick() {
  tickCount += 1;
  const openIncidents = Array.from(incidents.values()).filter(isOpen);
  if (openIncidents.length === 0) return;

  for (const incident of openIncidents) {
    incident.previousPredictedDestination = incident.predictedDestination;
    const dynamics = advanceHazard(incident);

    if (dynamics.kind === "threat_movement") {
      if (dynamics.moved) {
        record(
          incident.id,
          "observe",
          `${incident.label} tracked moving from ${zoneById(dynamics.from).name} to ${zoneById(dynamics.to).name}. ` +
            `Predicted destination: ${zoneById(incident.predictedDestination).name}.`,
          dynamics
        );
        incident.blockedLogged = false;
      } else if (dynamics.blockedBy) {
        if (!incident.blockedLogged) {
          record(
            incident.id,
            "observe",
            `${incident.label} movement blocked at ${zoneById(dynamics.blockedBy).name} -- locked door contained the threat.`,
            dynamics
          );
          incident.blockedLogged = true;
        }
      }
    }

    if (dynamics.kind === "fall") {
      if (dynamics.deescalated && incident.severityLevel !== "low") {
        record(incident.id, "observe", "Movement detected in monitored zone -- condition de-escalating.", {});
      }
      if (dynamics.escalated) {
        incident.escalatedToEMS = true;
        incident.forceReplan = true;
        record(
          incident.id,
          "observe",
          `No recovery signal after ${dynamics.stationarySec}s of continuous monitoring -- auto-escalating to EMS.`,
          dynamics
        );
      }
    }
  }

  for (const incident of openIncidents) {
    const pipelineResult = runPipelineForZone(incident.zoneId, incident.affectedZones, {
      predictedDestination: incident.predictedDestination,
      escalatedToEMS: incident.escalatedToEMS,
    });

    if (!pipelineResult) {
      if (!incident.subsidedLogged) {
        record(
          incident.id,
          "detect_change",
          `Hazard readings in ${zoneById(incident.zoneId).name} have subsided below detection thresholds. Awaiting operator resolution.`,
          {}
        );
        incident.subsidedLogged = true;
      }
      continue;
    }

    incident.subsidedLogged = false;
    applyReassessment(incident, pipelineResult, "closed-loop tick");
  }

  emitUpdate();
}

export function startClock() {
  if (clockHandle) return clockHandle;
  clockHandle = setInterval(tick, TICK_INTERVAL_MS);
  return clockHandle;
}

export function stopClock() {
  if (clockHandle) clearInterval(clockHandle);
  clockHandle = null;
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

  const touchedZones = new Set([incident.originZoneId, incident.zoneId, ...(incident.affectedZones || [])]);
  for (const z of touchedZones) {
    resetSensorZone(z);
    resetDeviceZone(z);
  }

  emitUpdate();
  return incident;
}
