import { useEffect, useState } from "react";
import { getAuditLog } from "../api";
import { formatTime } from "../utils";

const STAGE_LABELS = {
  sensor_ingestion: "Sensor Ingestion",
  detection: "Threat Detection",
  classification: "Classification",
  risk_assessment: "Risk Assessment",
  planning: "AI Planning",
  approval: "Action Approval",
  device_orchestration: "Device Orchestration",
  occupant_guidance: "Occupant Guidance",
  notification: "Notification",
  feedback: "Continuous Feedback",
  incident_closure: "Incident Closure",
};

export default function AuditTimeline({ refreshToken }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    getAuditLog()
      .then((d) => setEntries(d.entries))
      .catch(() => {});
  }, [refreshToken]);

  const ordered = [...entries].reverse().slice(0, 100);

  return (
    <div className="panel">
      <h2>Audit Log &amp; Incident Timeline</h2>
      <p className="muted small">
        Every pipeline decision is recorded immutably for explainability and post-incident reporting.
      </p>
      <div className="timeline">
        {ordered.map((e) => (
          <div key={e.seq} className="timeline-item">
            <span className="timeline-time">{formatTime(e.timestamp)}</span>
            <span className="badge badge-stage">{STAGE_LABELS[e.stage] || e.stage}</span>
            <span className="small">{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
