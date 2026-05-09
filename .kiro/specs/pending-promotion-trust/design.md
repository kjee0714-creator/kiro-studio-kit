# Design Document

## Overview

This design implements Phase 4-C: Pending Promotion / Trust Upgrade for the Kiro Studio Kit development memory system. It adds a pure-function trust assessment module, extends the DevMemoryEntry schema with usage tracking fields, integrates trust bonuses into the memory selector, and provides CLI commands for trust management.

## Architecture

### New Module: `src/core/memoryTrust.ts`

A pure-function module with zero side effects. All functions are deterministic given the same inputs.

```typescript
import type { DevMemoryEntry } from "./memoryValidator.js";
import type { MemoryHealthReport } from "./memoryHealth.js";
import type { TrustLevel } from "./memoryValidator.js";

export interface MemoryUsageStats {
  selectedCount: number;
  successfulSelections: number;
  rejectedSelections: number;
  lastSelectedAt?: string;
  lastSuccessfulAt?: string;
}

export interface TrustAssessment {
  trustScore: number; // 0-100
  recommendedTrustLevel: TrustLevel;
  reasons: string[];
}

export interface TrustContext {
  now?: Date;
  healthReport?: MemoryHealthReport;
}
```

### Functions

#### `assessMemoryTrust(entry: DevMemoryEntry, context?: TrustContext): TrustAssessment`

Pure function. Computes trust score from entry fields and context:

**Bonuses (additive):**
| Condition | Points |
|-----------|--------|
| usageStats.selectedCount >= 5 | +10 |
| usageStats.selectedCount >= 20 | +10 |
| usageStats.successfulSelections >= 3 | +15 |
| occurrences >= 3 | +10 |
| confidence === "high" | +15 |
| authority === "rule" | +10 |
| source === "manual" | +10 |
| verifiedAt exists | +15 |
| No conflictKey (undefined or empty) | +10 |
| No duplicateOf (undefined or empty) | +10 |
| Age >= 30 days | +5 |

**Penalties (subtractive):**
| Condition | Points |
|-----------|--------|
| conflictKey exists | -20 |
| duplicateOf exists | -15 |
| healthReport.conflictScore >= 50 | -15 |
| confidence === "low" | -10 |
| probation + age > 30 days + never selected | -10 |
| Never selected (selectedCount === 0 or no usageStats) | -10 |
| captureStatus === "quarantined" | -20 |
| deleted === true | -30 |

**Threshold mapping:**
- 0-39 → "probation"
- 40-74 → "trusted"
- 75-100 → "verified"

**Special rule:** If `captureStatus === "quarantined"`, cap recommended level at "trusted".

#### `recordMemorySelection(entry: DevMemoryEntry, now?: Date): DevMemoryEntry`

Pure function. Returns a new entry (immutable pattern) with:
- `usageStats.selectedCount` incremented by 1
- `usageStats.lastSelectedAt` set to `now.toISOString()`
- If no existing `usageStats`, initializes with `{ selectedCount: 1, successfulSelections: 0, rejectedSelections: 0, lastSelectedAt: now.toISOString() }`

### Schema Extension: `src/core/memoryValidator.ts`

Add to `DevMemoryEntry` interface:
```typescript
promotedAt?: string;
verifiedAt?: string;
degradedAt?: string;
usageStats?: MemoryUsageStats;
trustScore?: number; // 0-100
```

Add validation for new optional fields in `validateDevMemoryEntry`:
- `promotedAt`: string if provided
- `verifiedAt`: string if provided
- `degradedAt`: string if provided
- `trustScore`: number if provided
- `usageStats`: object with required number fields (`selectedCount`, `successfulSelections`, `rejectedSelections`) and optional string fields (`lastSelectedAt`, `lastSuccessfulAt`)

### CLI Commands: `src/core/memoryCommands.ts`

#### `memory pending promote <id>`

1. Read pending store entries
2. Find entry by ID (error if not found)
3. Mutate entry: `trustLevel = "probation"`, `enabled = true`, `authority = "hint"`, `captureStatus = "active"`, `promotedAt = now.toISOString()`
4. Append to active store
5. Remove from pending store (rewrite pending without this entry)
6. Print success message

#### `memory trust upgrade <id>`

1. Read active store entries
2. Find entry by ID (error if not found)
3. Call `assessMemoryTrust(entry)`
4. Compare `recommendedTrustLevel` with current `trustLevel`
5. If recommended is higher: update `trustLevel`, set `promotedAt` or `verifiedAt` as appropriate, persist `trustScore`
6. Rewrite active store
7. Print result

#### `memory trust degrade <id>`

1. Read active store entries
2. Find entry by ID (error if not found)
3. If "verified" → set to "trusted", set `degradedAt`
4. If "trusted" → set to "probation", set `degradedAt`
5. If "probation" → print "cannot degrade further"
6. Rewrite active store
7. Print result

#### `memory trust audit [--apply]`

1. Read active store entries
2. For each active (enabled, not deleted) entry: call `assessMemoryTrust`
3. Collect entries where recommended differs from current
4. If `--apply`: apply changes, rewrite store
5. Print summary table

### Selector Integration: `src/core/memorySelector.ts`

In `scoreEntry` and `scoreEntryDetailed`, add trust bonus after existing scoring:

```typescript
// Trust level bonus (additive)
if (entry.trustLevel === "verified") {
  score += 15;
} else if (entry.trustLevel === "trusted") {
  score += 8;
}
// "probation" and undefined get +0
```

Add a new `MemoryMatchReason` type value: `"trust"`.

### Health Integration: `src/core/memoryHealth.ts`

Add to `MemoryHealthReport.stats`:
```typescript
trustDistribution?: {
  probation: number;
  trusted: number;
  verified: number;
};
```

In `calculateMemoryHealth`, compute trust distribution from active entries. If `probation / activeEntries.length > 0.7`, add a finding:
```typescript
{
  type: "stale",
  severity: "warning",
  message: "High probation ratio: X% of active entries are still on probation",
}
```

### CLI Routing: `src/cli.ts`

Add routing for new subcommands in `handleMemory`:
- `pending promote` → `handlePendingPromote`
- `trust upgrade` → `handleTrustUpgrade`
- `trust degrade` → `handleTrustDegrade`
- `trust audit` → `handleTrustAudit`

## File Changes Summary

| File | Change Type |
|------|-------------|
| `src/core/memoryTrust.ts` | New file |
| `src/core/memoryValidator.ts` | Add optional fields + validation |
| `src/core/memoryCommands.ts` | Add trust/promote command handlers |
| `src/core/memorySelector.ts` | Add trust bonus to scoring |
| `src/core/memoryHealth.ts` | Add trust distribution stats + finding |
| `src/index.ts` | Export new module |
| `src/__tests__/memoryTrust.test.ts` | New unit test file |
| `src/__tests__/memoryTrust.property.test.ts` | New property test file |

## Correctness Properties

### Property 1: Trust Score Clamping (Invariant)

For all arbitrary DevMemoryEntry inputs, `assessMemoryTrust` always returns a trustScore in [0, 100].

```
∀ entry: DevMemoryEntry → 0 ≤ assessMemoryTrust(entry).trustScore ≤ 100
```

### Property 2: Verified Requires High Score (Threshold Invariant)

For all entries where the recommended level is "verified", the trustScore must be >= 75.

```
∀ entry: DevMemoryEntry →
  assessMemoryTrust(entry).recommendedTrustLevel === "verified"
  ⟹ assessMemoryTrust(entry).trustScore >= 75
```

### Property 3: Quarantined Never Verified (Safety Invariant)

For all entries with captureStatus === "quarantined", the recommended level is never "verified".

```
∀ entry: DevMemoryEntry where entry.captureStatus === "quarantined" →
  assessMemoryTrust(entry).recommendedTrustLevel !== "verified"
```

### Property 4: Selection Monotonicity (Idempotence-adjacent)

For all entries, `recordMemorySelection` produces a selectedCount >= the input selectedCount.

```
∀ entry: DevMemoryEntry →
  recordMemorySelection(entry).usageStats.selectedCount >=
    (entry.usageStats?.selectedCount ?? 0)
```

### Property 5: Deleted Never Upgraded (Safety Invariant)

For all entries with deleted === true, the recommended trust level is never higher than "probation".

```
∀ entry: DevMemoryEntry where entry.deleted === true →
  assessMemoryTrust(entry).recommendedTrustLevel === "probation"
```

## Testing Strategy

### Property-Based Tests (5 properties, 100 runs each)
- Use fast-check arbitrary generators for DevMemoryEntry
- Test all 5 correctness properties above

### Unit Tests (12+ tests)
1. `recordMemorySelection` increments selectedCount
2. `recordMemorySelection` initializes usageStats when missing
3. `assessMemoryTrust` clamps score to 0-100
4. Trust thresholds: probation at score 39
5. Trust thresholds: trusted at score 40
6. Trust thresholds: verified at score 75
7. Conflicts reduce trustScore (conflictKey penalty)
8. Duplicates reduce trustScore (duplicateOf penalty)
9. Verified entry gains +15 bonus
10. `pending promote` moves entry correctly
11. `trust upgrade` applies recommended level
12. `trust degrade` downgrades one level
13. `trust audit` reports candidates
14. Selector trust bonus affects ranking (verified +15, trusted +8)
15. Quarantined entries never become verified
16. Health report includes trust distribution
