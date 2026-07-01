export default function PlanViewer({ incident, onApprove, onReject, busy }) {
  const pending = incident.status === "pending_approval";

  return (
    <div className="plan-viewer">
      <h4>Candidate Plans (AI Planning Agent + Scenario Simulation)</h4>
      <div className="plan-list">
        {incident.plans.map((plan) => {
          const isChosen = incident.chosenPlanId === plan.id;
          return (
            <div key={plan.id} className={`plan-card ${isChosen ? "plan-card-chosen" : ""}`}>
              <div className="plan-card-header">
                <strong>
                  {plan.id}. {plan.name}
                </strong>
                {isChosen && <span className="badge badge-selected">SELECTED</span>}
              </div>
              <p className="small">{plan.rationale}</p>
              <div className="plan-metrics">
                <span>Projected exposure: {plan.simulation.projectedExposedOccupants}</span>
                <span>Evac time: {plan.simulation.evacTimeSec}s</span>
                <span>Risk score: {plan.simulation.riskScore}</span>
              </div>
              {pending && (
                <button className="btn btn-small btn-approve" disabled={busy} onClick={() => onApprove(plan.id)}>
                  Approve &amp; Execute
                </button>
              )}
            </div>
          );
        })}
      </div>
      {pending && (
        <button
          className="btn btn-small btn-reject"
          disabled={busy}
          onClick={() => onReject("Operator determined automated plans unsuitable")}
        >
          Reject All Plans
        </button>
      )}
    </div>
  );
}
