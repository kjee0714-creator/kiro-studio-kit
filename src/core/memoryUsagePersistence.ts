/**
 * memoryUsagePersistence.ts
 * Bridges the pure recordMemorySelection function with the JSONL store.
 * Reads store → applies pure function → rewrites store with updated usage stats.
 */

import type { DevMemoryEntry } from "./memoryValidator.js";
import { readMemoryEntries, rewriteMemoryEntries } from "./memoryStore.js";
import { recordMemorySelection, recordMemorySelectionSuccess, recordMemorySelectionRejection } from "./memoryTrust.js";
import { appendMemoryAuditEvent } from "./memoryAuditLog.js";

export interface UsagePersistenceResult {
  updatedIds: string[];
  skippedIds: string[];
  errors: Array<{ id: string; reason: string }>;
}

export interface MemoryFeedbackResult {
  updatedId?: string;
  error?: string;
}

/**
 * Persist memory selection events to the JSONL store.
 * Reads the current store, applies recordMemorySelection to each eligible entry,
 * and rewrites the store with updated entries in a single batch.
 *
 * Entries are skipped if they are:
 * - Not found in the store
 * - Disabled (enabled === false)
 * - Deleted (deleted === true)
 * - Quarantined (captureStatus === "quarantined")
 */
export async function persistMemorySelections(
  selectedEntries: DevMemoryEntry[],
  options?: { now?: Date; storePath?: string },
): Promise<UsagePersistenceResult> {
  const now = options?.now ?? new Date();
  const result: UsagePersistenceResult = { updatedIds: [], skippedIds: [], errors: [] };

  const storeEntries = await readMemoryEntries(options?.storePath);

  // Deduplicate selectedEntries by ID — same memory selected multiple times counts as +1
  const processedIds = new Set<string>();

  for (const selected of selectedEntries) {
    if (processedIds.has(selected.id)) {
      continue;
    }
    processedIds.add(selected.id);

    const storeIndex = storeEntries.findIndex((e) => e.id === selected.id);

    if (storeIndex === -1) {
      result.skippedIds.push(selected.id);
      continue;
    }

    const storeEntry = storeEntries[storeIndex];

    // Skip ineligible entries
    if (
      storeEntry.enabled === false ||
      storeEntry.deleted === true ||
      storeEntry.captureStatus === "quarantined"
    ) {
      result.skippedIds.push(selected.id);
      continue;
    }

    try {
      const updated = recordMemorySelection(storeEntry, now);
      storeEntries[storeIndex] = updated;
      result.updatedIds.push(selected.id);

      try {
        await appendMemoryAuditEvent({
          eventType: "usage_persist",
          actor: "prompt_generator",
          memoryId: selected.id,
          source: "memoryUsagePersistence.persistMemorySelections",
          before: {
            selectedCount: storeEntry.usageStats?.selectedCount ?? 0,
            lastSelectedAt: storeEntry.usageStats?.lastSelectedAt ?? null,
          },
          after: {
            selectedCount: updated.usageStats?.selectedCount ?? 0,
            lastSelectedAt: updated.usageStats?.lastSelectedAt ?? null,
          },
        });
      } catch {
        // Audit failure must not stop persistence
      }
    } catch (err) {
      result.errors.push({
        id: selected.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Single batch rewrite
  await rewriteMemoryEntries(storeEntries, options?.storePath);

  return result;
}

/**
 * Mark a memory selection as successful.
 * Reads store, finds entry, checks eligibility, applies pure function, rewrites, audits.
 * Deleted entries are rejected. Quarantined entries are allowed.
 */
export async function markMemorySelectionSuccess(
  id: string,
  options?: { now?: Date; storePath?: string; reason?: string },
): Promise<MemoryFeedbackResult> {
  const now = options?.now ?? new Date();
  const storeEntries = await readMemoryEntries(options?.storePath);
  const entry = storeEntries.find((e) => e.id === id);

  if (!entry) return { error: "not_found" };
  if (entry.deleted === true) return { error: "entry_deleted" };

  const beforeStats = entry.usageStats
    ? { ...entry.usageStats }
    : { selectedCount: 0, successfulSelections: 0, rejectedSelections: 0 };

  const updated = recordMemorySelectionSuccess(entry, now);
  const idx = storeEntries.findIndex((e) => e.id === id);
  storeEntries[idx] = updated;

  await rewriteMemoryEntries(storeEntries, options?.storePath);

  try {
    await appendMemoryAuditEvent({
      eventType: "feedback",
      actor: "cli",
      memoryId: id,
      source: "memoryUsagePersistence.markMemorySelectionSuccess",
      reason: options?.reason,
      before: beforeStats as Record<string, unknown>,
      after: updated.usageStats as unknown as Record<string, unknown>,
      metadata: { feedback: "success" },
    });
  } catch {
    // Audit failure must not stop persistence
  }

  return { updatedId: id };
}

/**
 * Mark a memory selection as rejected.
 * Reads store, finds entry, checks eligibility, applies pure function, rewrites, audits.
 * Deleted entries are rejected. Quarantined entries are allowed.
 */
export async function markMemorySelectionRejected(
  id: string,
  options?: { now?: Date; storePath?: string; reason?: string },
): Promise<MemoryFeedbackResult> {
  const now = options?.now ?? new Date();
  const storeEntries = await readMemoryEntries(options?.storePath);
  const entry = storeEntries.find((e) => e.id === id);

  if (!entry) return { error: "not_found" };
  if (entry.deleted === true) return { error: "entry_deleted" };

  const beforeStats = entry.usageStats
    ? { ...entry.usageStats }
    : { selectedCount: 0, successfulSelections: 0, rejectedSelections: 0 };

  const updated = recordMemorySelectionRejection(entry, now);
  const idx = storeEntries.findIndex((e) => e.id === id);
  storeEntries[idx] = updated;

  await rewriteMemoryEntries(storeEntries, options?.storePath);

  try {
    await appendMemoryAuditEvent({
      eventType: "feedback",
      actor: "cli",
      memoryId: id,
      source: "memoryUsagePersistence.markMemorySelectionRejected",
      reason: options?.reason,
      before: beforeStats as Record<string, unknown>,
      after: updated.usageStats as unknown as Record<string, unknown>,
      metadata: { feedback: "rejected" },
    });
  } catch {
    // Audit failure must not stop persistence
  }

  return { updatedId: id };
}
