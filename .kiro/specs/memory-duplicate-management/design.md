# Design: Memory Duplicate Management (Phase 4-L)

## Schema
- Reuse existing `duplicateOf?: string`
- Add `duplicates?: string[]` to DevMemoryEntry (canonical's list of duplicate IDs)
- Add `mergedInto?: string` to DevMemoryEntry (entry merged into another)
- Reuse existing `disabledReason?: string` (Phase 4-K)

## Module: `src/core/memoryDuplicate.ts`
- Pure helpers: `isDuplicateMemory`, `isMergedMemory`, `getCanonicalMemoryId`, `listDuplicateGroups`, `findDuplicateInfo`
- Persistence: `markMemoryDuplicate`, `clearMemoryDuplicate`

## Injection Policy Integration
Pipeline after superseded exclusion (Step 3), before conflict groups (Step 4→5):
- Step 4 (new): Exclude duplicate/merged entries

## CLI: `memory duplicate mark|clear|inspect|list`
## Audit: eventType `"manual_update"`, operations `"mark_duplicate"` / `"clear_duplicate"`
## Public API: Export all helpers, persistence functions, and types from `src/index.ts`
