# Design Document: Selection Feedback (Phase 4-F)

## Overview

This design extends the Dev Memory system with selection feedback recording. It adds pure functions for success/rejection tracking, persistence functions that bridge pure logic with the JSONL store, CLI commands for user interaction, and integrations with the usage stats display and health monitor.

## Architecture

The implementation follows the existing layered architecture:
1. **Schema layer** (`memoryValidator.ts`) — type definitions and validation
2. **Pure function layer** (`memoryTrust.ts`) — deterministic feedback recording
3. **Persistence layer** (`memoryUsagePersistence.ts`) — I/O bridge with audit
4. **CLI layer** (`memoryCommands.ts`) — user-facing commands
5. **Health layer** (`memoryHealth.ts`) — diagnostic integration

## Detailed Design

### 1. Schema Extension (`memoryValidator.ts`)

Add `lastRejectedAt` to the `MemoryUsageStats` interface and add validation for it.

```typescript
/** Usage statistics for trust tracking */
export interface MemoryUsageStats {
  selectedCount: number;
  successfulSelections: number;
  rejectedSelections: number;
  lastSelectedAt?: string;
  lastSuccessfulAt?: string;
  lastRejectedAt?: string;  // NEW
}
```

Validation addition in `validateDevMemoryEntry`:
```typescript
if (us["lastRejectedAt"] !== undefined && typeof us["lastRejectedAt"] !== "string") {
  errors.push("usageStats.lastRejectedAt must be a string if provided");
}
```

### 2. Pure Functions (`memoryTrust.ts`)

Two new exported functions following the same immutable pattern as `recordMemorySelection`:

```typescript
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
```

### 3. Persistence Functions (`memoryUsagePersistence.ts`)

New interface and two async functions:

```typescript
export interface MemoryFeedbackResult {
  updatedId?: string;
  error?: string;
}

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

export async function markMemorySelectionRejected(
  id: string,
  options?: { now?: Date; storePath?: string; reason?: string },
): Promise<MemoryFeedbackResult> {
  const now = options?.now ?? new Date();
  const storeEntries = await readMemoryEntries(options?.storePath);
  const entry = storeEntries.find((e) => e.id === id);

  if (!entry) return { error: "not_found" };
  if (entry.deleted === true) return { error: "entry_deleted" };
  // Quarantined entries: allow rejection feedback (valid use case)

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
```

### 4. CLI Commands (`memoryCommands.ts`)

Extend the `usage` subcommand routing:

```typescript
case "usage": {
  const usageSub = args[1];
  if (usageSub === "stats") {
    await handleMemoryUsageStats();
  } else if (usageSub === "reset") {
    await handleMemoryUsageReset(args.slice(2));
  } else if (usageSub === "mark-success") {
    await handleMemoryUsageMarkSuccess(args.slice(2));
  } else if (usageSub === "mark-rejected") {
    await handleMemoryUsageMarkRejected(args.slice(2));
  } else {
    showMemoryUsage();
    process.exit(1);
  }
  break;
}
```

New handlers:

```typescript
export async function handleMemoryUsageMarkSuccess(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory usage mark-success <id> [--reason <text>]");
    process.exit(1);
  }
  const reason = getOption(args, "reason");
  const result = await markMemorySelectionSuccess(id, { reason: reason ?? undefined });
  if (result.error) {
    console.error(`エラー: ${result.error}`);
    process.exit(1);
  }
  console.log(`✅ Marked as success: ${id}`);
}

export async function handleMemoryUsageMarkRejected(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory usage mark-rejected <id> [--reason <text>]");
    process.exit(1);
  }
  const reason = getOption(args, "reason");
  const result = await markMemorySelectionRejected(id, { reason: reason ?? undefined });
  if (result.error) {
    console.error(`エラー: ${result.error}`);
    process.exit(1);
  }
  console.log(`✅ Marked as rejected: ${id}`);
}
```

### 5. Usage Stats Display Extension (`memoryCommands.ts`)

Extend `handleMemoryUsageStats` to include feedback metrics:

```typescript
// After existing stats output...
const totalSuccessful = active.reduce((sum, e) => sum + (e.usageStats?.successfulSelections ?? 0), 0);
const totalRejected = active.reduce((sum, e) => sum + (e.usageStats?.rejectedSelections ?? 0), 0);
const denominator = totalSuccessful + totalRejected;
const successRate = denominator > 0
  ? (totalSuccessful / denominator).toFixed(2)
  : "n/a";

console.log(`\nFeedback:`);
console.log(`  Successful selections: ${totalSuccessful}`);
console.log(`  Rejected selections: ${totalRejected}`);
console.log(`  Success rate: ${successRate}`);
```

### 6. Health Monitor Integration (`memoryHealth.ts`)

Extend the `stats` type and `calculateMemoryHealth` function:

Add to `MemoryHealthReport["stats"]`:
```typescript
feedbackRecordedCount?: number;
highRejectionCount?: number;
```

In `calculateMemoryHealth`, after existing stats computation:
```typescript
const feedbackRecordedCount = activeEntries.filter((e) =>
  (e.usageStats?.successfulSelections ?? 0) > 0 ||
  (e.usageStats?.rejectedSelections ?? 0) > 0
).length;

const highRejectionCount = activeEntries.filter((e) => {
  const rejected = e.usageStats?.rejectedSelections ?? 0;
  const successful = e.usageStats?.successfulSelections ?? 0;
  return rejected > successful && rejected >= 3;
}).length;

stats.feedbackRecordedCount = feedbackRecordedCount;
stats.highRejectionCount = highRejectionCount;
```

Warning finding:
```typescript
if (highRejectionCount > 0) {
  findings.push({
    type: "stale",
    severity: "warning",
    message: `${highRejectionCount} entries have high rejection rates (rejected > successful, rejected >= 3)`,
    suggestedCommand: "kiro-studio-kit memory usage stats",
  });
}
```

### 7. Public API Exports (`index.ts`)

Add new exports:
```typescript
export { recordMemorySelectionSuccess, recordMemorySelectionRejection } from "./core/memoryTrust.js";
export { markMemorySelectionSuccess, markMemorySelectionRejected } from "./core/memoryUsagePersistence.js";
export type { MemoryFeedbackResult } from "./core/memoryUsagePersistence.js";
export { handleMemoryUsageMarkSuccess, handleMemoryUsageMarkRejected } from "./core/memoryCommands.js";
```

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/core/memoryValidator.ts` | Modify | Add `lastRejectedAt` to interface + validation |
| `src/core/memoryTrust.ts` | Modify | Add `recordMemorySelectionSuccess`, `recordMemorySelectionRejection` |
| `src/core/memoryUsagePersistence.ts` | Modify | Add `MemoryFeedbackResult`, `markMemorySelectionSuccess`, `markMemorySelectionRejected` |
| `src/core/memoryCommands.ts` | Modify | Add `handleMemoryUsageMarkSuccess`, `handleMemoryUsageMarkRejected`, extend stats display, extend routing |
| `src/core/memoryHealth.ts` | Modify | Add `feedbackRecordedCount`, `highRejectionCount` to stats, add warning finding |
| `src/index.ts` | Modify | Export new functions and types |
| `src/__tests__/selectionFeedback.test.ts` | Create | Unit tests (10+) |
| `src/__tests__/selectionFeedback.property.test.ts` | Create | Property-based tests (5 properties, 100 runs each) |

## Testing Strategy

### Property-Based Tests (fast-check, 100 runs each)

1. **Success increments only successfulSelections**: For any valid entry, `recordMemorySelectionSuccess(entry).usageStats.successfulSelections === (entry.usageStats?.successfulSelections ?? 0) + 1` AND `rejectedSelections` unchanged
2. **Rejection increments only rejectedSelections**: For any valid entry, `recordMemorySelectionRejection(entry).usageStats.rejectedSelections === (entry.usageStats?.rejectedSelections ?? 0) + 1` AND `successfulSelections` unchanged
3. **selectedCount unchanged by feedback**: For any valid entry, both feedback functions preserve `selectedCount`
4. **successRate in [0, 1]**: For any entry where `(successfulSelections + rejectedSelections) > 0`, the computed rate is between 0 and 1 inclusive
5. **Feedback audit events have before/after**: For any feedback operation, the generated audit event contains numeric `before` and `after` usageStats

### Unit Tests

- `recordMemorySelectionSuccess` increments successfulSelections
- `recordMemorySelectionSuccess` updates lastSuccessfulAt
- `recordMemorySelectionRejection` increments rejectedSelections
- `recordMemorySelectionRejection` updates lastRejectedAt
- selectedCount unchanged by both functions
- `markMemorySelectionSuccess` with unknown ID returns error
- `markMemorySelectionSuccess` with deleted entry returns error
- `markMemorySelectionRejected` with quarantined entry allows feedback
- Audit event recorded after successful persistence
- Usage stats display includes success rate
- Health report includes feedbackRecordedCount and highRejectionCount
- Health report emits warning when highRejectionCount > 0

## Correctness Properties

1. **Immutability**: Both pure functions return new objects; original entry is never mutated
2. **Counter isolation**: Success feedback only touches successfulSelections/lastSuccessfulAt; rejection only touches rejectedSelections/lastRejectedAt; neither touches selectedCount
3. **Monotonic counters**: Feedback counters only increase (never decrease) through feedback operations
4. **Bounded success rate**: When denominator > 0, successRate ∈ [0, 1]
5. **Audit completeness**: Every successful persistence operation produces exactly one audit event with before/after stats
6. **Error safety**: Deleted entries are rejected; not-found entries are rejected; quarantined entries allow rejection feedback
