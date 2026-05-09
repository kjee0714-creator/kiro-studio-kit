# Design Document

## Overview

This design adds a Memory Injection Policy module that acts as a post-selection filter in the memory injection pipeline. It receives candidate entries from the existing selector, applies trust-based prioritization and quota enforcement, and returns the final list of entries to be injected into the prompt.

## Architecture

### File Structure

```
src/core/
  memoryInjectionPolicy.ts    — New pure-function policy module
  memoryInjector.ts           — Extended to integrate policy
src/__tests__/
  memoryInjectionPolicy.test.ts          — Unit tests
  memoryInjectionPolicy.property.test.ts — Property-based tests (5 properties, 100 runs)
```

### Design Decisions

1. **Separate module**: The policy logic is distinct from scoring/selection and from trust lifecycle. A dedicated module keeps concerns separated and makes the policy independently testable.

2. **Post-selection filter**: The policy does not replace the existing selector. It receives already-scored candidates and applies trust/quota rules as a final gate. This preserves backward compatibility.

3. **Pure function**: `applyMemoryInjectionPolicy` is a pure function with no I/O. It does not read the store, write audit events, or modify trust levels.

4. **Stable sort**: Trust-based reordering uses a stable sort so that entries with equal trust priority retain their original relevance-based order from the selector.

5. **Minimum guarantees**: Even when all entries are autoCaptured or probation, at least 1 entry is included (if any valid candidates exist). This prevents empty injection when the store only contains auto-captured probation entries.

## Pipeline Flow

```
readMemoryEntries()
  → selectMemoryEntries(entries, taskText, mode)    [existing]
  → applyMemoryInjectionPolicy(selected, config)   [NEW]
  → formatMemorySection(policyResult.selectedEntries)
  → persistMemorySelections(policyResult.selectedEntries)
```

## Module: `memoryInjectionPolicy.ts`

### Types

```typescript
export interface MemoryInjectionPolicyConfig {
  maxTotalEntries: number;
  maxProbationEntries: number;
  maxAutoCapturedRatio: number;
  suppressHighRejection: boolean;
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
  };
}
```

### Default Config

```typescript
export const DEFAULT_MEMORY_INJECTION_POLICY: MemoryInjectionPolicyConfig = {
  maxTotalEntries: 5,
  maxProbationEntries: 1,
  maxAutoCapturedRatio: 0.5,
  suppressHighRejection: true,
};
```

### Main Function

```typescript
export function applyMemoryInjectionPolicy(
  entries: DevMemoryEntry[],
  config?: Partial<MemoryInjectionPolicyConfig>,
): MemoryInjectionPolicyResult;
```

### Helper Functions

```typescript
export function isHighRejectionMemory(entry: DevMemoryEntry): boolean;
export function isAutoCapturedMemory(entry: DevMemoryEntry): boolean;
export function getTrustPriority(entry: DevMemoryEntry): number;
```

## Algorithm

1. **Merge config** with defaults
2. **Exclude ineligible entries**: deleted, disabled, discarded
3. **Exclude high rejection entries** (if `suppressHighRejection === true`)
4. **Stable sort by trust priority**: verified (300) > trusted (200) > probation (100) > undefined (50). Within same priority, preserve input order.
5. **Enforce maxTotalEntries**: Take top N entries
6. **Enforce maxProbationEntries**: If probation count exceeds limit, remove lowest-priority probation entries from the end
7. **Enforce maxAutoCapturedRatio**: If autoCaptured ratio exceeds limit, remove lowest-priority autoCaptured entries until ratio is met or only 1 remains
8. **Build decisions and stats**

## Helper Definitions

### `isHighRejectionMemory`

```typescript
export function isHighRejectionMemory(entry: DevMemoryEntry): boolean {
  const rejected = entry.usageStats?.rejectedSelections ?? 0;
  const successful = entry.usageStats?.successfulSelections ?? 0;
  return rejected >= 3 && rejected > successful;
}
```

### `isAutoCapturedMemory`

Uses the existing `autoCaptured` boolean field on DevMemoryEntry (Phase 4-A):

```typescript
export function isAutoCapturedMemory(entry: DevMemoryEntry): boolean {
  return entry.autoCaptured === true;
}
```

### `getTrustPriority`

```typescript
export function getTrustPriority(entry: DevMemoryEntry): number {
  switch (entry.trustLevel) {
    case "verified": return 300;
    case "trusted": return 200;
    case "probation": return 100;
    default: return 50;
  }
}
```

## Integration with `memoryInjector.ts`

### Changes to `injectMemorySection`

```typescript
export async function injectMemorySection(
  taskText: string,
  mode: MemoryMode,
  storePath?: string,
): Promise<{ section: string; meta: MemoryInjectionMeta; selectedEntries: DevMemoryEntry[] }> {
  const entries = await readMemoryEntries(storePath);
  const result = selectMemoryEntries(entries, taskText, mode);

  // NEW: Apply injection policy
  const policyResult = applyMemoryInjectionPolicy(result.selected);

  const section = formatMemorySection(policyResult.selectedEntries);

  // Meta uses post-policy entries
  const meta: MemoryInjectionMeta = {
    ...existingMeta,
    selectedCount: policyResult.selectedEntries.length,
    selectedIds: policyResult.selectedEntries.map(e => e.id),
    policy: policyResult.stats,
  };

  return { section, meta, selectedEntries: policyResult.selectedEntries };
}
```

### Meta Extension

```typescript
export interface MemoryInjectionMeta {
  // ... existing fields ...
  policy?: {
    inputCount: number;
    outputCount: number;
    excludedCount: number;
    probationIncludedCount: number;
    autoCapturedIncludedCount: number;
    highRejectionExcludedCount: number;
  };
}
```

## Usage Persistence

The `selectedEntries` returned by `injectMemorySection` are post-policy. The existing `persistMemorySelections(selectedEntries)` call in `promptGenerator.ts` already uses this return value, so entries excluded by policy will NOT have their `selectedCount` incremented. No change needed in `promptGenerator.ts`.

## Public API Exports

From `src/index.ts`:
- Types: `MemoryInjectionPolicyConfig`, `MemoryInjectionPolicyDecision`, `MemoryInjectionPolicyResult`
- Functions: `applyMemoryInjectionPolicy`, `isHighRejectionMemory`, `isAutoCapturedMemory`, `getTrustPriority`
- Constant: `DEFAULT_MEMORY_INJECTION_POLICY`

## Correctness Properties

| # | Property | Pattern | Testable |
|---|----------|---------|----------|
| 1 | Result length <= maxTotalEntries | Invariant | yes - property |
| 2 | Probation included <= maxProbationEntries | Invariant | yes - property |
| 3 | Deleted/disabled/discarded never included | Invariant | yes - property |
| 4 | High rejection excluded when suppressed | Invariant | yes - property |
| 5 | Input entries not mutated | Purity | yes - property |

## Error Handling

- Empty input array: returns empty result with zero stats
- All entries excluded: returns empty selectedEntries (valid state)
- Invalid config values: merged with defaults, negative values treated as 0

## Dependencies

- No new runtime dependencies
- Uses existing: `memoryValidator.ts` types
- Test dependencies: `vitest`, `fast-check` (already in devDependencies)

