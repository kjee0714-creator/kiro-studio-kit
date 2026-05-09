# Requirements: Memory Duplicate Management (Phase 4-L)

## Requirement 1: Schema Extension
- `duplicateOf?: string` (reuse existing), `duplicates?: string[]` (new), `mergedInto?: string` (new)
- Validation rejects non-string/non-array types
- Backward compatible with existing entries

## Requirement 2: Mark Duplicate
- `markMemoryDuplicate(canonicalId, duplicateId)` sets duplicate entry: `duplicateOf=canonicalId`, `enabled=false`, `disabledReason="duplicate"`
- canonical entry's `duplicates` includes duplicateId (no duplicates in array)
- No physical deletion; audit event recorded; audit failure non-blocking

## Requirement 3: Clear Duplicate
- `clearMemoryDuplicate(duplicateId)` removes `duplicateOf` and `disabledReason="duplicate"` from duplicate entry
- Removes duplicateId from canonical's `duplicates` array
- Default: does NOT re-enable; `reEnable=true` sets `enabled=true`
- Audit event recorded; audit failure non-blocking

## Requirement 4: Injection Policy Duplicate Handling
- Entries with `duplicateOf` set are excluded from injection
- Entries with `mergedInto` set are excluded from injection
- Decisions include exclusion reason; stats include `duplicateExcludedCount` and `mergedExcludedCount`

## Requirement 5: CLI Duplicate Commands
- `memory duplicate mark <canonical-id> <duplicate-id>` / `clear <duplicate-id> [--re-enable]` / `inspect <id>` / `list`

## Requirement 6: Property-Based Tests
- duplicateOf entries never in injection policy output (100 runs)
- mergedInto entries never in injection policy output (100 runs)
- markMemoryDuplicate preserves entry count (100 runs)
- markMemoryDuplicate updates only canonical and duplicate entries (100 runs)
- clearMemoryDuplicate removes relation without physically deleting (100 runs)
