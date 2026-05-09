# Requirements: Memory Repair / Doctor (Phase 4-O)

## Requirement 1: Detect Memory Issues
- Detect: missing supersede/duplicate/merge targets, invalid conflict groups, relation mismatches, enabled/disabled contradictions, expired-but-enabled, temporary without expiry, circular references, stale unreviewed

## Requirement 2: Repair Safe Issues
- Repair only `repairable=true` issues; never repair circular references or invalid scope
- No physical deletion; no trust level changes

## Requirement 3: Dry-run Repair
- dry-run detects and reports without modifying store or audit

## Requirement 4: Repair Persistence
- Apply repairs via rewriteMemoryEntries; audit per repaired entry; audit failure non-blocking

## Requirement 5: Doctor CLI
- `ksk memory doctor` — report only

## Requirement 6: Repair CLI
- `ksk memory repair --dry-run` / `ksk memory repair apply`

## Requirement 7: Health Integration
- repairableIssueCount/doctorWarningCount/doctorErrorCount in health stats

## Requirement 8: Property-Based Tests
- repair never deletes entries (100 runs)
- repairable issues are normalized (100 runs)
- dry-run never mutates store (100 runs)
- circular references never auto-repaired (100 runs)
- unrelated entries unchanged (100 runs)
