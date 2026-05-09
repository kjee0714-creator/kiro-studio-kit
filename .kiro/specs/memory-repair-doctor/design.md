# Design: Memory Repair / Doctor (Phase 4-O)

## Module: `src/core/memoryDoctor.ts`
## Detection: Pure function `detectMemoryIssues(entries, now?)` → `MemoryDoctorReport`
## Repair: Pure function `applyMemoryRepairs(entries, report)` → repaired entries + result
## Persistence: `repairMemoryStore(options?)` — loads, detects, optionally repairs, rewrites, audits
## CLI: `memory doctor` (report) / `memory repair --dry-run` / `memory repair apply`
## Health: Add repairableIssueCount/doctorWarningCount/doctorErrorCount
## Audit: eventType `"manual_update"`, actor `"doctor"`, operation `"repair"`
