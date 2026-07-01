import { SEVERITY_COLORS, formatTime } from "../utils";

const AUDIENCE_LABELS = {
  security: "Security",
  emergency_responders: "Emergency Responders",
  administrators: "Administrators",
};

export default function NotificationsPanel({ notifications }) {
  const ordered = [...notifications].reverse();

  return (
    <div className="panel">
      <h2>Notifications</h2>
      {ordered.length === 0 && <p className="muted">No notifications yet.</p>}
      <div className="notification-list">
        {ordered.map((n, idx) => (
          <div key={`${n.id}-${idx}`} className="notification-item" style={{ borderLeftColor: SEVERITY_COLORS[n.priority] || "#495057" }}>
            <div className="notification-meta">
              <span className="badge badge-status">{AUDIENCE_LABELS[n.audience] || n.audience}</span>
              <span className="muted small">{formatTime(n.timestamp)}</span>
            </div>
            <div className="small">{n.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
