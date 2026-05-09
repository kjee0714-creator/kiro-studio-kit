# Design Document

## Overview

The Memory Health Monitor adds a pure-function diagnostic module (`src/core/memoryHealth.ts`) that analyzes DevMemoryEntry arrays and produces a quantitative health report. It integrates with the existing CLI via a new `memory health` subcommand and adds a stderr warning to the `prompt` command when health degrades.

## Architecture

### New Module: `src/core/memoryHealth.ts`

A pure-function module with zero side effects. All functions accept data and return results deterministically.

### Integration Points

1. **CLI** (`src/core/memoryCommands.ts`): New `health` case in the `handleMemory` router
2. **Prompt Generator** (`src/core/promptGenerator.ts`): Health check after memory injection, warning to stderr
3. **Validator** (`src/core/memoryValidator.ts`): Two new optional fields (`autoCaptured`, `conflictKey`)
4. **Public API** (`src/index.ts`): Export new types and functions

## Type Definitions

```typescript
// src/core/memoryHealth.ts

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
  };
}
```

## Function Signatures

```typescript
/**
 * Compute a full health report from an array of DevMemoryEntry objects.
 * Pure function — deterministic given the same inputs.
 */
export function calculateMemoryHealth(
  entries: DevMemoryEntry[],
  options?: { now?: Date; storeSizeKb?: number }
): MemoryHealthReport;

/**
 * Detect clusters of near-duplicate entries.
 * Criteria: same kind + tags overlap >= 2 + relatedSymbols overlap >= 1.
 * Returns clusters with >= 2 entries each.
 */
export function findDuplicateClusters(
  entries: DevMemoryEntry[]
): Array<{ entryIds: string[]; reason: string }>;
```

## Scoring Algorithms

### Bloat Score (0–100)

```
baseScore:
  activeEntries <= 50  → 0
  activeEntries 51-100 → linear interpolation 10-40
  activeEntries 101-150 → linear interpolation 40-65
  activeEntries > 150  → 65 + min((activeEntries - 150) / 5, 20) → max 85

storePenalty:
  storeSizeKb >= 500 → +10
  storeSizeKb >= 1000 → +15 (total, not cumulative)

autoCapturedPenalty:
  autoCapturedRatio >= 0.6 → +10
  autoCapturedRatio >= 0.8 → +15 (total, not cumulative)

bloatScore = clamp(baseScore + storePenalty + autoCapturedPenalty, 0, 100)
```

### Conflict Score (0–100)

```
conflictKeyPenalty:
  For each conflictKey with N > 1 active entries: +15 per group

overlapPenalty:
  For each group of 3+ entries with same kind + overlapping relatedSymbols + overlapping tags: +10 per group

negationPenalty:
  For each detected negation pair in summary/futurePromptHint: +20 per pair
  (Negation detection: one entry contains "always X" and another "never X", or "use X" vs "avoid X")

conflictScore = clamp(conflictKeyPenalty + overlapPenalty + negationPenalty, 0, 100)
```

### Duplication Score (0–100)

```
clusterCount = findDuplicateClusters(activeEntries).length
clusterEntryCount = total entries across all clusters

baseDuplication:
  clusterCount == 0 → 0
  clusterCount 1-3 → 20 + clusterCount * 5
  clusterCount > 3 → 35 + min((clusterCount - 3) * 10, 40)

tokenOverlapBonus:
  For clusters with > 50% token overlap in summary/futurePromptHint: +5 per cluster (max +25)

duplicationScore = clamp(baseDuplication + tokenOverlapBonus, 0, 100)
```

### Staleness Score (0–100)

```
staleRatio = (entries older than 180 days) / activeEntries
expiredCount = entries with expiresAt in the past
lowConfidenceCount = active entries with confidence == "low"

stalePenalty = staleRatio * 60
expiredPenalty = min(expiredCount * 8, 25)
lowConfidencePenalty = min(lowConfidenceCount * 5, 20)

stalenessScore = clamp(stalePenalty + expiredPenalty + lowConfidencePenalty, 0, 100)
```

### Injection Risk Score (0–100)

```
candidateRatio = activeEntries / 5 (selection limit)
  candidateRatio > 10 → +20
  candidateRatio > 20 → +30

lowConfidencePenalty = min(lowConfidenceActiveCount * 4, 20)
autoCapturedPenalty = autoCapturedRatio >= 0.6 ? 15 : 0
duplicatePenalty = min(duplicateClusterCount * 5, 20)
conflictPenalty = conflictScore >= 50 ? 15 : (conflictScore >= 30 ? 8 : 0)

injectionRiskScore = clamp(sum of above, 0, 100)
```

### Overall Score

```
overallScore = round(
  bloatScore * 0.25 +
  conflictScore * 0.25 +
  duplicationScore * 0.20 +
  stalenessScore * 0.15 +
  injectionRiskScore * 0.15
)
```

### Level Thresholds

```
overallScore 0-49   → "ok"
overallScore 50-74  → "warning"
overallScore 75-100 → "critical"
```

## Findings Generation

Findings are generated based on score thresholds:

| Condition | Type | Severity | Message Pattern |
|-----------|------|----------|-----------------|
| bloatScore >= 50 | bloat | warning | "Memory store has {n} active entries" |
| bloatScore >= 75 | bloat | critical | "Memory store is bloated with {n} active entries" |
| conflictScore >= 30 | conflict | warning | "Detected {n} conflict groups" |
| conflictScore >= 60 | conflict | critical | "High conflict level: {n} groups with contradictory entries" |
| duplicationScore >= 30 | duplicate | warning | "Found {n} duplicate clusters" |
| stalenessScore >= 40 | stale | warning | "{n} entries are older than 180 days" |
| stalenessScore >= 70 | stale | critical | "Store is heavily stale: {n} old entries" |
| injectionRiskScore >= 50 | injection_risk | warning | "Injection risk elevated" |
| injectionRiskScore >= 75 | injection_risk | critical | "High injection risk — prompt quality may be degraded" |

## Recommendations Generation

Recommendations are generated based on findings and stats:

- deletedEntries > 0 → "Run `kiro-studio-kit memory compact` to remove deleted entries"
- stalenessScore >= 40 → "Run `kiro-studio-kit memory prune` to remove stale entries"
- duplicateClusterCount > 0 → "Review duplicate entries and consider using `memory supersede` to consolidate"
- conflictScore >= 30 → "Review conflicting entries and disable or delete contradictory ones"
- bloatScore >= 50 → "Consider pruning low-value entries to reduce store size"

## Duplicate Cluster Detection Algorithm

```
function findDuplicateClusters(entries):
  activeEntries = entries.filter(e => e.enabled && !e.deleted)
  clusters = []
  visited = Set()

  for i in 0..activeEntries.length:
    if visited.has(i): continue
    cluster = [i]
    for j in (i+1)..activeEntries.length:
      if visited.has(j): continue
      if sameKind(i, j) && tagsOverlap(i, j) >= 2 && symbolsOverlap(i, j) >= 1:
        cluster.push(j)
    if cluster.length >= 2:
      mark all in cluster as visited
      clusters.push({
        entryIds: cluster.map(idx => activeEntries[idx].id),
        reason: "Same kind '{kind}' with {n} shared tags and {m} shared symbols"
      })

  return clusters
```

## CLI Integration

### `memory health` Command

Added as a new case in `handleMemory` router in `src/core/memoryCommands.ts`:

```typescript
export async function handleMemoryHealth(): Promise<void> {
  const entries = await readMemoryEntries();
  let storeSizeKb: number | undefined;
  if (await fileExists(MEMORY_STORE_PATH)) {
    const stats = await stat(MEMORY_STORE_PATH);
    storeSizeKb = stats.size / 1024;
  }
  const report = calculateMemoryHealth(entries, { storeSizeKb });
  // Format and print report to stdout
}
```

Output format:
```
🏥 Memory Health Report

Overall: 42/100 (ok)

Sub-scores:
  Bloat:          25/100
  Conflict:       30/100
  Duplication:    15/100
  Staleness:      10/100
  Injection Risk: 20/100

Stats:
  Total: 45 | Active: 38 | Deleted: 3 | Disabled: 2
  Superseded: 1 | Expired: 1 | Low confidence: 2 | Auto-captured: 5

Findings:
  ⚠️  [conflict] Detected 2 conflict groups

Recommendations:
  • Review conflicting entries and disable or delete contradictory ones
```

### Prompt Health Warning

In `src/core/promptGenerator.ts`, after memory injection (when mode != "off"):

```typescript
if (memoryMode !== "off") {
  const entries = await readMemoryEntries();
  const healthReport = calculateMemoryHealth(entries);
  if (
    healthReport.overallScore >= 75 ||
    healthReport.conflictScore >= 70 ||
    healthReport.bloatScore >= 85 ||
    healthReport.injectionRiskScore >= 75
  ) {
    console.error(`⚠️  Memory health: ${healthReport.level} (score: ${healthReport.overallScore}/100). Run \`kiro-studio-kit memory health\` for details.`);
  }
}
```

## Validator Extension

Add to `DevMemoryEntry` interface in `src/core/memoryValidator.ts`:

```typescript
// New optional fields (Phase 4-A)
autoCaptured?: boolean;
conflictKey?: string;
```

Add validation rules:
```typescript
if (obj["autoCaptured"] !== undefined && typeof obj["autoCaptured"] !== "boolean") {
  errors.push("autoCaptured must be a boolean if provided");
}
if (obj["conflictKey"] !== undefined && typeof obj["conflictKey"] !== "string") {
  errors.push("conflictKey must be a string if provided");
}
```

## Token Overlap Calculation

For duplication scoring, a simple word-level Jaccard similarity:

```typescript
function tokenOverlap(textA: string, textB: string): number {
  const tokensA = new Set(textA.toLowerCase().split(/\s+/).filter(Boolean));
  const tokensB = new Set(textB.toLowerCase().split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 0;
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}
```

## Negation Detection

Simple heuristic pattern matching for conflict detection:

```typescript
const NEGATION_PAIRS = [
  [/\balways\s+(\w+)/i, /\bnever\s+(\w+)/i],
  [/\buse\s+(\w+)/i, /\bavoid\s+(\w+)/i],
  [/\bdo\s+(\w+)/i, /\bdon'?t\s+(\w+)/i],
  [/\benable\s+(\w+)/i, /\bdisable\s+(\w+)/i],
];
```

For each pair of active entries, check if one matches the positive pattern and the other matches the negative pattern for the same captured word.

## File Changes Summary

| File | Change |
|------|--------|
| `src/core/memoryHealth.ts` | New file — types, calculateMemoryHealth, findDuplicateClusters |
| `src/core/memoryValidator.ts` | Add `autoCaptured?: boolean` and `conflictKey?: string` to interface and validation |
| `src/core/memoryCommands.ts` | Add `handleMemoryHealth` function and `health` case in router |
| `src/core/promptGenerator.ts` | Add health warning to stderr during prompt generation |
| `src/cli.ts` | Update usage text to include `memory health` |
| `src/index.ts` | Export new types and functions |
| `src/__tests__/memoryHealth.test.ts` | Unit tests |
| `src/__tests__/memoryHealth.property.test.ts` | Property-based tests |

## Correctness Properties (Property-Based Tests)

### Property 1: Score Range Invariant
FOR ALL arrays of valid DevMemoryEntry objects, ALL scores in the Health_Report (overallScore, bloatScore, conflictScore, duplicationScore, stalenessScore, injectionRiskScore) SHALL be integers in the range [0, 100].

### Property 2: Empty Store Identity
FOR ALL calls with an empty array, the Health_Report SHALL have overallScore === 0 and level === "ok".

### Property 3: Deleted Entries Stats Consistency
FOR ALL arrays containing entries with `deleted === true`, the stats.deletedEntries count SHALL equal the number of entries where `deleted === true`. Adding a deleted entry SHALL NOT decrease stats.deletedEntries.

### Property 4: Duplicate Cluster Minimum Size
FOR ALL results from findDuplicateClusters, every cluster SHALL have entryIds.length >= 2.

### Property 5: Overall Score Matches Weighted Formula
FOR ALL Health_Reports, overallScore SHALL equal round(bloatScore×0.25 + conflictScore×0.25 + duplicationScore×0.20 + stalenessScore×0.15 + injectionRiskScore×0.15).
