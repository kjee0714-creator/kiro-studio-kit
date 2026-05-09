/**
 * memoryDuplicate.ts
 * Duplicate management for DevMemoryEntry.
 * Provides helpers for duplicate detection and persistence operations.
 * No automatic semantic detection — all operations are explicit.
 */

import type { DevMemoryEntry } from "./memoryValidator.js";
import { readMemoryEntries, rewriteMemoryEntries } from "./memoryStore.js";
import { appendMemoryAuditEvent } from "./memoryAuditLog.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarkDuplicateResult {
  canonicalEntry: DevMemoryEntry;
  duplicateEntry: DevMemoryEntry;
  auditSuccess: boolean;
}

export interface ClearDuplicateResult {
  canonicalEntry?: DevMemoryEntry;
  duplicateEntry: DevMemoryEntry;
  auditSuccess: boolean;
}

// ---------------------------------------------------------------------------
// Pure Helper Functions
// ---------------------------------------------------------------------------

/** Check if an entry is marked as a duplicate. */
export function isDuplicateMemory(entry: DevMemoryEntry): boolean {
  return typeof entry.duplicateOf === "string" && entry.duplicateOf.length > 0;
}

/** Check if an entry has been merged into another. */
export function isMergedMemory(entry: DevMemoryEntry): boolean {
  return typeof entry.mergedInto === "string" && entry.mergedInto.length > 0;
}

/** Get the canonical memory ID for a duplicate or merged entry. */
export function getCanonicalMemoryId(entry: DevMemoryEntry): string | undefined {
  if (isDuplicateMemory(entry)) return entry.duplicateOf;
  if (isMergedMemory(entry)) return entry.mergedInto;
  return undefined;
}

/** List all duplicate groups from entries. */
export function listDuplicateGroups(
  entries: DevMemoryEntry[],
): Array<{ canonicalId: string; duplicateIds: string[] }> {
  const groups = new Map<string, Set<string>>();

  for (const entry of entries) {
    // From canonical side
    if (entry.duplicates && entry.duplicates.length > 0) {
      const existing = groups.get(entry.id) ?? new Set<string>();
      for (const dupId of entry.duplicates) {
        existing.add(dupId);
      }
      groups.set(entry.id, existing);
    }
    // From duplicate side
    if (entry.duplicateOf && entry.duplicateOf.length > 0) {
      const existing = groups.get(entry.duplicateOf) ?? new Set<string>();
      existing.add(entry.id);
      groups.set(entry.duplicateOf, existing);
    }
  }

  return Array.from(groups.entries()).map(([canonicalId, dupSet]) => ({
    canonicalId,
    duplicateIds: Array.from(dupSet),
  }));
}

/** Find duplicate info for a specific entry. */
export function findDuplicateInfo(
  entries: DevMemoryEntry[],
  id: string,
): { entry?: DevMemoryEntry; role: "canonical" | "duplicate" | "merged" | "none"; canonicalId?: string; duplicateIds: string[] } {
  const entry = entries.find(e => e.id === id);
  if (!entry) return { role: "none", duplicateIds: [] };

  if (isMergedMemory(entry)) {
    return { entry, role: "merged", canonicalId: entry.mergedInto, duplicateIds: [] };
  }
  if (isDuplicateMemory(entry)) {
    return { entry, role: "duplicate", canonicalId: entry.duplicateOf, duplicateIds: [] };
  }
  if (entry.duplicates && entry.duplicates.length > 0) {
    return { entry, role: "canonical", duplicateIds: entry.duplicates };
  }
  return { entry, role: "none", duplicateIds: [] };
}

// ---------------------------------------------------------------------------
// Persistence Functions
// ---------------------------------------------------------------------------

/**
 * Mark an entry as a duplicate of a canonical entry.
 * Never physically deletes entries.
 */
export async function markMemoryDuplicate(
  canonicalId: string,
  duplicateId: string,
  options?: { storePath?: string; reason?: string },
): Promise<MarkDuplicateResult> {
  if (canonicalId === duplicateId) {
    throw new Error("Cannot mark an entry as duplicate of itself");
  }

  const entries = await readMemoryEntries(options?.storePath);
  const canonicalEntry = entries.find(e => e.id === canonicalId);
  const duplicateEntry = entries.find(e => e.id === duplicateId);

  if (!canonicalEntry) throw new Error(`Entry not found: ${canonicalId}`);
  if (!duplicateEntry) throw new Error(`Entry not found: ${duplicateId}`);

  // Update duplicate entry
  duplicateEntry.duplicateOf = canonicalId;
  duplicateEntry.enabled = false;
  duplicateEntry.disabledReason = "duplicate";

  // Update canonical entry
  if (!canonicalEntry.duplicates) {
    canonicalEntry.duplicates = [];
  }
  if (!canonicalEntry.duplicates.includes(duplicateId)) {
    canonicalEntry.duplicates.push(duplicateId);
  }

  await rewriteMemoryEntries(entries, options?.storePath);

  // Audit (non-blocking)
  let auditSuccess = true;
  try {
    await appendMemoryAuditEvent({
      eventType: "manual_update",
      actor: "cli",
      memoryId: duplicateId,
      source: "memoryDuplicate.markMemoryDuplicate",
      reason: options?.reason ?? `Marked as duplicate of ${canonicalId}`,
      before: { duplicateOf: undefined, enabled: true, disabledReason: undefined },
      after: { duplicateOf: canonicalId, enabled: false, disabledReason: "duplicate" },
      metadata: { operation: "mark_duplicate", canonicalId, duplicateId },
    });
  } catch {
    auditSuccess = false;
  }

  return { canonicalEntry, duplicateEntry, auditSuccess };
}

/**
 * Clear a duplicate relationship.
 * Does NOT re-enable by default.
 */
export async function clearMemoryDuplicate(
  duplicateId: string,
  options?: { storePath?: string; reason?: string; reEnable?: boolean },
): Promise<ClearDuplicateResult> {
  const entries = await readMemoryEntries(options?.storePath);
  const duplicateEntry = entries.find(e => e.id === duplicateId);

  if (!duplicateEntry) throw new Error(`Entry not found: ${duplicateId}`);
  if (!duplicateEntry.duplicateOf) throw new Error(`Entry ${duplicateId} is not marked as a duplicate`);

  const canonicalId = duplicateEntry.duplicateOf;
  const canonicalEntry = entries.find(e => e.id === canonicalId);

  // Clear duplicate fields
  delete duplicateEntry.duplicateOf;
  if (duplicateEntry.disabledReason === "duplicate") {
    delete duplicateEntry.disabledReason;
  }
  if (options?.reEnable) {
    duplicateEntry.enabled = true;
  }

  // Remove from canonical's duplicates array
  if (canonicalEntry?.duplicates) {
    canonicalEntry.duplicates = canonicalEntry.duplicates.filter(id => id !== duplicateId);
  }

  await rewriteMemoryEntries(entries, options?.storePath);

  // Audit (non-blocking)
  let auditSuccess = true;
  try {
    await appendMemoryAuditEvent({
      eventType: "manual_update",
      actor: "cli",
      memoryId: duplicateId,
      source: "memoryDuplicate.clearMemoryDuplicate",
      reason: options?.reason ?? `Cleared duplicate relation with ${canonicalId}`,
      before: { duplicateOf: canonicalId, disabledReason: "duplicate" },
      after: { duplicateOf: undefined, disabledReason: undefined, enabled: options?.reEnable ?? false },
      metadata: { operation: "clear_duplicate", duplicateId, canonicalId, reEnable: options?.reEnable ?? false },
    });
  } catch {
    auditSuccess = false;
  }

  return { canonicalEntry, duplicateEntry, auditSuccess };
}
