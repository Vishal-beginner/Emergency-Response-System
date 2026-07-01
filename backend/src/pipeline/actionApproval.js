// Action Approval Policy: high-confidence, high-severity incidents are
// auto-executed to minimize response latency (fire/gas/armed-intruder are
// time-critical). Lower-confidence or lower-severity incidents are queued
// for human operator sign-off before any device is actuated.

const AUTO_APPROVE_CONFIDENCE = 0.75;
const AUTO_APPROVE_SEVERITIES = ["high", "critical"];

export function decideApproval(riskAssessment) {
  const autoApprove =
    riskAssessment.confidence >= AUTO_APPROVE_CONFIDENCE &&
    AUTO_APPROVE_SEVERITIES.includes(riskAssessment.severityLevel);

  return {
    autoApprove,
    reason: autoApprove
      ? `Auto-approved: confidence ${(riskAssessment.confidence * 100).toFixed(0)}% and severity ` +
        `"${riskAssessment.severityLevel}" exceed the auto-execution policy threshold (>=${
          AUTO_APPROVE_CONFIDENCE * 100
        }% confidence, high/critical severity).`
      : `Held for human operator approval: confidence ${(riskAssessment.confidence * 100).toFixed(
          0
        )}% or severity "${riskAssessment.severityLevel}" is below the auto-execution threshold.`,
  };
}
