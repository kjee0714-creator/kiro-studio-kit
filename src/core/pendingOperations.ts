/**
 * pendingOperations.ts
 * Pure functions for pending memory operations (promote, discard, prune, stats).
 * No side effects, no I/O — all functions are deterministic given the same inputs.
 */

import type { DevMemoryEntry } from "./memoryValidator.js";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface PendingPromoteResult {
  promoted: DevMemoryEntry[];
  remaining: DevMemoryEntry[];
}

export interface PendingDiscardResult {
  updated: DevMemoryEntry[];
  discardedEntry: DevMemoryEntry;
}

export interface PendingPruneCandidate {
  entry: DevMemoryEntry;
  ageInDays: number;
}

export interface PendingStatsResult {
  pendingCount: number;
  oldPendingCount: number;
  oldestPendingAt: string | null;
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Check if a pending store entry is promotable (not deleted, not discarded).
 * This function is intended ONLY for entries read from the Pending_Store
 * (`.kiro/ksk/dev-memory.pending.jsonl`). Do NOT use it to interpret
 * active store entries as pending.
 */
export function isPendingEntry(entry: DevMemoryEntry): boolean {
  return entry.deleted !== true && entry.captureStatus !== "discarded";
}

/**
 * Promote a single pending entry. Returns new entry with promotion fields.
 * Pure function — does not mutate input.
 */
export function promotePendingEntry(entry: DevMemoryEntry, now?: Date): DevMemoryEntry {
  const timestamp = (now ?? new Date()).toISOString();
  return {
    ...entry,
    captureStatus: "active",
    enabled: true,
    trustLevel: "probation",
    authority: "hint",
    promotedAt: timestamp,
  };
}

/**
 * Promote all promotable pending entries.
 * Returns promoted entries and remaining (deleted/discarded) entries.
 */
export function promoteAllPendingEntries(entries: DevMemoryEntry[], now?: Date): PendingPromoteResult {
  const promoted: DevMemoryEntry[] = [];
  const remaining: DevMemoryEntry[] = [];
  for (const entry of entries) {
    if (isPendingEntry(entry)) {
      promoted.push(promotePendingEntry(entry, now));
    } else {
      remaining.push(entry);
    }
  }
  return { promoted, remaining };
}

/**
 * Discard a pending entry by ID. Sets captureStatus = "discarded".
 * Returns updated entries array and the discarded entry.
 * Throws if entry not found, is deleted, or is already discarded.
 */
export function discardPendingEntry(entries: DevMemoryEntry[], id: string): PendingDiscardResult {
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) throw new Error("not_found");
  const entry = entries[idx];
  if (entry.deleted === true) throw new Error("entry_deleted");
  if (entry.captureStatus === "discarded") throw new Error("already_discarded");

  const discardedEntry: DevMemoryEntry = { ...entry, captureStatus: "discarded" };
  const updated = [...entries];
  updated[idx] = discardedEntry;
  return { updated, discardedEntry };
}

/**
 * Identify promotable pending entries older than thresholdDays.
 * Excludes deleted and already-discarded entries.
 */
export function classifyPrunePendingCandidates(
  entries: DevMemoryEntry[],
  thresholdDays?: number,
  now?: Date,
): PendingPruneCandidate[] {
  const threshold = thresholdDays ?? 30;
  const currentTime = (now ?? new Date()).getTime();
  const thresholdMs = threshold * 24 * 60 * 60 * 1000;
  const candidates: PendingPruneCandidate[] = [];

  for (const entry of entries) {
    if (!isPendingEntry(entry)) continue;
    if (!entry.createdAt) continue;
    const ageMs = currentTime - new Date(entry.createdAt).getTime();
    if (ageMs > thresholdMs) {
      candidates.push({ entry, ageInDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)) });
    }
  }
  return candidates;
}

/**
 * Apply discard to candidate entries by ID.
 * Returns the full updated entries array with candidates' captureStatus set to "discarded".
 */
export function applyPrunePendingEntries(entries: DevMemoryEntry[], candidateIds: string[]): DevMemoryEntry[] {
  const idSet = new Set(candidateIds);
  return entries.map(e => idSet.has(e.id) ? { ...e, captureStatus: "discarded" as const } : e);
}

/**
 * Compute pending store statistics.
 * Only counts promotable entries (not deleted, not discarded).
 */
export function computePendingStats(entries: DevMemoryEntry[], now?: Date): PendingStatsResult {
  const currentTime = (now ?? new Date()).getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const promotable = entries.filter(isPendingEntry);

  let oldestPendingAt: string | null = null;
  let oldPendingCount = 0;

  for (const entry of promotable) {
    if (entry.createdAt) {
      if (!oldestPendingAt || entry.createdAt < oldestPendingAt) {
        oldestPendingAt = entry.createdAt;
      }
      const ageMs = currentTime - new Date(entry.createdAt).getTime();
      if (ageMs > thirtyDaysMs) oldPendingCount++;
    }
  }

  return { pendingCount: promotable.length, oldPendingCount, oldestPendingAt };
}
