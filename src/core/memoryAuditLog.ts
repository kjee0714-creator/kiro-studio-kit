/**
 * memoryAuditLog.ts
 * Append-only audit trail for Dev Memory lifecycle events.
 * Records structured events to a separate JSONL file.
 * Uses existing jsonlLogger infrastructure.
 */

import { randomUUID } from "crypto";
import { appendJsonlRecord, readJsonlFile } from "./jsonlLogger.js";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export type MemoryAuditEventType =
  | "capture"
  | "capture_decision"
  | "promote"
  | "discard"
  | "quarantine"
  | "trust_update"
  | "usage_persist"
  | "usage_reset"
  | "manual_update"
  | "health_check"
  | "feedback";

export type MemoryAuditActor = "system" | "cli" | "auto_capture" | "prompt_generator" | "user";

export interface MemoryAuditEvent {
  id: string;
  memoryId?: string;
  timestamp: string;
  eventType: MemoryAuditEventType;
  actor: MemoryAuditActor;
  source?: string;
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUDIT_LOG_PATH = ".kiro/ksk/dev-memory-audit.jsonl";

export const VALID_AUDIT_EVENT_TYPES: readonly MemoryAuditEventType[] = [
  "capture", "capture_decision", "promote", "discard", "quarantine",
  "trust_update", "usage_persist", "usage_reset", "manual_update",
  "health_check", "feedback",
] as const;

export const VALID_AUDIT_ACTORS: readonly MemoryAuditActor[] = [
  "system", "cli", "auto_capture", "prompt_generator", "user",
] as const;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Append a new audit event to the audit log.
 * Generates UUID and timestamp automatically.
 */
export async function appendMemoryAuditEvent(
  event: Omit<MemoryAuditEvent, "id" | "timestamp">,
  options?: { auditPath?: string; now?: Date },
): Promise<MemoryAuditEvent> {
  const fullEvent: MemoryAuditEvent = {
    ...event,
    id: randomUUID(),
    timestamp: (options?.now ?? new Date()).toISOString(),
  };
  const auditPath = options?.auditPath ?? AUDIT_LOG_PATH;
  await appendJsonlRecord(auditPath, fullEvent, "AuditLog");
  return fullEvent;
}

/**
 * Read all audit events from the log file.
 * Returns empty array if file does not exist.
 * Skips malformed lines.
 */
export async function readMemoryAuditEvents(
  options?: { auditPath?: string },
): Promise<MemoryAuditEvent[]> {
  const auditPath = options?.auditPath ?? AUDIT_LOG_PATH;
  const raw = await readJsonlFile<MemoryAuditEvent>(auditPath);
  return raw.filter(e =>
    typeof e.id === "string" && e.id.length > 0 &&
    typeof e.timestamp === "string" && e.timestamp.length > 0 &&
    typeof e.eventType === "string" &&
    typeof e.actor === "string"
  );
}

/**
 * Find all audit events for a specific memory entry ID.
 * Returns events in chronological order (oldest first).
 */
export async function findMemoryAuditEvents(
  memoryId: string,
  options?: { auditPath?: string },
): Promise<MemoryAuditEvent[]> {
  const events = await readMemoryAuditEvents(options);
  return events
    .filter(e => e.memoryId === memoryId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
