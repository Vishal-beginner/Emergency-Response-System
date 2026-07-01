import { deviceState } from "./deviceOrchestration.js";

// Monitor stage: verify that executed device commands actually took effect,
// simulating the real-world possibility of a jammed lock, an offline
// controller, etc. A faulted device is left in an observable "fault:<value>"
// state so the dashboard shows it, then one automatic retry is attempted
// immediately (bounded remediation); the final outcome is reported so it can
// be logged to the audit trail either way.

const FAILURE_RATE = 0.08;

export function verifyExecution(commandResults) {
  const succeeded = [];
  const failed = [];

  for (const cmd of commandResults) {
    if (Math.random() >= FAILURE_RATE) {
      succeeded.push(cmd);
      continue;
    }

    deviceState[cmd.zoneId][cmd.device] = `fault:${cmd.value}`;

    if (Math.random() >= FAILURE_RATE) {
      deviceState[cmd.zoneId][cmd.device] = cmd.value;
      succeeded.push({ ...cmd, retried: true });
    } else {
      failed.push({ ...cmd, retried: true });
    }
  }

  return { succeeded, failed, allOk: failed.length === 0 };
}
