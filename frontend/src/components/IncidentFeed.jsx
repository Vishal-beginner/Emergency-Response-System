import { useState } from "react";
import { SEVERITY_COLORS, formatTime } from "../utils";
import PlanViewer from "./PlanViewer";
import EvacuationGuidance from "./EvacuationGuidance";

const STATUS_LABELS = {
  pending_approval: "Awaiting Approval",
  active: "Active — Plan Executing",
  resolved: "Resolved",
  rejected: "Rejected",
};

export default function IncidentFeed({ incidents, zones, onApprove, onReject, onResolve, busy }) {
  const [resolvingId, setResolvingId] = useState(null);
  const [summary, setSummary] = useState("");

  if (incidents.length === 0) {
    return (
      <div className="panel">
        <h2>Active Incidents</h2>
        <p className="muted">No active incidents. Trigger a scenario above to see the pipeline run.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Active Incidents</h2>
      <div className="incident-list">
        {incidents.map((incident) => {
          const color = SEVERITY_COLORS[incident.severityLevel] || "#495057";
          return (
            <div key={incident.id} className="incident-card" style={{ borderLeftColor: color }}>
              <div className="incident-header">
                <div>
                  <strong>{incident.label}</strong> — {incident.zoneName}
                  <span className="badge" style={{ background: color }}>
                    {incident.severityLevel.toUpperCase()}
                  </span>
                  <span className="badge badge-status">{STATUS_LABELS[incident.status]}</span>
                </div>
                <div className="muted small">
                  v{incident.version} · {formatTime(incident.createdAt)}
                </div>
              </div>
              <p className="small">{incident.rationale}</p>
              <p className="small muted">Confidence: {(incident.confidence * 100).toFixed(0)}%</p>

              {(incident.status === "pending_approval" || incident.status === "active") && (
                <PlanViewer incident={incident} onApprove={(planId) => onApprove(incident.id, planId)} onReject={(reason) => onReject(incident.id, reason)} busy={busy} />
              )}

              {incident.status === "active" && <EvacuationGuidance guidance={incident.guidance} zones={zones} />}

              {incident.status === "active" && (
                <div className="resolve-row">
                  {resolvingId === incident.id ? (
                    <>
                      <input
                        placeholder="Closure summary (e.g. fire department cleared the scene)"
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                      />
                      <button
                        className="btn btn-small btn-primary"
                        onClick={() => {
                          onResolve(incident.id, summary);
                          setResolvingId(null);
                          setSummary("");
                        }}
                      >
                        Confirm Closure
                      </button>
                      <button className="btn btn-small" onClick={() => setResolvingId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-small" onClick={() => setResolvingId(incident.id)}>
                      Resolve Incident
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
