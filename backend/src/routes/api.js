import { Router } from "express";
import { ZONES, ADJACENCY, EXITS } from "../data/buildingLayout.js";
import { listScenarios } from "../pipeline/sensorSimulator.js";
import {
  getFullState,
  ingestScenario,
  approvePlan,
  rejectIncident,
  resolveIncident,
} from "../pipeline/incidentManager.js";
import { getAllEntries, getEntriesForIncident, getArchivedIncidents } from "../util/auditLog.js";

export const router = Router();

router.get("/layout", (req, res) => {
  res.json({ zones: ZONES, adjacency: ADJACENCY, exits: EXITS });
});

router.get("/scenarios", (req, res) => {
  res.json({ scenarios: listScenarios() });
});

router.get("/state", (req, res) => {
  res.json(getFullState());
});

router.post("/scenarios/trigger", (req, res) => {
  const { scenario, zoneId } = req.body;
  if (!scenario || !zoneId) {
    return res.status(400).json({ error: "scenario and zoneId are required" });
  }
  try {
    const incident = ingestScenario(scenario, zoneId);
    res.json({ ok: true, incident });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/incidents/:id/approve", (req, res) => {
  const { planId, approver } = req.body;
  try {
    const incident = approvePlan(req.params.id, planId, approver);
    res.json({ ok: true, incident });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/incidents/:id/reject", (req, res) => {
  const { reason, approver } = req.body;
  try {
    const incident = rejectIncident(req.params.id, reason, approver);
    res.json({ ok: true, incident });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/incidents/:id/resolve", (req, res) => {
  const { summary } = req.body;
  try {
    const incident = resolveIncident(req.params.id, summary);
    res.json({ ok: true, incident });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/audit-log", (req, res) => {
  res.json({ entries: getAllEntries() });
});

router.get("/incidents/:id/report", (req, res) => {
  const entries = getEntriesForIncident(req.params.id);
  const archived = getArchivedIncidents().find((i) => i.id === req.params.id);
  const current = getFullState().incidents.find((i) => i.id === req.params.id);
  const incident = archived || current;
  if (!incident) return res.status(404).json({ error: "Incident not found" });
  res.json({ incident, timeline: entries });
});

router.get("/incidents/archive", (req, res) => {
  res.json({ incidents: getArchivedIncidents() });
});
