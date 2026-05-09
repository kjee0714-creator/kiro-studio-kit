/**
 * memoryDecay.ts
 * Decay / expiry / stale review for DevMemoryEntry.
 * No automatic deletion or trust downgrade — explicit operations only.
 */

import type { DevMemoryEntry } from "./memoryValidator.js";
import { readMemoryEntries, rewriteMemoryEntries } from "./memoryStore.js";
import { appendMemoryAuditEvent } from "./memoryAuditLog.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryDecayStatus {
  id: string;
  expired: boolean;
  stale: boolean;
  reviewDue: boolean;
  reason: string;
}

export interface MemoryDecayConfig {
  defaultStaleAfterDays: number;
  temporaryMaxAgeDays: number;
  now?: Date;
}

export interface MemoryDecayOperationResult {
  updatedIds: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_MEMORY_DECAY_CONFIG: MemoryDecayConfig = {
  defaultStaleAfterDays: 90,
  temporaryMaxAgeDays: 14,
};

// ---------------------------------------------------------------------------
// Pure Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if an entry is expired (expiresAt < now).
 * Returns false if expiresAt is missing or invalid.
 */
export function isExpiredMemory(entry: DevMemoryEntry, now?: Date): boolean {
  if (!entry.expiresAt) return false;
  const expiryTime = new Date(entry.expiresAt).getTime();
  if (isNaN(expiryTime)) return false;
  const currentTime = (now ?? new Date()).getTime();
  return expiryTime < currentTime;
}

/**
 * Check if an entry is stale (not reviewed within staleAfterDays).
 * Uses lastReviewedAt or createdAt as the reference date.
 */
export function isStaleMemory(
  entry: DevMemoryEntry,
  config?: Partial<MemoryDecayConfig>,
): boolean {
  const cfg = { ...DEFAULT_MEMORY_DECAY_CONFIG, ...config };
  const now = cfg.now ?? new Date();
  const staleAfterDays = entry.staleAfterDays ?? cfg.defaultStaleAfterDays;

  const referenceDate = entry.lastReviewedAt ?? entry.createdAt;
  const refTime = new Date(referenceDate).getTime();
  if (isNaN(refTime)) return false;

  const ageMs = now.getTime() - refTime;
  const staleLimitMs = staleAfterDays * 24 * 60 * 60 * 1000;
  return ageMs > staleLimitMs;
}

/**
 * Check if an entry is due for review.
 * True if expired, stale, or temporary without expiresAt.
 */
export function isReviewDueMemory(
  entry: DevMemoryEntry,
  config?: Partial<MemoryDecayConfig>,
): boolean {
  if (isExpiredMemory(entry, config?.now)) return true;
  if (isStaleMemory(entry, config)) return true;
  if (entry.scope === "temporary" && !entry.expiresAt) return true;
  return false;
}

/**
 * Get full decay status for an entry.
 */
export function getMemoryDecayStatus(
  entry: DevMemoryEntry,
  config?: Partial<MemoryDecayConfig>,
): MemoryDecayStatus {
  const expired = isExpiredMemory(entry, config?.now);
  const stale = isStaleMemory(entry, config);
  const reviewDue = isReviewDueMemory(entry, config);

  let reason = "OK";
  if (expired) reason = "Expired";
  else if (stale) reason = "Stale — needs review";
  else if (entry.scope === "temporary" && !entry.expiresAt) reason = "Temporary without expiry";

  return { id: entry.id, expired, stale, reviewDue, reason };
}

// ---------------------------------------------------------------------------
// Persistence Functions
// ---------------------------------------------------------------------------

/**
 * Mark entries as reviewed (set lastReviewedAt to now).
 */
export async function markMemoryReviewed(
  ids: string[],
  options?: { storePath?: string; now?: Date; reason?: string },
): Promise<MemoryDecayOperationResult> {
  if (ids.length === 0) throw new Error("At least 1 entry ID is required");

  const entries = await readMemoryEntries(options?.storePath);
  for (const id of ids) {
    if (!entries.find(e => e.id === id)) throw new Error(`Entry not found: ${id}`);
  }

  const timestamp = (options?.now ?? new Date()).toISOString();
  const idSet = new Set(ids);
  for (const entry of entries) {
    if (idSet.has(entry.id)) {
      entry.lastReviewedAt = timestamp;
    }
  }

  await rewriteMemoryEntries(entries, options?.storePath);

  try {
    await appendMemoryAuditEvent({
      eventType: "manual_update",
      actor: "cli",
      source: "memoryDecay.markMemoryReviewed",
      reason: options?.reason ?? "Marked as reviewed",
      metadata: { operation: "mark_reviewed", ids },
    });
  } catch { /* non-blocking */ }

  return { updatedIds: ids };
}

/**
 * Set expiry date on entries.
 */
export async function setMemoryExpiry(
  ids: string[],
  expiresAt: string,
  options?: { storePath?: string; reason?: string },
): Promise<MemoryDecayOperationResult> {
  if (ids.length === 0) throw new Error("At least 1 entry ID is required");
  if (isNaN(new Date(expiresAt).getTime())) throw new Error("Invalid expiresAt date");

  const entries = await readMemoryEntries(options?.storePath);
  for (const id of ids) {
    if (!entries.find(e => e.id === id)) throw new Error(`Entry not found: ${id}`);
  }

  const idSet = new Set(ids);
  for (const entry of entries) {
    if (idSet.has(entry.id)) {
      entry.expiresAt = expiresAt;
    }
  }

  await rewriteMemoryEntries(entries, options?.storePath);

  try {
    await appendMemoryAuditEvent({
      eventType: "manual_update",
      actor: "cli",
      source: "memoryDecay.setMemoryExpiry",
      reason: options?.reason ?? `Set expiry: ${expiresAt}`,
      metadata: { operation: "set_expiry", ids, expiresAt },
    });
  } catch { /* non-blocking */ }

  return { updatedIds: ids };
}

/**
 * Disable all expired memories.
 * dry-run: returns candidates without modifying store/audit.
 */
export async function disableExpiredMemories(
  options?: { storePath?: string; now?: Date; dryRun?: boolean; reason?: string },
): Promise<MemoryDecayOperationResult & { candidateIds: string[] }> {
  const now = options?.now ?? new Date();
  const entries = await readMemoryEntries(options?.storePath);

  const candidates = entries.filter(e =>
    e.enabled !== false && e.deleted !== true && isExpiredMemory(e, now),
  );
  const candidateIds = candidates.map(e => e.id);

  if (options?.dryRun || candidateIds.length === 0) {
    return { updatedIds: [], candidateIds };
  }

  for (const entry of candidates) {
    entry.enabled = false;
    entry.disabledReason = "expired";
  }

  await rewriteMemoryEntries(entries, options?.storePath);

  for (const entry of candidates) {
    try {
      await appendMemoryAuditEvent({
        eventType: "manual_update",
        actor: "cli",
        memoryId: entry.id,
        source: "memoryDecay.disableExpiredMemories",
        reason: options?.reason ?? "Disabled due to expiry",
        before: { enabled: true, disabledReason: undefined },
        after: { enabled: false, disabledReason: "expired" },
        metadata: { operation: "disable_expired", id: entry.id },
      });
    } catch { /* non-blocking */ }
  }

  return { updatedIds: candidateIds, candidateIds };
}
