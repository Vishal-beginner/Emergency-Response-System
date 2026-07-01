import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_DIR = path.join(__dirname, "..", "..", "storage");
const LOG_FILE = path.join(STORE_DIR, "audit-log.jsonl");
const INCIDENTS_FILE = path.join(STORE_DIR, "incidents.json");

if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
if (!fs.existsSync(INCIDENTS_FILE)) fs.writeFileSync(INCIDENTS_FILE, "{}");

let entries = [];
try {
  if (fs.existsSync(LOG_FILE)) {
    entries = fs
      .readFileSync(LOG_FILE, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
} catch {
  entries = [];
}

let incidentArchive = {};
try {
  incidentArchive = JSON.parse(fs.readFileSync(INCIDENTS_FILE, "utf-8"));
} catch {
  incidentArchive = {};
}

let seq = entries.length;

/**
 * Append an immutable, timestamped audit entry. This is the single source of
 * truth for "explainable AI decisions" and the incident timeline requirement.
 */
export function record(incidentId, stage, message, data = {}) {
  const entry = {
    seq: ++seq,
    incidentId: incidentId ?? null,
    stage,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  entries.push(entry);
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  return entry;
}

export function getAllEntries() {
  return entries;
}

export function getEntriesForIncident(incidentId) {
  return entries.filter((e) => e.incidentId === incidentId);
}

export function archiveIncident(incident) {
  incidentArchive[incident.id] = incident;
  fs.writeFileSync(INCIDENTS_FILE, JSON.stringify(incidentArchive, null, 2));
}

export function getArchivedIncidents() {
  return Object.values(incidentArchive);
}
