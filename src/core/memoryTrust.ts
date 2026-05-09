/**
 * memoryTrust.ts
 * Pure-function trust assessment module for DevMemoryEntry.
 * No side effects, no I/O — all functions are deterministic given the same inputs.
 */

import type { DevMemoryEntry, TrustLevel } from "./memoryValidator.js";
import type { MemoryHealthReport } from "./memoryHealth.js";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface TrustAssessment {
  trustScore: number; // 0-100
  recommendedTrustLevel: TrustLevel;
  reasons: string[];
}

export interface TrustContext {
  now?: Date;
  healthReport?: MemoryHealthReport;
}

// ---------------------------------------------------------------------------
// Trust Lifecycle Types (Phase 4-H)
// ---------------------------------------------------------------------------

export type TrustLifecycleAction =
  | "none"
  | "upgrade_to_trusted"
  | "degrade_to_probation"
  | "manual_verify";

export interface TrustLifecycleDecision {
  action: TrustLifecycleAction;
  reason: string;
  beforeTrustLevel: TrustLevel;
  afterTrustLevel: TrustLevel;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Assess the trust level of a memory entry based on its fields and context.
 * Pure function — deterministic for same inputs.
 *
 * Scoring starts at 0 and applies bonuses/penalties additively.
 * Result is clamped to [0, 100].
 */
export function assessMemoryTrust(
  entry: DevMemoryEntry,
  context?: TrustContext,
): TrustAssessment {
  const now = context?.now ?? new Date();
  const healthReport = context?.healthReport;
  const reasons: string[] = [];
  let score = 0;

  // --- Bonuses ---

  const selectedCount = entry.usageStats?.selectedCount ?? 0;
  if (selectedCount >= 5) {
    score += 10;
    reasons.push("+10 selectedCount>=5");
  }
  if (selectedCount >= 20) {
    score += 10;
    reasons.push("+10 selectedCount>=20");
  }

  const successfulSelections = entry.usageStats?.successfulSelections ?? 0;
  if (successfulSelections >= 3) {
    score += 15;
    reasons.push("+15 successfulSelections>=3");
  }

  if ((entry.occurrences ?? 0) >= 3) {
    score += 10;
    reasons.push("+10 occurrences>=3");
  }

  if (entry.confidence === "high") {
    score += 15;
    reasons.push("+15 confidence=high");
  }

  if (entry.authority === "rule") {
    score += 10;
    reasons.push("+10 authority=rule");
  }

  if (entry.source === "manual") {
    score += 10;
    reasons.push("+10 source=manual");
  }

  if (entry.verifiedAt) {
    score += 15;
    reasons.push("+15 verifiedAt exists");
  }

  if (!entry.conflictKey || entry.conflictKey === "") {
    score += 10;
    reasons.push("+10 no conflictKey");
  }

  if (!entry.duplicateOf || entry.duplicateOf === "") {
    score += 10;
    reasons.push("+10 no duplicateOf");
  }

  // Age >= 30 days bonus
  const ageMs = now.getTime() - new Date(entry.createdAt).getTime();
  if (ageMs >= THIRTY_DAYS_MS) {
    score += 5;
    reasons.push("+5 age>=30d");
  }

  // --- Penalties ---

  if (entry.conflictKey && entry.conflictKey !== "") {
    score -= 20;
    reasons.push("-20 conflictKey exists");
  }

  if (entry.duplicateOf && entry.duplicateOf !== "") {
    score -= 15;
    reasons.push("-15 duplicateOf exists");
  }

  if (healthReport && healthReport.conflictScore >= 50) {
    score -= 15;
    reasons.push("-15 healthReport.conflictScore>=50");
  }

  if (entry.confidence === "low") {
    score -= 10;
    reasons.push("-10 confidence=low");
  }

  // Stale probation penalty
  if (
    entry.trustLevel === "probation" &&
    ageMs > THIRTY_DAYS_MS &&
    (entry.usageStats?.selectedCount ?? 0) === 0
  ) {
    score -= 10;
    reasons.push("-10 stale probation (>30d, never selected)");
  }

  // Never selected penalty
  if (!entry.usageStats || entry.usageStats.selectedCount === 0) {
    score -= 10;
    reasons.push("-10 never selected");
  }

  if (entry.captureStatus === "quarantined") {
    score -= 20;
    reasons.push("-20 captureStatus=quarantined");
  }

  if (entry.deleted === true) {
    score -= 30;
    reasons.push("-30 deleted=true");
  }

  // Clamp to [0, 100]
  const trustScore = Math.max(0, Math.min(100, score));

  // Determine recommended level from thresholds
  let recommendedTrustLevel: TrustLevel;
  if (trustScore >= 75) {
    recommendedTrustLevel = "verified";
  } else if (trustScore >= 40) {
    recommendedTrustLevel = "trusted";
  } else {
    recommendedTrustLevel = "probation";
  }

  // Safety cap: quarantined entries never get "verified"
  if (entry.captureStatus === "quarantined" && recommendedTrustLevel === "verified") {
    recommendedTrustLevel = "trusted";
    reasons.push("capped at trusted (quarantined)");
  }

  // Safety cap: deleted entries never get higher than "probation"
  if (entry.deleted === true && recommendedTrustLevel !== "probation") {
    recommendedTrustLevel = "probation";
    reasons.push("capped at probation (deleted)");
  }

  return { trustScore, recommendedTrustLevel, reasons };
}

/**
 * Record a memory selection event. Returns a NEW entry with updated usageStats.
 * Pure function — does NOT mutate the input entry.
 */
export function recordMemorySelection(
  entry: DevMemoryEntry,
  now?: Date,
): DevMemoryEntry {
  const timestamp = (now ?? new Date()).toISOString();
  const existing = entry.usageStats;

  const newUsageStats = existing
    ? {
        ...existing,
        selectedCount: existing.selectedCount + 1,
        lastSelectedAt: timestamp,
      }
    : {
        selectedCount: 1,
        successfulSelections: 0,
        rejectedSelections: 0,
        lastSelectedAt: timestamp,
      };

  return {
    ...entry,
    usageStats: newUsageStats,
  };
}


/**
 * Record a successful selection feedback. Returns a NEW entry with updated usageStats.
 * Pure function — does NOT mutate the input entry.
 */
export function recordMemorySelectionSuccess(
  entry: DevMemoryEntry,
  now?: Date,
): DevMemoryEntry {
  const timestamp = (now ?? new Date()).toISOString();
  const existing = entry.usageStats;

  const newUsageStats = existing
    ? {
        ...existing,
        successfulSelections: existing.successfulSelections + 1,
        lastSuccessfulAt: timestamp,
      }
    : {
        selectedCount: 0,
        successfulSelections: 1,
        rejectedSelections: 0,
        lastSuccessfulAt: timestamp,
      };

  return { ...entry, usageStats: newUsageStats };
}

/**
 * Record a rejected selection feedback. Returns a NEW entry with updated usageStats.
 * Pure function — does NOT mutate the input entry.
 */
export function recordMemorySelectionRejection(
  entry: DevMemoryEntry,
  now?: Date,
): DevMemoryEntry {
  const timestamp = (now ?? new Date()).toISOString();
  const existing = entry.usageStats;

  const newUsageStats = existing
    ? {
        ...existing,
        rejectedSelections: existing.rejectedSelections + 1,
        lastRejectedAt: timestamp,
      }
    : {
        selectedCount: 0,
        successfulSelections: 0,
        rejectedSelections: 1,
        lastRejectedAt: timestamp,
      };

  return { ...entry, usageStats: newUsageStats };
}


// ---------------------------------------------------------------------------
// Trust Lifecycle Functions (Phase 4-H)
// ---------------------------------------------------------------------------

/**
 * Assess what lifecycle action should be taken for an entry based on
 * accumulated usage statistics and feedback.
 *
 * Pure function — never returns "manual_verify".
 * Returns "none" for deleted, disabled, discarded, or verified entries.
 *
 * Auto-upgrade: probation → trusted (max)
 * Auto-degrade: trusted → probation only
 */
export function assessTrustLifecycleAction(entry: DevMemoryEntry): TrustLifecycleDecision {
  const currentLevel: TrustLevel = entry.trustLevel ?? "probation";
  const noneDecision: TrustLifecycleDecision = {
    action: "none",
    reason: "No action required",
    beforeTrustLevel: currentLevel,
    afterTrustLevel: currentLevel,
  };

  // Skip ineligible entries
  if (entry.deleted === true) return { ...noneDecision, reason: "Entry is deleted" };
  if (entry.enabled === false) return { ...noneDecision, reason: "Entry is disabled" };
  if (entry.captureStatus === "discarded") return { ...noneDecision, reason: "Entry is discarded" };
  if (currentLevel === "verified") return { ...noneDecision, reason: "Verified entries are not auto-modified" };

  const selectedCount = entry.usageStats?.selectedCount ?? 0;
  const successfulSelections = entry.usageStats?.successfulSelections ?? 0;
  const rejectedSelections = entry.usageStats?.rejectedSelections ?? 0;

  // Auto-upgrade: probation → trusted
  if (
    currentLevel === "probation" &&
    successfulSelections >= 3 &&
    rejectedSelections === 0 &&
    selectedCount >= 3
  ) {
    return {
      action: "upgrade_to_trusted",
      reason: "Auto-upgrade: 3+ successful selections, 0 rejections, 3+ total selections",
      beforeTrustLevel: "probation",
      afterTrustLevel: "trusted",
    };
  }

  // Auto-degrade: trusted → probation (only trusted entries)
  if (
    currentLevel === "trusted" &&
    rejectedSelections >= 3 &&
    rejectedSelections > successfulSelections
  ) {
    return {
      action: "degrade_to_probation",
      reason: "Auto-degrade: 3+ rejections exceeding successes",
      beforeTrustLevel: "trusted",
      afterTrustLevel: "probation",
    };
  }

  return noneDecision;
}

/**
 * Apply a lifecycle decision to an entry. Returns a new entry with updated fields.
 * Pure function — does NOT mutate the input entry.
 */
export function applyTrustLifecycleDecision(
  entry: DevMemoryEntry,
  decision: TrustLifecycleDecision,
  now?: Date,
): DevMemoryEntry {
  const timestamp = (now ?? new Date()).toISOString();

  switch (decision.action) {
    case "none":
      return { ...entry };

    case "upgrade_to_trusted":
      return {
        ...entry,
        trustLevel: "trusted",
        trustScore: Math.max(entry.trustScore ?? 0, 50),
        promotedAt: timestamp,
      };

    case "degrade_to_probation":
      return {
        ...entry,
        trustLevel: "probation",
        trustScore: Math.min(entry.trustScore ?? 50, 30),
        degradedAt: timestamp,
      };

    case "manual_verify":
      return {
        ...entry,
        trustLevel: "verified",
        trustScore: 100,
        verifiedAt: timestamp,
      };
  }
}
