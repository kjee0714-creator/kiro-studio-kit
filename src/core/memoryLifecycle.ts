/**
 * memoryLifecycle.ts
 * Pure lifecycle functions for DevMemoryEntry management.
 * No side effects — all functions are deterministic given the same inputs.
 */

import type { DevMemoryEntry } from "./memoryValidator.js";

/** Classification result for a single entry */
export interface PruneClassification {
  entry: DevMemoryEntry;
  reason: "deleted" | "disabled" | "expired" | "superseded" | "stale";
}

/** A single lifecycle event */
export interface LifecycleEvent {
  timestamp: string;
  event: "created" | "disabled" | "deleted" | "superseded";
  detail?: string;
}

/** 180 days in milliseconds */
const STALE_THRESHOLD_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Check if an entry is superseded by any other entry in the set.
 */
function isSuperseded(entry: DevMemoryEntry, allEntries: DevMemoryEntry[]): boolean {
  return allEntries.some(
    (other) => other.supersedes?.includes(entry.id) ?? false,
  );
}

/**
 * Classify entries as prune candidates. Pure function.
 * An entry is a prune candidate if ANY of (first match wins):
 * - deleted === true
 * - enabled === false
 * - expiresAt is in the past
 * - superseded by another entry in the set
 * - older than 180 days AND severity === "low" AND confidence === "low"
 */
export function classifyPruneCandidates(
  entries: DevMemoryEntry[],
  now?: Date,
): PruneClassification[] {
  const currentTime = (now ?? new Date()).getTime();
  const candidates: PruneClassification[] = [];

  for (const entry of entries) {
    if (entry.deleted === true) {
      candidates.push({ entry, reason: "deleted" });
    } else if (entry.enabled === false) {
      candidates.push({ entry, reason: "disabled" });
    } else if (entry.expiresAt && new Date(entry.expiresAt).getTime() < currentTime) {
      candidates.push({ entry, reason: "expired" });
    } else if (isSuperseded(entry, entries)) {
      candidates.push({ entry, reason: "superseded" });
    } else {
      const age = currentTime - new Date(entry.createdAt).getTime();
      if (age > STALE_THRESHOLD_MS && entry.severity === "low" && entry.confidence === "low") {
        candidates.push({ entry, reason: "stale" });
      }
    }
  }

  return candidates;
}

/**
 * Derive lifecycle events from an entry's current state and the full entry set.
 * Events are returned in chronological order (non-decreasing timestamp).
 * Pure function — no side effects.
 */
export function deriveHistory(
  entry: DevMemoryEntry,
  allEntries: DevMemoryEntry[],
): LifecycleEvent[] {
  const events: LifecycleEvent[] = [];

  // Created event
  events.push({ timestamp: entry.createdAt, event: "created" });

  // Disabled event (if currently disabled)
  if (entry.enabled === false) {
    events.push({ timestamp: entry.createdAt, event: "disabled", detail: "currently disabled" });
  }

  // Deleted event (from deletedAt or createdAt)
  if (entry.deleted === true) {
    events.push({ timestamp: entry.deletedAt ?? entry.createdAt, event: "deleted" });
  }

  // Superseded events (from other entries' supersedes arrays)
  for (const other of allEntries) {
    if (other.supersedes?.includes(entry.id)) {
      events.push({ timestamp: other.createdAt, event: "superseded", detail: `by ${other.id}` });
    }
  }

  // Sort chronologically (non-decreasing timestamp order)
  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return events;
}
