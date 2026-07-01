# Emergency Response System — Prototype

A working prototype of an AI-driven Emergency Response System for smart buildings, built from
the functional requirements document (sensor fusion → threat detection → classification → risk
assessment → AI planning → scenario simulation → device orchestration → occupant guidance →
notifications → audit trail).

There is no physical hardware in this prototype. Sensors, CCTV, and wearables are simulated: a
"Simulate Sensor Event" panel in the dashboard injects sensor readings for a chosen scenario/zone,
and the full backend pipeline runs against that simulated data exactly as it would against real
telemetry. The "AI" classification, planning, and scenario-simulation logic is a rule/heuristic
engine with explicit weights and rationale strings (an explainable stand-in for the trained
ML models a production system would use — the pipeline stage boundaries are where those models
would plug in).

## Architecture

```
backend/   Node.js + Express + Socket.IO. Pure JS, no native deps, no external API keys required.
  src/data/buildingLayout.js   Zones, adjacency graph, exits, device/sensor schema (the "world")
  src/pipeline/
    sensorSimulator.js         Simulated sensor ingestion (manual scenario triggers)
    dataFusion.js              Multi-modal sensor fusion -> per-zone hazard vector + evidence
    threatDetection.js         Rule/anomaly engine -> per-zone anomaly scores
    classification.js          Anomaly -> labeled incident type + confidence
    riskAssessment.js          Confidence + occupancy exposure + adjacency spread -> severity
    planningAgent.js           Generates 2-3 candidate action plans per incident type
    scenarioSimulation.js      Scores/ranks plans by projected casualty exposure
    actionApproval.js          Auto-execute vs. hold-for-human-approval policy
    deviceOrchestration.js     Simulated device actuation (doors, alarms, sprinklers, HVAC, PA)
    occupantGuidance.js        Dynamic hazard-aware evacuation routing per zone
    notificationService.js    Simulated alerts to security / responders / administrators
    incidentManager.js         Orchestrates the pipeline, tracks active incidents, replanning
  src/util/auditLog.js         Immutable timestamped audit log + incident archive (JSON on disk)
  src/routes/api.js             REST API
  src/server.js                 Express + Socket.IO wiring (live state push to the dashboard)

frontend/  React (Vite) dashboard, connects via REST + Socket.IO for live updates.
  src/components/
    ScenarioTriggers.jsx    Inject a simulated sensor event (scenario + zone)
    BuildingMap.jsx         Zone grid, color-coded by hazard/evacuation status
    SensorPanel.jsx         Live sensor readings for the selected zone
    IncidentFeed.jsx        Active incidents: classification, severity, rationale, actions
    PlanViewer.jsx          Candidate plans with simulated risk scores; approve/reject
    EvacuationGuidance.jsx  Per-zone dynamic evacuation/shelter instructions
    DeviceBoard.jsx         Live device state per zone
    NotificationsPanel.jsx  Security / responder / admin alert feed
    AuditTimeline.jsx       Full chronological, explainable decision log
```

## Functional requirement -> implementation map

| Requirement | Where |
|---|---|
| Integrate CCTV/smoke/heat/gas/door/motion/UWB/occupancy/wearable sensors | `sensorSimulator.js` models all these channels per zone |
| Ingest and fuse multi-modal sensor data | `dataFusion.js` |
| Detect anomalies (AI models + rule engines) | `threatDetection.js` |
| Classify incidents (fire, burglary, armed intruder, fall, etc.) | `classification.js` |
| Estimate confidence and severity | `riskAssessment.js` |
| AI planning agent generates an action plan | `planningAgent.js` |
| Simulate candidate actions, prioritize minimizing casualties | `scenarioSimulation.js` (ranks by projected exposed occupants first) |
| Control connected devices | `deviceOrchestration.js` |
| Dynamic evacuation instructions | `occupantGuidance.js` (hazard-aware BFS routing) |
| Notify security/responders/admins | `notificationService.js` |
| Audit logs and incident timelines | `util/auditLog.js`, `AuditTimeline.jsx` |
| System flow (sensors -> ... -> closure/reporting) | `incidentManager.ingestScenario` orchestrates the full chain end to end |
| Continuous feedback / re-planning | `incidentManager.replan` re-scores active incidents against new sensor data |
| Action approval policy | `actionApproval.js` — auto-executes high-confidence/high-severity incidents (fire, gas, armed intruder), holds lower-confidence ones for operator sign-off in the dashboard |
| Incident closure & reporting | `resolveIncident` + `/api/incidents/:id/report` |

## Running it

Two processes, no external services or API keys required.

```bash
# Terminal 1 - backend (port 4000)
cd backend
npm install
npm start

# Terminal 2 - frontend (port 5173)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Use the "Simulate Sensor Event" panel to trigger a scenario
(fire, gas leak, burglary, armed intruder, fall, panic button) in any zone and watch the
pipeline run live: detection -> classification -> risk assessment -> AI plan generation ->
scenario simulation -> (auto-execution or your manual approval) -> device orchestration ->
occupant guidance -> notifications -> audit trail. Resolve an incident to close it out and
archive its report.

## Demo building

A 6-zone, 2-floor building (`backend/src/data/buildingLayout.js`) with an adjacency graph used
for both evacuation routing and cascading-risk exposure: Main Lobby and North Corridor are
exits; Server Room, East/West Wing Offices, and Cafeteria are interior zones. Change this file
to model a different facility — nothing else needs to change since the pipeline is purely
data-driven off zones/adjacency/exits.

## Notable design decisions

- **Approval policy**: fire, gas leak, and armed-intruder incidents at high/critical severity
  auto-execute (life-safety-critical, latency matters). Lower-confidence/severity incidents
  (e.g. a borderline burglary read) are held for a human operator to approve or reject a plan
  in the dashboard — matching the requirement for human-in-the-loop oversight alongside
  automation.
- **Casualty-first ranking**: `scenarioSimulation.js` scores plans overwhelmingly by projected
  exposed occupants (10x weight) vs. evacuation time (0.05x weight), directly implementing
  "prioritize life safety over asset protection."
- **No native dependencies**: the backend avoids compiled modules (e.g. sqlite) so it runs
  anywhere Node runs without a build toolchain; the audit log persists as append-only JSONL.
