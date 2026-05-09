/**
 * memoryHealth.ts
 * Pure-function diagnostic module for DevMemoryEntry health analysis.
 * No side effects — all functions are deterministic given the same inputs.
 */

import type { DevMemoryEntry } from "./memoryValidator.js";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export type MemoryHealthLevel = "ok" | "warning" | "critical";
export type MemoryHealthFindingType = "bloat" | "conflict" | "duplicate" | "stale" | "injection_risk";
export type MemoryHealthFindingSeverity = "info" | "warning" | "critical";

export interface MemoryHealthFinding {
  type: MemoryHealthFindingType;
  severity: MemoryHealthFindingSeverity;
  message: string;
  entryIds?: string[];
  suggestedCommand?: string;
}

export interface MemoryHealthReport {
  overallScore: number;
  level: MemoryHealthLevel;
  bloatScore: number;
  conflictScore: number;
  duplicationScore: number;
  stalenessScore: number;
  injectionRiskScore: number;
  findings: MemoryHealthFinding[];
  recommendations: string[];
  stats: {
    totalEntries: number;
    activeEntries: number;
    deletedEntries: number;
    disabledEntries: number;
    supersededEntries: number;
    expiredEntries: number;
    lowConfidenceEntries: number;
    autoCapturedEntries: number;
    storeSizeKb?: number;
    trustDistribution?: {
      probation: number;
      trusted: number;
      verified: number;
    };
    neverSelectedCount?: number;
    frequentlySelectedCount?: number;
    recentlyActiveCount?: number;
    feedbackRecordedCount?: number;
    highRejectionCount?: number;
    trustUpgradeCandidateCount?: number;
    trustDegradeCandidateCount?: number;
    expiredCount?: number;
    staleCount?: number;
    reviewDueCount?: number;
    temporaryWithoutExpiryCount?: number;
    repairableIssueCount?: number;
    doctorWarningCount?: number;
    doctorErrorCount?: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a score to integer in [0, 100] */
function clamp(score: number): number {
  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Word-level Jaccard similarity between two text strings.
 */
export function tokenOverlap(textA: string, textB: string): number {
  const tokensA = new Set(textA.toLowerCase().split(/\s+/).filter(Boolean));
  const tokensB = new Set(textB.toLowerCase().split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 0;
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Negation pairs for conflict detection.
 * Each pair: [positive pattern word, negative pattern word]
 */
const NEGATION_PAIRS: Array<[string, string]> = [
  ["use", "avoid"],
  ["enable", "disable"],
  ["allow", "disallow"],
  ["include", "exclude"],
  ["always", "never"],
  ["追加", "削除"],
  ["使う", "使わない"],
  ["有効", "無効"],
];

/**
 * Detect negation conflicts between two text strings.
 * Returns true if one text contains a positive pattern word and the other
 * contains the corresponding negative pattern word (or vice versa).
 */
export function detectNegation(textA: string, textB: string): boolean {
  const lowerA = textA.toLowerCase();
  const lowerB = textB.toLowerCase();

  for (const [positive, negative] of NEGATION_PAIRS) {
    const posLower = positive.toLowerCase();
    const negLower = negative.toLowerCase();

    if (
      (lowerA.includes(posLower) && lowerB.includes(negLower)) ||
      (lowerA.includes(negLower) && lowerB.includes(posLower))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Detect clusters of near-duplicate entries.
 * Criteria: same kind + tags overlap >= 2 + relatedSymbols overlap >= 1.
 * Returns clusters with >= 2 entries each.
 */
export function findDuplicateClusters(
  entries: DevMemoryEntry[],
): Array<{ entryIds: string[]; reason: string }> {
  const activeEntries = entries.filter(e => e.enabled === true && e.deleted !== true);
  const clusters: Array<{ entryIds: string[]; reason: string }> = [];
  const visited = new Set<number>();

  for (let i = 0; i < activeEntries.length; i++) {
    if (visited.has(i)) continue;
    const cluster: number[] = [i];

    for (let j = i + 1; j < activeEntries.length; j++) {
      if (visited.has(j)) continue;

      const a = activeEntries[i];
      const b = activeEntries[j];

      // Same kind check
      if (a.kind !== b.kind) continue;

      // Tags overlap >= 2
      const sharedTags = a.tags.filter(t => b.tags.includes(t));
      if (sharedTags.length < 2) continue;

      // relatedSymbols overlap >= 1
      const sharedSymbols = a.relatedSymbols.filter(s => b.relatedSymbols.includes(s));
      if (sharedSymbols.length < 1) continue;

      cluster.push(j);
    }

    if (cluster.length >= 2) {
      for (const idx of cluster) {
        visited.add(idx);
      }
      const representative = activeEntries[i];
      const sharedTags = activeEntries[cluster[0]].tags.filter(t =>
        cluster.every(idx => activeEntries[idx].tags.includes(t)),
      );
      const sharedSymbols = activeEntries[cluster[0]].relatedSymbols.filter(s =>
        cluster.every(idx => activeEntries[idx].relatedSymbols.includes(s)),
      );
      clusters.push({
        entryIds: cluster.map(idx => activeEntries[idx].id),
        reason: `Same kind '${representative.kind}' with ${sharedTags.length} shared tags and ${sharedSymbols.length} shared symbols`,
      });
    }
  }

  return clusters;
}

// ---------------------------------------------------------------------------
// Scoring Functions
// ---------------------------------------------------------------------------

/** 180 days in milliseconds */
const STALE_THRESHOLD_MS = 180 * 24 * 60 * 60 * 1000;

interface ScoringContext {
  entries: DevMemoryEntry[];
  activeEntries: DevMemoryEntry[];
  now: Date;
  storeSizeKb?: number;
}

/**
 * Compute bloat score (0-100).
 * Based on active entry count, store size, and autoCaptured ratio.
 */
function computeBloatScore(ctx: ScoringContext): number {
  const activeCount = ctx.activeEntries.length;

  // Base score from active entries count
  let baseScore: number;
  if (activeCount <= 50) {
    baseScore = 0;
  } else if (activeCount <= 100) {
    // Linear interpolation 10-40 for 51-100
    baseScore = 10 + ((activeCount - 51) / (100 - 51)) * (40 - 10);
  } else if (activeCount <= 150) {
    // Linear interpolation 40-65 for 101-150
    baseScore = 40 + ((activeCount - 101) / (150 - 101)) * (65 - 40);
  } else {
    // 65 + min((activeEntries - 150) / 5, 20) → max 85
    baseScore = 65 + Math.min((activeCount - 150) / 5, 20);
  }

  // Store size penalty
  let storePenalty = 0;
  if (ctx.storeSizeKb !== undefined) {
    if (ctx.storeSizeKb >= 1000) {
      storePenalty = 15;
    } else if (ctx.storeSizeKb >= 500) {
      storePenalty = 10;
    }
  }

  // Auto-captured ratio penalty
  let autoCapturedPenalty = 0;
  if (ctx.activeEntries.length > 0) {
    const autoCapturedCount = ctx.activeEntries.filter(e => e.autoCaptured === true).length;
    const ratio = autoCapturedCount / ctx.activeEntries.length;
    if (ratio >= 0.8) {
      autoCapturedPenalty = 15;
    } else if (ratio >= 0.6) {
      autoCapturedPenalty = 10;
    }
  }

  return clamp(baseScore + storePenalty + autoCapturedPenalty);
}

/**
 * Compute conflict score (0-100).
 * Based on conflictKey groups, overlap groups, and negation pairs.
 */
function computeConflictScore(ctx: ScoringContext): number {
  const active = ctx.activeEntries;

  // conflictKey penalty: +15 per group with N > 1 entries sharing same conflictKey
  let conflictKeyPenalty = 0;
  const conflictKeyGroups = new Map<string, DevMemoryEntry[]>();
  for (const entry of active) {
    if (entry.conflictKey) {
      const group = conflictKeyGroups.get(entry.conflictKey) ?? [];
      group.push(entry);
      conflictKeyGroups.set(entry.conflictKey, group);
    }
  }
  for (const [, group] of conflictKeyGroups) {
    if (group.length > 1) {
      conflictKeyPenalty += 15;
    }
  }

  // Overlap penalty: +10 per group of 3+ entries with same kind + overlapping relatedSymbols + overlapping tags
  let overlapPenalty = 0;
  const kindGroups = new Map<string, DevMemoryEntry[]>();
  for (const entry of active) {
    const group = kindGroups.get(entry.kind) ?? [];
    group.push(entry);
    kindGroups.set(entry.kind, group);
  }
  for (const [, group] of kindGroups) {
    if (group.length >= 3) {
      // Check if they share at least one symbol and one tag
      const allSymbols = group.map(e => e.relatedSymbols);
      const allTags = group.map(e => e.tags);

      // Find common symbols across all entries in the group
      const commonSymbols = allSymbols[0].filter(s =>
        allSymbols.every(symbols => symbols.includes(s)),
      );
      const commonTags = allTags[0].filter(t =>
        allTags.every(tags => tags.includes(t)),
      );

      if (commonSymbols.length >= 1 && commonTags.length >= 1) {
        overlapPenalty += 10;
      }
    }
  }

  // Negation penalty: +20 per detected negation pair
  let negationPenalty = 0;
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const textA = `${active[i].summary} ${active[i].futurePromptHint}`;
      const textB = `${active[j].summary} ${active[j].futurePromptHint}`;
      if (detectNegation(textA, textB)) {
        negationPenalty += 20;
      }
    }
  }

  return clamp(conflictKeyPenalty + overlapPenalty + negationPenalty);
}

/**
 * Compute duplication score (0-100).
 * Based on cluster count and token overlap bonus.
 */
function computeDuplicationScore(ctx: ScoringContext): number {
  const clusters = findDuplicateClusters(ctx.entries);
  const clusterCount = clusters.length;

  // Base duplication score
  let baseDuplication: number;
  if (clusterCount === 0) {
    baseDuplication = 0;
  } else if (clusterCount <= 3) {
    baseDuplication = 20 + clusterCount * 5;
  } else {
    baseDuplication = 35 + Math.min((clusterCount - 3) * 10, 40);
  }

  // Token overlap bonus: +5 per cluster with > 50% overlap (max +25)
  let tokenOverlapBonus = 0;
  for (const cluster of clusters) {
    const clusterEntries = ctx.activeEntries.filter(e => cluster.entryIds.includes(e.id));
    if (clusterEntries.length >= 2) {
      // Check pairwise overlap
      let hasHighOverlap = false;
      for (let i = 0; i < clusterEntries.length && !hasHighOverlap; i++) {
        for (let j = i + 1; j < clusterEntries.length && !hasHighOverlap; j++) {
          const textA = `${clusterEntries[i].summary} ${clusterEntries[i].futurePromptHint}`;
          const textB = `${clusterEntries[j].summary} ${clusterEntries[j].futurePromptHint}`;
          if (tokenOverlap(textA, textB) > 0.5) {
            hasHighOverlap = true;
          }
        }
      }
      if (hasHighOverlap) {
        tokenOverlapBonus += 5;
      }
    }
  }
  tokenOverlapBonus = Math.min(tokenOverlapBonus, 25);

  return clamp(baseDuplication + tokenOverlapBonus);
}

/**
 * Compute staleness score (0-100).
 * Based on stale ratio, expired count, and low confidence count.
 */
function computeStalenessScore(ctx: ScoringContext): number {
  const active = ctx.activeEntries;
  const now = ctx.now.getTime();

  if (active.length === 0) return 0;

  // Stale ratio: entries older than 180 days
  const staleCount = active.filter(e => {
    const age = now - new Date(e.createdAt).getTime();
    return age > STALE_THRESHOLD_MS;
  }).length;
  const staleRatio = staleCount / active.length;

  // Expired count (entries with expiresAt in the past)
  const expiredCount = ctx.entries.filter(e => {
    if (!e.expiresAt) return false;
    return new Date(e.expiresAt).getTime() < now;
  }).length;

  // Low confidence count (active entries)
  const lowConfidenceCount = active.filter(e => e.confidence === "low").length;

  const stalePenalty = staleRatio * 60;
  const expiredPenalty = Math.min(expiredCount * 8, 25);
  const lowConfidencePenalty = Math.min(lowConfidenceCount * 5, 20);

  return clamp(stalePenalty + expiredPenalty + lowConfidencePenalty);
}

/**
 * Compute injection risk score (0-100).
 * Based on candidate ratio, low confidence, autoCaptured ratio, duplicate clusters, conflict level.
 */
function computeInjectionRiskScore(ctx: ScoringContext, conflictScore: number): number {
  const active = ctx.activeEntries;

  // Candidate ratio: activeEntries / 5 (selection limit)
  let candidateRatioPenalty = 0;
  const candidateRatio = active.length / 5;
  if (candidateRatio > 20) {
    candidateRatioPenalty = 30;
  } else if (candidateRatio > 10) {
    candidateRatioPenalty = 20;
  }

  // Low confidence penalty
  const lowConfidenceActiveCount = active.filter(e => e.confidence === "low").length;
  const lowConfidencePenalty = Math.min(lowConfidenceActiveCount * 4, 20);

  // Auto-captured penalty
  let autoCapturedPenalty = 0;
  if (active.length > 0) {
    const autoCapturedCount = active.filter(e => e.autoCaptured === true).length;
    const ratio = autoCapturedCount / active.length;
    autoCapturedPenalty = ratio >= 0.6 ? 15 : 0;
  }

  // Duplicate penalty
  const clusters = findDuplicateClusters(ctx.entries);
  const duplicatePenalty = Math.min(clusters.length * 5, 20);

  // Conflict penalty
  let conflictPenalty = 0;
  if (conflictScore >= 50) {
    conflictPenalty = 15;
  } else if (conflictScore >= 30) {
    conflictPenalty = 8;
  }

  return clamp(candidateRatioPenalty + lowConfidencePenalty + autoCapturedPenalty + duplicatePenalty + conflictPenalty);
}

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

/**
 * Compute a full health report from an array of DevMemoryEntry objects.
 * Pure function — deterministic given the same inputs.
 */
export function calculateMemoryHealth(
  entries: DevMemoryEntry[],
  options?: { now?: Date; storeSizeKb?: number },
): MemoryHealthReport {
  const now = options?.now ?? new Date();
  const storeSizeKb = options?.storeSizeKb;

  // Compute stats
  const activeEntries = entries.filter(e => e.enabled === true && e.deleted !== true);
  const idSetForDoctor = new Set(entries.map(e => e.id));
  const deletedEntries = entries.filter(e => e.deleted === true);
  const disabledEntries = entries.filter(e => e.enabled === false);
  const supersededEntries = entries.filter(e =>
    entries.some(other => other.supersedes?.includes(e.id) ?? false),
  );
  const expiredEntries = entries.filter(e => {
    if (!e.expiresAt) return false;
    return new Date(e.expiresAt).getTime() < now.getTime();
  });
  const lowConfidenceEntries = entries.filter(e => e.confidence === "low");
  const autoCapturedEntries = entries.filter(e => e.autoCaptured === true);

  // Compute trust distribution from active entries
  const trustDistribution = { probation: 0, trusted: 0, verified: 0 };
  for (const entry of activeEntries) {
    const level = entry.trustLevel ?? "probation";
    if (level === "verified") {
      trustDistribution.verified++;
    } else if (level === "trusted") {
      trustDistribution.trusted++;
    } else {
      trustDistribution.probation++;
    }
  }

  const stats: MemoryHealthReport["stats"] = {
    totalEntries: entries.length,
    activeEntries: activeEntries.length,
    deletedEntries: deletedEntries.length,
    disabledEntries: disabledEntries.length,
    supersededEntries: supersededEntries.length,
    expiredEntries: expiredEntries.length,
    lowConfidenceEntries: lowConfidenceEntries.length,
    autoCapturedEntries: autoCapturedEntries.length,
    ...(storeSizeKb !== undefined ? { storeSizeKb } : {}),
    ...(activeEntries.length > 0 ? { trustDistribution } : {}),
  };

  // Usage-based stats
  const neverSelectedCount = activeEntries.filter((e) =>
    !e.usageStats || e.usageStats.selectedCount === 0,
  ).length;
  const frequentlySelectedCount = activeEntries.filter((e) =>
    (e.usageStats?.selectedCount ?? 0) > 20,
  ).length;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentlyActiveCount = activeEntries.filter((e) => {
    if (!e.usageStats?.lastSelectedAt) return false;
    return new Date(e.usageStats.lastSelectedAt).getTime() > thirtyDaysAgo.getTime();
  }).length;

  stats.neverSelectedCount = neverSelectedCount;
  stats.frequentlySelectedCount = frequentlySelectedCount;
  stats.recentlyActiveCount = recentlyActiveCount;

  // Feedback-based stats
  const feedbackRecordedCount = activeEntries.filter((e) =>
    (e.usageStats?.successfulSelections ?? 0) > 0 ||
    (e.usageStats?.rejectedSelections ?? 0) > 0,
  ).length;

  const highRejectionCount = activeEntries.filter((e) => {
    const rejected = e.usageStats?.rejectedSelections ?? 0;
    const successful = e.usageStats?.successfulSelections ?? 0;
    return rejected > successful && rejected >= 3;
  }).length;

  stats.feedbackRecordedCount = feedbackRecordedCount;
  stats.highRejectionCount = highRejectionCount;

  // Handle empty store
  if (entries.length === 0) {
    return {
      overallScore: 0,
      level: "ok",
      bloatScore: 0,
      conflictScore: 0,
      duplicationScore: 0,
      stalenessScore: 0,
      injectionRiskScore: 0,
      findings: [],
      recommendations: [],
      stats,
    };
  }

  // Compute scoring context
  const ctx: ScoringContext = { entries, activeEntries, now, storeSizeKb };

  // Compute sub-scores
  const bloatScore = computeBloatScore(ctx);
  const conflictScore = computeConflictScore(ctx);
  const duplicationScore = computeDuplicationScore(ctx);
  const stalenessScore = computeStalenessScore(ctx);
  const injectionRiskScore = computeInjectionRiskScore(ctx, conflictScore);

  // Overall score
  const overallScore = clamp(
    bloatScore * 0.25 +
    conflictScore * 0.25 +
    duplicationScore * 0.20 +
    stalenessScore * 0.15 +
    injectionRiskScore * 0.15,
  );

  // Level determination
  let level: MemoryHealthLevel;
  if (overallScore >= 75) {
    level = "critical";
  } else if (overallScore >= 50) {
    level = "warning";
  } else {
    level = "ok";
  }

  // Generate findings
  const findings: MemoryHealthFinding[] = [];
  const duplicateClusters = findDuplicateClusters(entries);

  if (bloatScore >= 75) {
    findings.push({
      type: "bloat",
      severity: "critical",
      message: `Memory store is bloated with ${activeEntries.length} active entries`,
      suggestedCommand: "kiro-studio-kit memory prune",
    });
  } else if (bloatScore >= 50) {
    findings.push({
      type: "bloat",
      severity: "warning",
      message: `Memory store has ${activeEntries.length} active entries`,
      suggestedCommand: "kiro-studio-kit memory prune",
    });
  }

  if (conflictScore >= 60) {
    findings.push({
      type: "conflict",
      severity: "critical",
      message: `High conflict level with contradictory entries`,
    });
  } else if (conflictScore >= 30) {
    findings.push({
      type: "conflict",
      severity: "warning",
      message: `Detected conflict groups`,
    });
  }

  if (duplicationScore >= 30) {
    findings.push({
      type: "duplicate",
      severity: "warning",
      message: `Found ${duplicateClusters.length} duplicate clusters`,
      entryIds: duplicateClusters.flatMap(c => c.entryIds),
    });
  }

  if (stalenessScore >= 70) {
    const staleCount = activeEntries.filter(e => {
      const age = now.getTime() - new Date(e.createdAt).getTime();
      return age > STALE_THRESHOLD_MS;
    }).length;
    findings.push({
      type: "stale",
      severity: "critical",
      message: `Store is heavily stale: ${staleCount} old entries`,
      suggestedCommand: "kiro-studio-kit memory prune",
    });
  } else if (stalenessScore >= 40) {
    findings.push({
      type: "stale",
      severity: "warning",
      message: `${deletedEntries.length} deleted memories can be compacted`,
      suggestedCommand: "kiro-studio-kit memory compact",
    });
  }

  if (injectionRiskScore >= 75) {
    findings.push({
      type: "injection_risk",
      severity: "critical",
      message: "High injection risk — prompt quality may be degraded",
    });
  } else if (injectionRiskScore >= 50) {
    findings.push({
      type: "injection_risk",
      severity: "warning",
      message: "Injection risk elevated",
    });
  }

  // Trust distribution finding: high probation ratio
  if (activeEntries.length > 0 && trustDistribution.probation / activeEntries.length > 0.7) {
    const pct = Math.round((trustDistribution.probation / activeEntries.length) * 100);
    findings.push({
      type: "stale",
      severity: "warning",
      message: `High probation ratio: ${pct}% of active entries are still on probation`,
    });
  }

  // Usage-based finding: many entries never selected
  if (activeEntries.length > 0 && neverSelectedCount / activeEntries.length > 0.5) {
    findings.push({
      type: "stale",
      severity: "warning",
      message: `${neverSelectedCount} of ${activeEntries.length} active entries have never been selected`,
      suggestedCommand: "kiro-studio-kit memory usage stats",
    });
  }

  // Feedback-based finding: high rejection entries
  if (highRejectionCount > 0) {
    findings.push({
      type: "stale",
      severity: "warning",
      message: `${highRejectionCount} entries have high rejection rates (rejected > successful, rejected >= 3)`,
      suggestedCommand: "kiro-studio-kit memory usage stats",
    });
  }

  // Trust lifecycle candidate counts (Phase 4-H)
  // Inline logic must match assessTrustLifecycleAction exactly.
  // activeEntries already filters deleted===true and enabled===false,
  // but we must also skip captureStatus==="discarded" and verified entries.
  let trustUpgradeCandidateCount = 0;
  let trustDegradeCandidateCount = 0;
  for (const entry of activeEntries) {
    const currentLevel = entry.trustLevel ?? "probation";
    if (currentLevel === "verified") continue;
    if (entry.captureStatus === "discarded") continue;
    const selectedCount = entry.usageStats?.selectedCount ?? 0;
    const successfulSelections = entry.usageStats?.successfulSelections ?? 0;
    const rejectedSelections = entry.usageStats?.rejectedSelections ?? 0;

    if (
      currentLevel === "probation" &&
      successfulSelections >= 3 &&
      rejectedSelections === 0 &&
      selectedCount >= 3
    ) {
      trustUpgradeCandidateCount++;
    }

    if (
      currentLevel === "trusted" &&
      rejectedSelections >= 3 &&
      rejectedSelections > successfulSelections
    ) {
      trustDegradeCandidateCount++;
    }
  }
  stats.trustUpgradeCandidateCount = trustUpgradeCandidateCount;
  stats.trustDegradeCandidateCount = trustDegradeCandidateCount;

  if (trustDegradeCandidateCount > 0) {
    findings.push({
      type: "stale",
      severity: "warning",
      message: `${trustDegradeCandidateCount} entries have high rejection rates and may need trust degrade`,
      suggestedCommand: "kiro-studio-kit memory trust lifecycle",
    });
  }

  if (trustUpgradeCandidateCount > 0) {
    findings.push({
      type: "stale",
      severity: "info",
      message: `${trustUpgradeCandidateCount} entries eligible for trust upgrade (run: memory trust lifecycle)`,
      suggestedCommand: "kiro-studio-kit memory trust lifecycle",
    });
  }

  // Decay stats (Phase 4-N)
  const nowTime = now.getTime();
  const expiredCount = activeEntries.filter(e => {
    if (!e.expiresAt) return false;
    const t = new Date(e.expiresAt).getTime();
    return !isNaN(t) && t < nowTime;
  }).length;
  const staleCount = activeEntries.filter(e => {
    const ref = e.lastReviewedAt ?? e.createdAt;
    const refTime = new Date(ref).getTime();
    if (isNaN(refTime)) return false;
    const limit = (e.staleAfterDays ?? 90) * 24 * 60 * 60 * 1000;
    return (nowTime - refTime) > limit;
  }).length;
  const temporaryWithoutExpiryCount = activeEntries.filter(e =>
    e.scope === "temporary" && !e.expiresAt,
  ).length;
  const reviewDueCount = expiredCount + staleCount + temporaryWithoutExpiryCount;

  stats.expiredCount = expiredCount;
  stats.staleCount = staleCount;
  stats.reviewDueCount = reviewDueCount;
  stats.temporaryWithoutExpiryCount = temporaryWithoutExpiryCount;

  if (expiredCount > 0) {
    findings.push({
      type: "stale",
      severity: "warning",
      message: `${expiredCount} entries have expired (run: memory decay disable-expired)`,
      suggestedCommand: "kiro-studio-kit memory decay disable-expired",
    });
  }

  // Doctor stats (Phase 4-O) — lightweight inline detection for key issues
  let repairableIssueCount = 0;
  let doctorWarningCount = 0;
  let doctorErrorCount = 0;
  for (const entry of entries) {
    if (entry.supersededBy && !idSetForDoctor.has(entry.supersededBy)) { repairableIssueCount++; doctorWarningCount++; }
    if (entry.duplicateOf && entry.duplicateOf.length > 0 && !idSetForDoctor.has(entry.duplicateOf)) { repairableIssueCount++; doctorWarningCount++; }
    if (entry.enabled === false && !entry.disabledReason && entry.deleted !== true) { repairableIssueCount++; }
    if (entry.enabled === true && entry.disabledReason) { repairableIssueCount++; }
  }
  // Check circular references
  for (const entry of entries) {
    if (entry.supersededBy && idSetForDoctor.has(entry.supersededBy)) {
      const target = entries.find(e => e.id === entry.supersededBy);
      if (target?.supersededBy === entry.id) doctorErrorCount++;
    }
  }
  stats.repairableIssueCount = repairableIssueCount;
  stats.doctorWarningCount = doctorWarningCount;
  stats.doctorErrorCount = doctorErrorCount;

  if (repairableIssueCount > 0) {
    findings.push({
      type: "stale",
      severity: "warning",
      message: `${repairableIssueCount} repairable integrity issues detected (run: memory doctor)`,
      suggestedCommand: "kiro-studio-kit memory doctor",
    });
  }
  if (doctorErrorCount > 0) {
    findings.push({
      type: "stale",
      severity: "critical",
      message: `${doctorErrorCount} circular reference errors detected`,
    });
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (deletedEntries.length > 0) {
    recommendations.push("Run `kiro-studio-kit memory compact` to remove deleted entries");
  }
  if (stalenessScore >= 40) {
    recommendations.push("Run `kiro-studio-kit memory prune` to remove stale entries");
  }
  if (duplicateClusters.length > 0) {
    recommendations.push("Review duplicate entries and consider using `memory supersede` to consolidate");
  }
  if (conflictScore >= 30) {
    recommendations.push("Review conflicting entries and disable or delete contradictory ones");
  }
  if (bloatScore >= 50) {
    recommendations.push("Consider pruning low-value entries to reduce store size");
  }

  return {
    overallScore,
    level,
    bloatScore,
    conflictScore,
    duplicationScore,
    stalenessScore,
    injectionRiskScore,
    findings,
    recommendations,
    stats,
  };
}
