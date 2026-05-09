/**
 * memoryDoctor.ts
 * Detects and repairs integrity issues in the memory store.
 * Conservative: only repairs safe issues; never deletes; never changes trust.
 */

import type { DevMemoryEntry } from "./memoryValidator.js";
import { readMemoryEntries, rewriteMemoryEntries } from "./memoryStore.js";
import { appendMemoryAuditEvent } from "./memoryAuditLog.js";
import { isExpiredMemory } from "./memoryDecay.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryIssueSeverity = "info" | "warning" | "error";

export type MemoryIssueType =
  | "missing_supersede_target"
  | "missing_duplicate_target"
  | "missing_merge_target"
  | "invalid_conflict_group"
  | "duplicate_relation_mismatch"
  | "enabled_disabled_mismatch"
  | "expired_but_enabled"
  | "temporary_without_expiry"
  | "circular_supersede"
  | "circular_duplicate"
  | "invalid_scope"
  | "stale_unreviewed";

export interface MemoryDoctorIssue {
  id: string;
  type: MemoryIssueType;
  severity: MemoryIssueSeverity;
  message: string;
  repairable: boolean;
}

export interface MemoryDoctorReport {
  scannedCount: number;
  issueCount: number;
  repairableCount: number;
  issues: MemoryDoctorIssue[];
}

export interface MemoryRepairResult {
  updatedIds: string[];
  skippedIds: string[];
  repairedCount: number;
  issueCount: number;
}

// ---------------------------------------------------------------------------
// Detection (Pure Function)
// ---------------------------------------------------------------------------

/**
 * Detect integrity issues in memory entries.
 * Pure function — does not mutate input.
 */
export function detectMemoryIssues(
  entries: DevMemoryEntry[],
  now?: Date,
): MemoryDoctorReport {
  const issues: MemoryDoctorIssue[] = [];
  const idSet = new Set(entries.map(e => e.id));

  for (const entry of entries) {
    // missing_supersede_target
    if (entry.supersededBy && !idSet.has(entry.supersededBy)) {
      issues.push({ id: entry.id, type: "missing_supersede_target", severity: "warning", message: `supersededBy references non-existent ID: ${entry.supersededBy}`, repairable: true });
    }

    // missing_duplicate_target
    if (entry.duplicateOf && entry.duplicateOf.length > 0 && !idSet.has(entry.duplicateOf)) {
      issues.push({ id: entry.id, type: "missing_duplicate_target", severity: "warning", message: `duplicateOf references non-existent ID: ${entry.duplicateOf}`, repairable: true });
    }

    // missing_merge_target
    if (entry.mergedInto && entry.mergedInto.length > 0 && !idSet.has(entry.mergedInto)) {
      issues.push({ id: entry.id, type: "missing_merge_target", severity: "warning", message: `mergedInto references non-existent ID: ${entry.mergedInto}`, repairable: true });
    }

    // enabled_disabled_mismatch
    if (entry.enabled === false && !entry.disabledReason && !entry.deleted) {
      issues.push({ id: entry.id, type: "enabled_disabled_mismatch", severity: "info", message: "disabled without disabledReason", repairable: true });
    }
    if (entry.enabled === true && entry.disabledReason) {
      issues.push({ id: entry.id, type: "enabled_disabled_mismatch", severity: "info", message: `enabled but has disabledReason: ${entry.disabledReason}`, repairable: true });
    }

    // expired_but_enabled
    if (entry.enabled !== false && isExpiredMemory(entry, now)) {
      issues.push({ id: entry.id, type: "expired_but_enabled", severity: "warning", message: "expired but still enabled", repairable: true });
    }

    // temporary_without_expiry
    if (entry.scope === "temporary" && !entry.expiresAt) {
      issues.push({ id: entry.id, type: "temporary_without_expiry", severity: "info", message: "temporary scope without expiresAt", repairable: false });
    }

    // stale_unreviewed (info only)
    if (!entry.lastReviewedAt && entry.enabled !== false && entry.deleted !== true) {
      const age = (now ?? new Date()).getTime() - new Date(entry.createdAt).getTime();
      if (age > 90 * 24 * 60 * 60 * 1000) {
        issues.push({ id: entry.id, type: "stale_unreviewed", severity: "info", message: "stale and never reviewed", repairable: false });
      }
    }
  }

  // invalid_conflict_group (groups with only 1 member)
  const conflictGroups = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.conflictKey && entry.conflictKey.length > 0) {
      const group = conflictGroups.get(entry.conflictKey) ?? [];
      group.push(entry.id);
      conflictGroups.set(entry.conflictKey, group);
    }
  }
  for (const [key, ids] of conflictGroups) {
    if (ids.length === 1) {
      issues.push({ id: ids[0], type: "invalid_conflict_group", severity: "info", message: `conflictKey '${key}' has only 1 member`, repairable: true });
    }
  }

  // duplicate_relation_mismatch
  for (const entry of entries) {
    if (entry.duplicateOf && entry.duplicateOf.length > 0 && idSet.has(entry.duplicateOf)) {
      const canonical = entries.find(e => e.id === entry.duplicateOf);
      if (canonical && (!canonical.duplicates || !canonical.duplicates.includes(entry.id))) {
        issues.push({ id: entry.id, type: "duplicate_relation_mismatch", severity: "warning", message: `duplicateOf=${entry.duplicateOf} but canonical.duplicates does not include this entry`, repairable: true });
      }
    }
  }

  // circular_supersede
  for (const entry of entries) {
    if (entry.supersededBy && idSet.has(entry.supersededBy)) {
      const target = entries.find(e => e.id === entry.supersededBy);
      if (target?.supersededBy === entry.id) {
        issues.push({ id: entry.id, type: "circular_supersede", severity: "error", message: `circular supersede: ${entry.id} <-> ${entry.supersededBy}`, repairable: false });
      }
    }
  }

  // circular_duplicate
  for (const entry of entries) {
    if (entry.duplicateOf && entry.duplicateOf.length > 0 && idSet.has(entry.duplicateOf)) {
      const target = entries.find(e => e.id === entry.duplicateOf);
      if (target?.duplicateOf === entry.id) {
        issues.push({ id: entry.id, type: "circular_duplicate", severity: "error", message: `circular duplicate: ${entry.id} <-> ${entry.duplicateOf}`, repairable: false });
      }
    }
  }

  return {
    scannedCount: entries.length,
    issueCount: issues.length,
    repairableCount: issues.filter(i => i.repairable).length,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Repair (Pure Function)
// ---------------------------------------------------------------------------

/**
 * Apply repairs to entries based on a doctor report.
 * Only repairs issues marked as repairable.
 * Pure function — returns new array, does NOT mutate input.
 */
export function applyMemoryRepairs(
  entries: DevMemoryEntry[],
  report: MemoryDoctorReport,
): { repairedEntries: DevMemoryEntry[]; result: MemoryRepairResult } {
  const repairableIssues = report.issues.filter(i => i.repairable);

  // Deep copy entries to avoid mutation
  const repairedEntries: DevMemoryEntry[] = JSON.parse(JSON.stringify(entries)) as DevMemoryEntry[];
  const updatedIds: string[] = [];
  const skippedIds: string[] = [];

  for (const issue of repairableIssues) {
    const entry = repairedEntries.find(e => e.id === issue.id);
    if (!entry) { skippedIds.push(issue.id); continue; }

    switch (issue.type) {
      case "missing_supersede_target":
        delete entry.supersededBy;
        if (entry.disabledReason === "superseded") delete entry.disabledReason;
        if (!updatedIds.includes(entry.id)) updatedIds.push(entry.id);
        break;

      case "missing_duplicate_target":
        delete entry.duplicateOf;
        if (entry.disabledReason === "duplicate") delete entry.disabledReason;
        if (!updatedIds.includes(entry.id)) updatedIds.push(entry.id);
        break;

      case "missing_merge_target":
        delete entry.mergedInto;
        if (!updatedIds.includes(entry.id)) updatedIds.push(entry.id);
        break;

      case "invalid_conflict_group":
        delete entry.conflictKey;
        if (!updatedIds.includes(entry.id)) updatedIds.push(entry.id);
        break;

      case "duplicate_relation_mismatch": {
        if (entry.duplicateOf) {
          const canonical = repairedEntries.find(e => e.id === entry.duplicateOf);
          if (canonical) {
            if (!canonical.duplicates) canonical.duplicates = [];
            if (!canonical.duplicates.includes(entry.id)) {
              canonical.duplicates.push(entry.id);
              if (!updatedIds.includes(canonical.id)) updatedIds.push(canonical.id);
            }
          }
        }
        if (!updatedIds.includes(entry.id)) updatedIds.push(entry.id);
        break;
      }

      case "enabled_disabled_mismatch":
        if (entry.enabled === false && !entry.disabledReason) {
          entry.disabledReason = "manual";
        } else if (entry.enabled === true && entry.disabledReason) {
          delete entry.disabledReason;
        }
        if (!updatedIds.includes(entry.id)) updatedIds.push(entry.id);
        break;

      case "expired_but_enabled":
        entry.enabled = false;
        entry.disabledReason = "expired";
        if (!updatedIds.includes(entry.id)) updatedIds.push(entry.id);
        break;

      default:
        skippedIds.push(issue.id);
        continue;
    }
  }

  // Entries with non-repairable issues only
  for (const issue of report.issues) {
    if (!issue.repairable && !skippedIds.includes(issue.id)) {
      skippedIds.push(issue.id);
    }
  }

  return {
    repairedEntries,
    result: {
      updatedIds,
      skippedIds: [...new Set(skippedIds)],
      repairedCount: updatedIds.length,
      issueCount: report.issueCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Run doctor and optionally repair the memory store.
 * dry-run: detect only, no mutations.
 */
export async function repairMemoryStore(
  options?: { storePath?: string; now?: Date; dryRun?: boolean },
): Promise<{ report: MemoryDoctorReport; result?: MemoryRepairResult }> {
  const entries = await readMemoryEntries(options?.storePath);
  const report = detectMemoryIssues(entries, options?.now);

  if (options?.dryRun || report.repairableCount === 0) {
    return { report };
  }

  const { repairedEntries, result } = applyMemoryRepairs(entries, report);
  await rewriteMemoryEntries(repairedEntries, options?.storePath);

  // Audit per repaired entry (non-blocking)
  for (const id of result.updatedIds) {
    try {
      await appendMemoryAuditEvent({
        eventType: "manual_update",
        actor: "cli",
        memoryId: id,
        source: "memoryDoctor.repairMemoryStore",
        reason: "Automated repair",
        metadata: { operation: "repair" },
      });
    } catch { /* non-blocking */ }
  }

  return { report, result };
}
