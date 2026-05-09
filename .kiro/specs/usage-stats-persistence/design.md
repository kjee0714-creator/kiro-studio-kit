# Design Document

## Overview

This design implements Phase 4-D: Usage Stats Persistence for the Dev Memory system. It introduces a new module `memoryUsagePersistence.ts` that bridges the existing pure function `recordMemorySelection` with the JSONL store, integrates persistence into the prompt generation pipeline, adds CLI commands for usage inspection and reset, and extends the health report with usage-based findings.

## Architecture

### New Module: `src/core/memoryUsagePersistence.ts`

```typescript
import type { DevMemoryEntry } from "./memoryValidator.js";
import { readMemoryEntries, rewriteMemoryEntries } from "./memoryStore.js";
import { recordMemorySelection } from "./memoryTrust.js";

export interface UsagePersistenceResult {
  updatedIds: string[];
  skippedIds: string[];
  errors: Array<{ id: string; reason: string }>;
}

export async function persistMemorySelections(
  selectedEntries: DevMemoryEntry[],
  options?: { now?: Date; storePath?: string },
): Promise<UsagePersistenceResult>;
```

### Modified Modules

1. **`src/core/promptGenerator.ts`** — Call `persistMemorySelections` after memory injection
2. **`src/core/memoryCommands.ts`** — Add `usage stats` and `usage reset` subcommand handlers
3. **`src/core/memoryHealth.ts`** — Add usage-based findings to health report
4. **`src/index.ts`** — Export new public API symbols

## Detailed Design

### 1. `persistMemorySelections` Logic

```
function persistMemorySelections(selectedEntries, options):
  result = { updatedIds: [], skippedIds: [], errors: [] }
  now = options?.now ?? new Date()
  storePath = options?.storePath

  storeEntries = await readMemoryEntries(storePath)

  for each selectedEntry in selectedEntries:
    storeEntry = storeEntries.find(e => e.id === selectedEntry.id)

    if storeEntry is undefined:
      result.skippedIds.push(selectedEntry.id)
      continue

    if storeEntry.enabled === false OR storeEntry.deleted === true OR storeEntry.captureStatus === "quarantined":
      result.skippedIds.push(selectedEntry.id)
      continue

    try:
      updatedEntry = recordMemorySelection(storeEntry, now)
      // Replace in-place in storeEntries array
      storeEntries[indexOf(storeEntry)] = updatedEntry
      result.updatedIds.push(selectedEntry.id)
    catch error:
      result.errors.push({ id: selectedEntry.id, reason: error.message })

  await rewriteMemoryEntries(storeEntries, storePath)
  return result
```

Key design decisions:
- Reads the store fresh (not using the selectedEntries' state) to avoid stale data
- Uses `recordMemorySelection` from `memoryTrust.ts` which is already a pure function
- Single rewrite at the end (batch operation, not per-entry)
- Errors on individual entries do not abort the entire operation

### 2. Prompt Generator Integration

In `generatePrompt()`, after the memory injection block:

```typescript
// Usage stats persistence (fire-and-forget, errors do not block)
let memoryUsagePersistence: { updatedCount: number; skippedCount: number; errorCount: number } | undefined;
if (memoryMode !== "off" && memoryMeta.selectedCount > 0) {
  try {
    const persistResult = await persistMemorySelections(
      /* selected entries from injectMemorySection need to be passed */
    );
    memoryUsagePersistence = {
      updatedCount: persistResult.updatedIds.length,
      skippedCount: persistResult.skippedIds.length,
      errorCount: persistResult.errors.length,
    };
  } catch (err) {
    console.error(`⚠️  Usage stats persistence failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

To pass selected entries, `injectMemorySection` already returns `meta.selectedIds`. We need the actual entry objects. The design modifies the return type of `injectMemorySection` to also include `selectedEntries: DevMemoryEntry[]` in its result, or we re-read and filter. The simpler approach: extend the return value.

**Change to `injectMemorySection`**: Add `selectedEntries` to the return object:

```typescript
export async function injectMemorySection(
  taskText: string,
  mode: MemoryMode,
  storePath?: string,
): Promise<{ section: string; meta: MemoryInjectionMeta; selectedEntries: DevMemoryEntry[] }>
```

This is backward-compatible since callers destructure only what they need.

**Change to `GenerateResult`**: Add optional field:

```typescript
export interface GenerateResult {
  // ... existing fields ...
  memoryUsagePersistence?: {
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
  };
}
```

### 3. CLI Commands

#### `ksk memory usage stats`

Handler: `handleMemoryUsageStats()` in `memoryCommands.ts`

```
function handleMemoryUsageStats():
  entries = await readMemoryEntries()
  active = entries.filter(e => e.enabled && !e.deleted)

  withStats = active.filter(e => e.usageStats && e.usageStats.selectedCount > 0)
  sorted = withStats.sort by selectedCount descending

  if sorted.length === 0:
    print "📭 No usage data available."
    return

  print header: "📊 Memory Usage Statistics ({count} entries with selections):"
  for each entry in sorted:
    print "  [{kind}] {summary}"
    print "    ID: {id} | Selected: {selectedCount} | Last: {lastSelectedAt ?? 'never'}"
```

#### `ksk memory usage reset <id>`

Handler: `handleMemoryUsageReset(args)` in `memoryCommands.ts`

```
function handleMemoryUsageReset(args):
  id = args[0]
  if !id: error and exit

  entries = await readMemoryEntries()
  entry = entries.find(e => e.id === id)

  if !entry: error "ID not found" and exit(1)

  entry.usageStats = {
    selectedCount: 0,
    successfulSelections: 0,
    rejectedSelections: 0,
  }
  // Remove timestamp fields by setting to undefined (they'll be omitted in JSON)
  delete entry.usageStats.lastSelectedAt
  delete entry.usageStats.lastSuccessfulAt

  await rewriteMemoryEntries(entries)
  print "✅ Usage stats reset for: {id}"
```

#### CLI Routing

In `handleMemory`, add routing for `usage` subcommand:

```typescript
case "usage":
  const usageSubcommand = args[1]; // "stats" or "reset"
  if (usageSubcommand === "stats") {
    await handleMemoryUsageStats();
  } else if (usageSubcommand === "reset") {
    await handleMemoryUsageReset(args.slice(2));
  } else {
    showMemoryUsage();
    process.exit(1);
  }
  break;
```

### 4. Health Report Integration

Add to `calculateMemoryHealth` in `memoryHealth.ts`:

```typescript
// Usage-based stats
const neverSelectedCount = activeEntries.filter(e =>
  !e.usageStats || e.usageStats.selectedCount === 0
).length;

const frequentlySelectedCount = activeEntries.filter(e =>
  (e.usageStats?.selectedCount ?? 0) > 20
).length;

const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const recentlyActiveCount = activeEntries.filter(e => {
  if (!e.usageStats?.lastSelectedAt) return false;
  return new Date(e.usageStats.lastSelectedAt).getTime() > thirtyDaysAgo.getTime();
}).length;
```

Add these to `stats` in the report:

```typescript
stats: {
  // ... existing fields ...
  neverSelectedCount: number;
  frequentlySelectedCount: number;
  recentlyActiveCount: number;
}
```

Add finding when neverSelected ratio > 0.5:

```typescript
if (activeEntries.length > 0 && neverSelectedCount / activeEntries.length > 0.5) {
  findings.push({
    type: "stale",
    severity: "warning",
    message: `${neverSelectedCount} of ${activeEntries.length} active entries have never been selected`,
    suggestedCommand: "kiro-studio-kit memory usage stats",
  });
}
```

### 5. Public API Exports

Add to `src/index.ts`:

```typescript
export { persistMemorySelections } from "./core/memoryUsagePersistence.js";
export type { UsagePersistenceResult } from "./core/memoryUsagePersistence.js";
export { handleMemoryUsageStats, handleMemoryUsageReset } from "./core/memoryCommands.js";
```

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/core/memoryUsagePersistence.ts` | New | Core persistence logic |
| `src/core/promptGenerator.ts` | Modified | Call persistence after injection |
| `src/core/memoryInjector.ts` | Modified | Return `selectedEntries` in result |
| `src/core/memoryCommands.ts` | Modified | Add `usage stats` and `usage reset` handlers |
| `src/core/memoryHealth.ts` | Modified | Add usage-based findings and stats |
| `src/index.ts` | Modified | Export new symbols |
| `src/__tests__/memoryUsagePersistence.test.ts` | New | Unit tests |
| `src/__tests__/memoryUsagePersistence.property.test.ts` | New | Property-based tests |

## Correctness Properties

### Property 1: selectedCount Monotonically Increases

For any valid array of selected entries where the store entry is eligible (enabled, not deleted, not quarantined), after `persistMemorySelections` completes, the `selectedCount` of each updated entry in the store is strictly greater than its value before the call.

**Pattern**: Metamorphic — `after.selectedCount > before.selectedCount`

### Property 2: Quarantined Entries Are Never Modified

For any array of selected entries where the matching store entry has `captureStatus === "quarantined"`, after `persistMemorySelections` completes, the quarantined entry in the store is byte-for-byte identical to its state before the call.

**Pattern**: Invariant — quarantined entries are immutable during persistence

### Property 3: Deleted Entries Are Never Modified

For any array of selected entries where the matching store entry has `deleted === true`, after `persistMemorySelections` completes, the deleted entry in the store is byte-for-byte identical to its state before the call.

**Pattern**: Invariant — deleted entries are immutable during persistence

### Property 4: Usage Reset Always Zeroes selectedCount

For any valid entry ID that exists in the store, after `usage reset` is applied, the entry's `usageStats.selectedCount` equals 0, `successfulSelections` equals 0, and `rejectedSelections` equals 0.

**Pattern**: Idempotence — reset is a fixed-point operation (reset(reset(x)) === reset(x))

### Property 5: Persisted selectedCount Equals Original + 1

For any single eligible entry with original `selectedCount` of N, after one call to `persistMemorySelections` containing that entry, the store entry's `selectedCount` equals N + 1.

**Pattern**: Metamorphic — `after === before + 1`

## Testing Strategy

- **Property-based tests**: 5 properties, 100 runs each using fast-check
- **Unit tests**: 10+ tests covering happy paths, edge cases, error handling, and CLI output
- **Integration**: Verify prompt generation succeeds with and without persistence failures
- **Quality gates**: typecheck, lint, test, build must all pass
