/**
 * memoryConflict.ts
 * Conflict management for DevMemoryEntry.
 * Provides helpers for supersession detection, conflict group resolution,
 * and persistence operations for supersede/group assignment.
 *
 * No automatic conflict detection — all operations are explicit.
 */

import type { DevMemoryEntry } from "./memoryValidator.js";
import { readMemoryEntries, rewriteMemoryEntries } from "./memoryStore.js";
import { appendMemoryAuditEvent } from "./memoryAuditLog.js";
import { getTrustPriority } from "./memoryInjectionPolicy.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SupersedeResult {
  oldEntry: DevMemoryEntry;
  newEntry: DevMemoryEntry;
  auditSuccess: boolean;
}

export interface SetConflictGroupResult {
  updatedIds: string[];
  conflictKey: string;
  auditSuccess: boolean;
}

// ---------------------------------------------------------------------------
// Pure Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if an entry is superseded (has a non-empty supersededBy field).
 * Pure function.
 */
export function isSupersededMemory(entry: DevMemoryEntry): boolean {
  return typeof entry.supersededBy === "string" && entry.supersededBy.length > 0;
}

/**
 * Group entries by their conflictKey.
 * Entries without a conflictKey are not included in the result.
 * Pure function.
 */
export function groupByConflictGroup(
  entries: DevMemoryEntry[],
): Map<string, DevMemoryEntry[]> {
  const groups = new Map<string, DevMemoryEntry[]>();
  for (const entry of entries) {
    if (entry.conflictKey && entry.conflictKey.length > 0) {
      const group = groups.get(entry.conflictKey) ?? [];
      group.push(entry);
      groups.set(entry.conflictKey, group);
    }
  }
  return groups;
}

/**
 * Select conflict winners from entries.
 * For each conflict group (entries sharing the same conflictKey),
 * selects the entry with the highest trust priority.
 * Ties are broken by original array order (stable — first wins).
 * Returns a Set of winner entry IDs.
 * Pure function.
 */
export function selectConflictWinners(
  entries: DevMemoryEntry[],
): Set<string> {
  const groups = groupByConflictGroup(entries);
  const winnerIds = new Set<string>();

  for (const [, group] of groups) {
    if (group.length === 0) continue;
    let winner = group[0];
    let winnerPriority = getTrustPriority(winner);
    for (let i = 1; i < group.length; i++) {
      const priority = getTrustPriority(group[i]);
      if (priority > winnerPriority) {
        winner = group[i];
        winnerPriority = priority;
      }
    }
    winnerIds.add(winner.id);
  }

  return winnerIds;
}

// ---------------------------------------------------------------------------
// Persistence Functions
// ---------------------------------------------------------------------------

/**
 * Supersede an older entry with a newer one.
 * - Sets older entry: enabled=false, disabledReason="superseded", supersededBy=newerId
 * - Sets newer entry: supersedes=[...existing, oldId]
 * - Persists via rewriteMemoryEntries
 * - Emits audit event (non-blocking)
 *
 * Throws if oldId or newerId not found.
 * Never physically deletes entries.
 */
export async function supersedeMemory(
  oldId: string,
  newerId: string,
  storePath?: string,
): Promise<SupersedeResult> {
  if (oldId === newerId) {
    throw new Error("Cannot supersede an entry with itself");
  }

  const entries = await readMemoryEntries(storePath);
  const oldEntry = entries.find(e => e.id === oldId);
  const newEntry = entries.find(e => e.id === newerId);

  if (!oldEntry) {
    throw new Error(`Entry not found: ${oldId}`);
  }
  if (!newEntry) {
    throw new Error(`Entry not found: ${newerId}`);
  }

  // Update older entry
  oldEntry.enabled = false;
  oldEntry.disabledReason = "superseded";
  oldEntry.supersededBy = newerId;

  // Update newer entry
  if (!newEntry.supersedes) {
    newEntry.supersedes = [];
  }
  if (!newEntry.supersedes.includes(oldId)) {
    newEntry.supersedes.push(oldId);
  }

  await rewriteMemoryEntries(entries, storePath);

  // Audit event (non-blocking)
  let auditSuccess = true;
  try {
    await appendMemoryAuditEvent({
      eventType: "manual_update",
      actor: "cli",
      memoryId: oldId,
      source: "memoryConflict.supersedeMemory",
      reason: `Superseded by ${newerId}`,
      before: { enabled: true, supersededBy: undefined },
      after: { enabled: false, supersededBy: newerId, disabledReason: "superseded" },
      metadata: { operation: "supersede", oldId, newerId },
    });
  } catch {
    auditSuccess = false;
  }

  return { oldEntry, newEntry, auditSuccess };
}

/**
 * Assign a conflict group key to multiple entries.
 * - Sets conflictKey on each specified entry
 * - Requires at least 2 IDs
 * - Throws if any ID not found
 * - Persists via rewriteMemoryEntries
 * - Emits audit event (non-blocking)
 */
export async function setMemoryConflictGroup(
  conflictKey: string,
  ids: string[],
  storePath?: string,
): Promise<SetConflictGroupResult> {
  if (!conflictKey || conflictKey.trim().length === 0) {
    throw new Error("conflictKey must not be empty");
  }
  if (ids.length < 2) {
    throw new Error("At least 2 entry IDs are required for a conflict group");
  }

  const entries = await readMemoryEntries(storePath);

  // Validate all IDs exist
  for (const id of ids) {
    const entry = entries.find(e => e.id === id);
    if (!entry) {
      throw new Error(`Entry not found: ${id}`);
    }
  }

  // Set conflictKey on each entry
  const idSet = new Set(ids);
  for (const entry of entries) {
    if (idSet.has(entry.id)) {
      entry.conflictKey = conflictKey;
    }
  }

  await rewriteMemoryEntries(entries, storePath);

  // Audit event (non-blocking)
  let auditSuccess = true;
  try {
    await appendMemoryAuditEvent({
      eventType: "manual_update",
      actor: "cli",
      source: "memoryConflict.setMemoryConflictGroup",
      reason: `Set conflict group: ${conflictKey}`,
      metadata: { operation: "set_conflict_group", conflictKey, ids },
    });
  } catch {
    auditSuccess = false;
  }

  return { updatedIds: ids, conflictKey, auditSuccess };
}
