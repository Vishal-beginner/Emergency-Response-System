# Emergency Response System — Prototype

A working prototype of an AI-driven Emergency Response System for smart buildings, implementing
a **real-time closed-loop adaptive architecture**: Observe → Understand → Detect Change → Risk
Assessment → Plan → Simulate → Execute → Monitor → Replan, running continuously until an incident
is resolved rather than a one-shot pipeline triggered once per event.

There is no physical hardware in this prototype. Sensors, CCTV, and wearables are simulated: a
"Simulate Sensor Event" panel in the dashboard injects an initial sensor reading for a chosen
scenario/zone (this is the "Observe" trigger a real sensor gateway would provide), and from that
point on a fixed-interval tick evolves the simulated physical world on its own — fire spreads and
is suppressed, a burglar/intruder moves and is tracked, a fall victim's condition is continuously
monitored — feeding back into the same pipeline every cycle. The "AI" classification, planning,
and scenario-simulation logic is a rule/heuristic engine with explicit weights and rationale
strings (an explainable stand-in for the trained ML models a production system would use — the
pipeline stage boundaries are where those models would plug in).

## The closed loop

Every `TICK_INTERVAL_MS` (default 4000ms), `incidentManager.tick()` runs the full loop for every
open incident:

1. **Observe** (`hazardDynamics.js`) — advances the simulated physical world: fire grows/spreads
   through the zone adjacency graph unless sprinklers have suppressed it; gas disperses or
   ventilates; a burglar/armed intruder takes one step toward a predicted destination unless
   blocked by a locked door; a fall victim's motionless duration increases (or resets if a
   recovery signal is observed).
2. **Understand** (`worldModel.js`) — recomputes a single live view of hazard/occupancy/device
   state per zone, independent of any one incident (`GET /api/state` → `worldModel`).
3. **Detect Change** (`incidentManager.detectChange`) — diffs the freshly fused/classified reading
   against the incident's last-known state: severity delta, classification change, hazard
   footprint change (spread/recession), or a shifted predicted destination. No change → no replan
   (logged as a quiet "Monitor" heartbeat instead of restarting the whole pipeline every cycle).
4. **Risk Assessment** (`riskAssessment.js`) — recomputes confidence/severity against the *current*
   hazard footprint (`affectedZones`), not the original detection zone.
5. **Plan** (`planningAgent.js`) — regenerates candidate plans keyed off the live hazard zones,
   predicted destination, and escalation state.
6. **Simulate** (`scenarioSimulation.js`) — rescoring plans by projected casualty exposure.
7. **Execute** (`deviceOrchestration.js`) — actuates the chosen plan's device commands.
8. **Monitor** (`monitor.js`) — verifies each command actually took effect; a simulated ~8% fault
   rate models a jammed lock or offline controller, leaves it in an observable `fault:<value>`
   state, and attempts one automatic retry.
9. **Replan** — repeats every cycle for as long as the incident stays open; every change increments
   the incident's `version` and re-runs the loop, exactly matching "every detected change triggers
   a fresh planning cycle."

## Adaptive response examples (from the requirements)

- **Fire**: sprinklers take a short suppression ramp-up (a couple of ticks) before containment
  takes hold, so an uncontained fire visibly spreads to neighboring zones — severity escalates,
  the plan is regenerated to cover the wider hazard footprint, evacuation routes are recalculated
  around the larger avoid-zone — then recedes and the plan contracts back down as sprinklers win.
- **Burglary**: the AI predicts a destination (the highest-value asset zone) and locks down a
  *targeted* corridor (origin + predicted destination) rather than the whole building, so the
  intruder's simulated position can actually move between zones — tracked and logged every step —
  until it's cornered by a lock in its path.
- **Armed intruder**: predicted destination is recomputed every cycle from live occupancy data
  (worst-case: wherever the most people currently are), and the lockdown target follows it as
  occupants evacuate and the prediction shifts.
- **Fall detection**: severity escalates automatically to an EMS-dispatch plan if no recovery
  signal is observed within a monitoring window; triggering the `recovery` scenario immediately
  de-escalates it.

## Architecture

```
backend/   Node.js + Express + Socket.IO. Pure JS, no native deps, no external API keys required.
  src/data/buildingLayout.js   Zones, adjacency graph, exits, device/sensor schema (the "world")
  src/pipeline/
    sensorSimulator.js         Simulated sensor ingestion (manual scenario triggers)
    hazardDynamics.js          Observe: fire spread, threat movement, fall condition over time
    dataFusion.js              Understand: multi-modal sensor fusion -> per-zone hazard vector
    worldModel.js              Understand: live hazard/occupancy/device view, independent of any one incident
    threatDetection.js         Rule/anomaly engine -> per-zone anomaly scores
    classification.js          Anomaly -> labeled incident type + confidence
    riskAssessment.js          Confidence + occupancy exposure + hazard footprint -> severity
    planningAgent.js           Generates 2-3 candidate action plans per incident type
    scenarioSimulation.js      Scores/ranks plans by projected casualty exposure
    actionApproval.js          Auto-execute vs. hold-for-human-approval policy
    deviceOrchestration.js     Simulated device actuation (doors, alarms, sprinklers, HVAC, PA)
    monitor.js                 Verifies executed commands took effect; simulates faults + retry
    occupantGuidance.js        Dynamic hazard-aware evacuation routing per zone
    notificationService.js    Simulated alerts to security / responders / administrators
    incidentManager.js         The closed loop itself: tick(), detect change, replan, approval
  src/util/auditLog.js         Immutable timestamped audit log + incident archive (JSON on disk)
  src/routes/api.js             REST API
  src/server.js                 Express + Socket.IO wiring, starts the tick clock

frontend/  React (Vite) dashboard, connects via REST + Socket.IO for live updates.
  src/components/
    ScenarioTriggers.jsx    Inject a simulated sensor event (scenario + zone) to start a loop
    BuildingMap.jsx         Zone grid color-coded by hazard/evacuation/predicted-threat status, live tick counter
    SensorPanel.jsx         Live sensor readings for the selected zone
    IncidentFeed.jsx        Active incidents: classification, severity, hazard footprint, predicted destination, EMS escalation, actions
    PlanViewer.jsx          Candidate plans with simulated risk scores; approve/reject
    EvacuationGuidance.jsx  Per-zone dynamic evacuation/shelter instructions
    DeviceBoard.jsx         Live device state per zone (including simulated fault states)
    NotificationsPanel.jsx  Security / responder / admin alert feed
    AuditTimeline.jsx       Full chronological, explainable decision log (Observe/Detect Change/Plan/Execute/Monitor)
```

## Functional requirement → implementation map

| Requirement | Where |
|---|---|
| Observe: continuous multi-sensor acquisition | `hazardDynamics.js` + `sensorSimulator.js`, driven by `incidentManager.tick()` |
| Understand: live world model of hazards, occupants, devices | `worldModel.js` (`GET /api/state` → `worldModel`) |
| Detect Change: identify environmental/human changes | `incidentManager.detectChange` |
| Risk Assessment: recompute risk and confidence | `riskAssessment.js`, re-run every tick |
| Plan: generate updated counter-plans | `planningAgent.js`, re-run on every detected change |
| Simulate: evaluate candidate plans | `scenarioSimulation.js` |
| Execute: issue commands to devices/responders | `deviceOrchestration.js`, `notificationService.js` |
| Monitor: verify execution, detect failures | `monitor.js` (simulated fault + automatic retry) |
| Replan: repeat whenever new information arrives | `incidentManager.tick()` loop, `version` increments each replan |
| Fire: track spread/smoke, recalc routes, reroute occupants | `hazardDynamics.advanceFire` + `occupantGuidance.js` regenerated every replan |
| Burglary: track movement, predict destination, control access | `hazardDynamics.advanceThreatMovement` (`predictDestination`) |
| Armed intruder: track coordinates, adjust lockdown/corridors | `hazardDynamics.advanceThreatMovement` + `planningAgent.armedIntruderPlans` (targeted, re-targeted lockdown) |
| Fall: escalate/de-escalate based on continuous monitoring | `hazardDynamics.advanceFall` (EMS auto-escalation threshold + `recovery` scenario) |
| Casualty protection (life safety over asset protection) | `scenarioSimulation.js` weights projected exposure 10x over evacuation time |
| Action approval policy | `actionApproval.js` — auto-executes high-confidence/high-severity incidents, holds others for operator sign-off |
| Audit logs and incident timelines | `util/auditLog.js`, `AuditTimeline.jsx` |
| Incident closure & reporting | `resolveIncident` + `/api/incidents/:id/report` |

## Running it

No external services or API keys required. Two ways to run it, depending on your setup:

### Option A — two dev servers (best while actively developing)

```bash
# Terminal 1 - backend (port 4000)
cd backend
npm install
npm start   # closed-loop tick defaults to every 4000ms; override with TICK_INTERVAL_MS=2000

# Terminal 2 - frontend (port 5173)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (or whatever URL that port is forwarded to, e.g. in a hosted/remote dev
environment — the frontend dev server proxies `/api` and `/socket.io` through to the backend, so
the browser only ever needs to reach port 5173; only port 4000 is used for the backend-to-backend
proxy hop and never needs to be exposed directly). If the backend runs on a non-default host/port,
set `BACKEND_URL` before starting the frontend, e.g. `BACKEND_URL=http://localhost:4001 npm run dev`.

### Option B — single port (best if a firewall is blocking cross-port/proxy traffic)

Builds the frontend to static files and has the backend serve them directly, so only **one port**
(4000) is ever involved — nothing needs to be proxied, and only that one port needs to clear a
firewall.

```bash
npm run install:all   # installs both backend/ and frontend/ deps
npm run serve         # builds the frontend, then starts the backend on port 4000
```

Open http://localhost:4000 — that's the whole app, API and dashboard together. Re-run `npm run
serve` (or just `npm run build` then `npm start`) after any code change, since it's serving a
static build rather than hot-reloading.

---

Use the "Simulate Sensor Event" panel to trigger a scenario (fire,
gas leak, burglary, armed intruder, fall, panic button, or a fall `recovery` signal) in any zone,
then just watch — the loop runs on its own from there: replanning as the hazard spreads/moves/
escalates, executing the updated plan, verifying it, and updating guidance/notifications, all
visible live without further input. Approve/reject plans that are held for human sign-off, and
resolve an incident once it's fully handled to close it out and archive its report.

## Demo building

A 6-zone, 2-floor building (`backend/src/data/buildingLayout.js`) with an adjacency graph used
for evacuation routing, cascading-risk exposure, fire/gas spread, and threat-movement pathing:
Main Lobby and North Corridor are exits; Server Room, East/West Wing Offices, and Cafeteria are
interior zones. Change this file to model a different facility — nothing else needs to change
since the pipeline is purely data-driven off zones/adjacency/exits.

## Notable design decisions

- **Suppression ramp-up**: sprinklers/ventilation don't contain a hazard the instant they turn on
  — a short delay (a couple of ticks) lets fire/gas actually spread first, so the "continuously
  tracks spread" behavior is observable rather than being pre-empted by the same-cycle response.
- **Targeted, not blanket, lockdown**: the primary armed-intruder/burglary plan locks only the
  threat zone and its predicted destination, leaving the rest of the building passable — this is
  both a more realistic AI response and what makes intruder movement observable instead of
  instantly and totally blocked.
- **Approval policy**: fire, gas leak, and armed-intruder incidents at high/critical severity
  auto-execute (life-safety-critical, latency matters). Lower-confidence/severity incidents are
  held for a human operator to approve or reject a plan in the dashboard.
- **No native dependencies**: the backend avoids compiled modules (e.g. sqlite) so it runs
  anywhere Node runs without a build toolchain; the audit log persists as append-only JSONL.
