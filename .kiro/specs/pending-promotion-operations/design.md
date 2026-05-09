# Design Document

## Overview

This design extends the existing pending memory subsystem in KSK with five new CLI subcommands (`pending inspect`, `pending promote --all`, `pending discard`, `pending prune`, `pending stats`) and integrates audit trail recording into the existing `handlePendingPromote`. All new logic is implemented as pure functions where possible, with I/O isolated to thin CLI handler wrappers in `memoryCommands.ts`.

## Architecture

### File Structure

```
src/core/
  memoryCommands.ts    — Extended with new handlers (handlePendingInspect, handlePendingPromoteAll, handlePendingDiscard, handlePendingPrune, handlePendingStats)
  pendingOperations.ts — NEW: Pure functions for pending operations logic
src/__tests__/
  pendingOperations.test.ts          — Unit tests (12+)
  pendingOperations.property.test.ts — Property-based tests (5 properties, 100 runs)
```

### Design Decisions

1. **Pure function layer**: All business logic (promote, discard, prune filtering, stats computation) lives in `pendingOperations.ts` as pure functions. CLI handlers in `memoryCommands.ts` handle I/O (read/write stores, audit logging).

2. **Extend existing routing**: The existing `handleMemoryPending` function already routes `list`, `clear`, `promote`. We extend it to also route `inspect`, `discard`, `prune`, `stats`, and handle the `--all` flag on `promote`.

3. **Audit integration pattern**: Audit events are recorded in try/catch blocks. Failures are silently caught (logged to stderr at most) and never block the primary operation.

4. **Discard vs Delete**: Discard sets `captureStatus = "discarded"` but does NOT set `deleted = true`. The entry remains in the pending store for audit trail purposes. This is distinct from the active store's soft-delete pattern.

## Data Flow

### Promote All Flow
```
CLI args → handleMemoryPending("promote", ["--all"])
  → readPendingMemoryEntries()
  → promotePendingEntries(entries, now) [pure]
  → appendMemoryEntry(promoted) for each [I/O]
  → rewritePendingMemoryEntries(remaining) [I/O]
  → appendMemoryAuditEvent(...) for each [I/O, non-blocking]
```

### Discard Flow
```
CLI args → handleMemoryPending("discard", [id])
  → readPendingMemoryEntries()
  → discardPendingEntry(entries, id) [pure]
  → rewritePendingMemoryEntries(updated) [I/O]
  → appendMemoryAuditEvent(...) [I/O, non-blocking]
```

### Prune Flow
```
CLI args → handleMemoryPending("prune", [...flags])
  → readPendingMemoryEntries()
  → classifyPrunePendingCandidates(entries, thresholdDays, now) [pure]
  → if dry-run: display candidates
  → else: discardPendingEntries(entries, candidateIds) [pure]
    → rewritePendingMemoryEntries(updated) [I/O]
    → appendMemoryAuditEvent(...) for each [I/O, non-blocking]
```

## Module: `pendingOperations.ts`

### Types

```typescript
export interface PendingPromoteResult {
  promoted: DevMemoryEntry[];
  remaining: DevMemoryEntry[];
}

export interface PendingDiscardResult {
  updated: DevMemoryEntry[];
  discardedEntry: DevMemoryEntry;
}

export interface PendingPruneCandidate {
  entry: DevMemoryEntry;
  ageInDays: number;
}

export interface PendingStatsResult {
  pendingCount: number;
  oldPendingCount: number;
  oldestPendingAt: string | null;
}
```

### Functions

```typescript
/**
 * Check if an entry qualifies as "pending" (exists in pending store, not deleted).
 */
export function isPendingEntry(entry: DevMemoryEntry): boolean;

/**
 * Promote a single pending entry. Returns the entry with promotion fields set.
 * Pure function — does not mutate input.
 */
export function promotePendingEntry(entry: DevMemoryEntry, now?: Date): DevMemoryEntry;

/**
 * Promote all non-deleted pending entries.
 * Returns promoted entries and remaining (deleted) entries.
 */
export function promoteAllPendingEntries(entries: DevMemoryEntry[], now?: Date): PendingPromoteResult;

/**
 * Discard a pending entry by ID. Sets captureStatus = "discarded".
 * Returns updated entries array and the discarded entry.
 * Throws if entry not found or is deleted.
 */
export function discardPendingEntry(entries: DevMemoryEntry[], id: string): PendingDiscardResult;

/**
 * Identify pending entries older than thresholdDays.
 * Returns candidates for pruning.
 */
export function classifyPrunePendingCandidates(
  entries: DevMemoryEntry[],
  thresholdDays?: number,
  now?: Date,
): PendingPruneCandidate[];

/**
 * Apply discard to all candidate entries.
 * Returns the full updated entries array.
 */
export function applyPrunePendingEntries(
  entries: DevMemoryEntry[],
  candidateIds: string[],
): DevMemoryEntry[];

/**
 * Compute pending store statistics.
 */
export function computePendingStats(entries: DevMemoryEntry[], now?: Date): PendingStatsResult;
```

## CLI Routing Changes

### `handleMemoryPending` Extension

The existing switch in `handleMemoryPending` is extended:

```typescript
export async function handleMemoryPending(args: string[]): Promise<void> {
  const subcommand = args[0];

  switch (subcommand) {
    case "promote":
      if (args.includes("--all")) {
        await handlePendingPromoteAll();
      } else {
        await handlePendingPromote(args.slice(1));
      }
      return;
    case "inspect":
      await handlePendingInspect(args.slice(1));
      return;
    case "discard":
      await handlePendingDiscard(args.slice(1));
      return;
    case "prune":
      await handlePendingPrune(args.slice(1));
      return;
    case "stats":
      await handlePendingStats();
      return;
    case "list":
    case undefined:
      // existing list logic
      return;
    case "clear":
      // existing clear logic
      return;
    default:
      // error
  }
}
```

### Audit Event Integration in Existing `handlePendingPromote`

Add try/catch audit recording after the existing promote logic:

```typescript
try {
  await appendMemoryAuditEvent({
    eventType: "promote",
    actor: "cli",
    memoryId: id,
    source: "memoryCommands.handlePendingPromote",
    reason: "Manual single promote",
  });
} catch {
  // Audit failure does not block promotion
}
```

## Property-Based Test Design

### Test File: `pendingOperations.property.test.ts`

Uses `fast-check` with 100 runs per property.

#### Generators

```typescript
// Arbitrary for a valid DevMemoryEntry in pending state
const pendingEntryArb: fc.Arbitrary<DevMemoryEntry> = ...
// Arbitrary for a deleted pending entry
const deletedPendingEntryArb: fc.Arbitrary<DevMemoryEntry> = ...
// Mixed array with both pending and deleted entries
const mixedPendingArrayArb: fc.Arbitrary<DevMemoryEntry[]> = ...
```

#### Properties

1. **promotePendingEntry only changes non-deleted entries**: Given a mixed array, `promoteAllPendingEntries` only modifies entries where `deleted !== true`. Deleted entries appear unchanged in `remaining`.

2. **discardPendingEntry only changes non-deleted entries**: Given a mixed array and a valid non-deleted ID, `discardPendingEntry` sets `captureStatus = "discarded"` only on the target. All other entries remain unchanged.

3. **promote/discard never modify deleted entries**: For any operation, entries with `deleted === true` in the input appear byte-for-byte identical in the output.

4. **prune dry-run doesn't modify store**: `classifyPrunePendingCandidates` returns candidates but the original entries array is not mutated (referential equality check).

5. **promoteAll returns correct count**: `promoteAllPendingEntries(entries).promoted.length` equals the count of entries where `deleted !== true`.

## Correctness Properties

| # | Property | Pattern | Testable |
|---|----------|---------|----------|
| 1 | Promote only affects non-deleted | Invariant | yes - property |
| 2 | Discard only affects non-deleted | Invariant | yes - property |
| 3 | Deleted entries never modified | Invariant | yes - property |
| 4 | Dry-run is side-effect-free | Idempotence | yes - property |
| 5 | PromoteAll count matches input | Metamorphic | yes - property |

## Error Handling

- **Entry not found**: All operations that take an ID return an error result or throw, which the CLI handler catches and prints to stderr with exit code 1.
- **Deleted entry targeted**: Discard and inspect on a deleted entry produce a specific error message.
- **Audit failures**: Wrapped in try/catch, never propagate to caller.
- **Empty store**: All operations handle zero-entry case gracefully.

## Dependencies

- No new runtime dependencies
- Uses existing: `memoryStore.ts`, `memoryAuditLog.ts`, `memoryValidator.ts`
- Test dependencies: `vitest`, `fast-check` (already in devDependencies)
