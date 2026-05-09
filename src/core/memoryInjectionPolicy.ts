/**
 * memoryInjectionPolicy.ts
 * Pure-function post-selection policy for memory injection.
 * Applies trust-based prioritization, probation/autoCaptured limits,
 * and high-rejection suppression to produce the final injection list.
 *
 * No side effects, no I/O — all functions are deterministic given the same inputs.
 */

import type { DevMemoryEntry } from "./memoryValidator.js";
import { isSupersededMemory, groupByConflictGroup, selectConflictWinners } from "./memoryConflict.js";
import { isDuplicateMemory, isMergedMemory } from "./memoryDuplicate.js";
import { getScopeExclusionReason } from "./memoryScope.js";
import type { MemoryScopeContext } from "./memoryScope.js";
import { isExpiredMemory } from "./memoryDecay.js";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface MemoryInjectionPolicyConfig {
  maxTotalEntries: number;
  maxProbationEntries: number;
  maxAutoCapturedRatio: number;
  suppressHighRejection: boolean;
  scopeContext?: import("./memoryScope.js").MemoryScopeContext;
}

export interface MemoryInjectionPolicyDecision {
  id: string;
  action: "include" | "exclude";
  reason: string;
}

export interface MemoryInjectionPolicyResult {
  selectedEntries: DevMemoryEntry[];
  excludedEntries: DevMemoryEntry[];
  decisions: MemoryInjectionPolicyDecision[];
  stats: {
    inputCount: number;
    outputCount: number;
    excludedCount: number;
    probationIncludedCount: number;
    autoCapturedIncludedCount: number;
    highRejectionExcludedCount: number;
    supersededExcludedCount: number;
    conflictExcludedCount: number;
    duplicateExcludedCount: number;
    mergedExcludedCount: number;
    scopeExcludedCount: number;
    expiredExcludedCount: number;
  };
}

// ---------------------------------------------------------------------------
// Default Config
// ---------------------------------------------------------------------------

export const DEFAULT_MEMORY_INJECTION_POLICY: MemoryInjectionPolicyConfig = {
  maxTotalEntries: 5,
  maxProbationEntries: 1,
  maxAutoCapturedRatio: 0.5,
  suppressHighRejection: true,
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if an entry has high rejection (rejected >= 3 AND rejected > successful).
 * Pure function.
 */
export function isHighRejectionMemory(entry: DevMemoryEntry): boolean {
  const rejected = entry.usageStats?.rejectedSelections ?? 0;
  const successful = entry.usageStats?.successfulSelections ?? 0;
  return rejected >= 3 && rejected > successful;
}

/**
 * Check if an entry was auto-captured.
 * Uses the `autoCaptured` boolean field (Phase 4-A).
 * Pure function.
 */
export function isAutoCapturedMemory(entry: DevMemoryEntry): boolean {
  return entry.autoCaptured === true;
}

/**
 * Get the trust priority score for sorting.
 * Higher = more trusted = should appear first.
 * Pure function.
 */
export function getTrustPriority(entry: DevMemoryEntry): number {
  switch (entry.trustLevel) {
    case "verified": return 300;
    case "trusted": return 200;
    case "probation": return 100;
    default: return 50;
  }
}

// ---------------------------------------------------------------------------
// Main Policy Function
// ---------------------------------------------------------------------------

/**
 * Apply memory injection policy to a list of candidate entries.
 * Returns the filtered, prioritized list along with decisions and stats.
 *
 * Pure function — does NOT mutate input entries.
 *
 * Algorithm:
 * 1. Exclude ineligible entries (deleted, disabled, discarded)
 * 2. Exclude high rejection entries (if suppressHighRejection)
 * 3. Stable sort by trust priority
 * 4. Enforce maxTotalEntries
 * 5. Enforce maxProbationEntries
 * 6. Enforce maxAutoCapturedRatio
 * 7. Build decisions and stats
 */
export function applyMemoryInjectionPolicy(
  entries: DevMemoryEntry[],
  config?: Partial<MemoryInjectionPolicyConfig>,
): MemoryInjectionPolicyResult {
  const cfg: MemoryInjectionPolicyConfig = {
    ...DEFAULT_MEMORY_INJECTION_POLICY,
    ...config,
  };

  // Ensure non-negative config values
  const maxTotal = Math.max(0, cfg.maxTotalEntries);
  const maxProbation = Math.max(0, cfg.maxProbationEntries);
  const maxAutoCapturedRatio = Math.max(0, Math.min(1, cfg.maxAutoCapturedRatio));

  const inputCount = entries.length;
  const decisions: MemoryInjectionPolicyDecision[] = [];
  let highRejectionExcludedCount = 0;

  // Step 1: Exclude ineligible entries
  const eligible: DevMemoryEntry[] = [];
  for (const entry of entries) {
    if (entry.deleted === true) {
      decisions.push({ id: entry.id, action: "exclude", reason: "Entry is deleted" });
    } else if (entry.enabled === false) {
      decisions.push({ id: entry.id, action: "exclude", reason: "Entry is disabled" });
    } else if (entry.captureStatus === "discarded") {
      decisions.push({ id: entry.id, action: "exclude", reason: "Entry is discarded" });
    } else {
      eligible.push(entry);
    }
  }

  // Step 2: Exclude expired entries
  let expiredExcludedCount = 0;
  const afterExpired: DevMemoryEntry[] = [];
  for (const entry of eligible) {
    if (isExpiredMemory(entry)) {
      decisions.push({ id: entry.id, action: "exclude", reason: `Expired (expiresAt: ${entry.expiresAt})` });
      expiredExcludedCount++;
    } else {
      afterExpired.push(entry);
    }
  }

  // Step 3: Exclude out-of-scope entries
  let scopeExcludedCount = 0;
  const afterScope: DevMemoryEntry[] = [];
  const scopeCtx: MemoryScopeContext | undefined = cfg.scopeContext;
  if (scopeCtx) {
    for (const entry of afterExpired) {
      const reason = getScopeExclusionReason(entry, scopeCtx);
      if (reason) {
        decisions.push({ id: entry.id, action: "exclude", reason });
        scopeExcludedCount++;
      } else {
        afterScope.push(entry);
      }
    }
  } else {
    afterScope.push(...afterExpired);
  }

  // Step 4: Exclude high rejection entries
  const afterRejection: DevMemoryEntry[] = [];
  for (const entry of afterScope) {
    if (cfg.suppressHighRejection && isHighRejectionMemory(entry)) {
      decisions.push({ id: entry.id, action: "exclude", reason: "High rejection rate suppressed" });
      highRejectionExcludedCount++;
    } else {
      afterRejection.push(entry);
    }
  }

  // Step 5: Exclude superseded entries
  let supersededExcludedCount = 0;
  const afterSuperseded: DevMemoryEntry[] = [];
  for (const entry of afterRejection) {
    if (isSupersededMemory(entry)) {
      decisions.push({ id: entry.id, action: "exclude", reason: `Superseded by ${entry.supersededBy}` });
      supersededExcludedCount++;
    } else {
      afterSuperseded.push(entry);
    }
  }

  // Step 6: Exclude duplicate and merged entries
  let duplicateExcludedCount = 0;
  let mergedExcludedCount = 0;
  const afterDuplicate: DevMemoryEntry[] = [];
  for (const entry of afterSuperseded) {
    if (isDuplicateMemory(entry)) {
      decisions.push({ id: entry.id, action: "exclude", reason: `Duplicate of ${entry.duplicateOf}` });
      duplicateExcludedCount++;
    } else if (isMergedMemory(entry)) {
      decisions.push({ id: entry.id, action: "exclude", reason: `Merged into ${entry.mergedInto}` });
      mergedExcludedCount++;
    } else {
      afterDuplicate.push(entry);
    }
  }

  // Step 7: Resolve conflict groups (max 1 per conflictKey)
  let conflictExcludedCount = 0;
  const winnerIds = selectConflictWinners(afterDuplicate);
  const conflictGroups = groupByConflictGroup(afterDuplicate);
  const afterConflict: DevMemoryEntry[] = [];
  for (const entry of afterDuplicate) {
    if (!entry.conflictKey || entry.conflictKey.length === 0) {
      afterConflict.push(entry);
    } else if (winnerIds.has(entry.id)) {
      afterConflict.push(entry);
    } else {
      const group = conflictGroups.get(entry.conflictKey);
      const winner = group?.find(e => winnerIds.has(e.id));
      decisions.push({ id: entry.id, action: "exclude", reason: `Conflict group '${entry.conflictKey}' — winner is ${winner?.id ?? "unknown"}` });
      conflictExcludedCount++;
    }
  }

  // Step 8: Stable sort by trust priority (higher priority first)
  // Use index-based stable sort to preserve original order within same priority
  const indexed = afterConflict.map((entry, idx) => ({ entry, idx }));
  indexed.sort((a, b) => {
    const priorityDiff = getTrustPriority(b.entry) - getTrustPriority(a.entry);
    if (priorityDiff !== 0) return priorityDiff;
    return a.idx - b.idx; // stable: preserve original order
  });
  const sorted = indexed.map(item => item.entry);

  // Step 9: Enforce maxTotalEntries
  let included = sorted.slice(0, maxTotal);
  const overflowEntries = sorted.slice(maxTotal);
  for (const entry of overflowEntries) {
    decisions.push({ id: entry.id, action: "exclude", reason: "Exceeds maxTotalEntries" });
  }

  // Step 10: Enforce maxProbationEntries
  let probationCount = 0;
  const afterProbationLimit: DevMemoryEntry[] = [];
  for (const entry of included) {
    const level = entry.trustLevel ?? "probation";
    if (level === "probation") {
      if (probationCount < maxProbation) {
        afterProbationLimit.push(entry);
        probationCount++;
      } else {
        decisions.push({ id: entry.id, action: "exclude", reason: "Exceeds maxProbationEntries" });
      }
    } else {
      afterProbationLimit.push(entry);
    }
  }
  included = afterProbationLimit;

  // Step 11: Enforce maxAutoCapturedRatio
  // Only enforce if there are entries and the ratio would be exceeded
  if (included.length > 0) {
    const autoCapturedCount = included.filter(e => isAutoCapturedMemory(e)).length;
    const maxAllowed = Math.max(1, Math.floor(included.length * maxAutoCapturedRatio));

    if (autoCapturedCount > maxAllowed) {
      // Remove lowest-priority autoCaptured entries from the end
      const toRemove = autoCapturedCount - maxAllowed;
      let removed = 0;
      // Iterate from end to remove lowest-priority autoCaptured entries
      const final: DevMemoryEntry[] = [];
      const reversed = [...included].reverse();
      const removeSet = new Set<string>();

      for (const entry of reversed) {
        if (removed < toRemove && isAutoCapturedMemory(entry)) {
          removeSet.add(entry.id);
          removed++;
        }
      }

      for (const entry of included) {
        if (removeSet.has(entry.id)) {
          decisions.push({ id: entry.id, action: "exclude", reason: "Exceeds maxAutoCapturedRatio" });
        } else {
          final.push(entry);
        }
      }
      included = final;
    }
  }

  // Build final decisions for included entries (those not yet in decisions)
  const decidedIds = new Set(decisions.map(d => d.id));
  for (const entry of included) {
    if (!decidedIds.has(entry.id)) {
      decisions.push({ id: entry.id, action: "include", reason: "Passed injection policy" });
    }
  }

  // Compute excluded entries
  const includedIds = new Set(included.map(e => e.id));
  const excludedEntries = entries.filter(e => !includedIds.has(e.id));

  // Compute stats
  const probationIncludedCount = included.filter(e => (e.trustLevel ?? "probation") === "probation").length;
  const autoCapturedIncludedCount = included.filter(e => isAutoCapturedMemory(e)).length;

  return {
    selectedEntries: included,
    excludedEntries,
    decisions,
    stats: {
      inputCount,
      outputCount: included.length,
      excludedCount: inputCount - included.length,
      probationIncludedCount,
      autoCapturedIncludedCount,
      highRejectionExcludedCount,
      supersededExcludedCount,
      conflictExcludedCount,
      duplicateExcludedCount,
      mergedExcludedCount,
      scopeExcludedCount,
      expiredExcludedCount,
    },
  };
}
