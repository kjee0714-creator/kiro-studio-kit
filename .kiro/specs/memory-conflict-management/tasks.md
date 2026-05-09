# Tasks

## 1. Extend DevMemoryEntry Schema

- [ ] 1.1 Add optional `supersededBy` field (string) to DevMemoryEntry interface in memoryValidator.ts
- [ ] 1.2 Add optional `disabledReason` field (string) to DevMemoryEntry interface in memoryValidator.ts
- [ ] 1.3 Add validation logic for `supersededBy` in validateDevMemoryEntry: must be a string if provided, non-string rejects with error
- [ ] 1.4 Add validation logic for `disabledReason` in validateDevMemoryEntry: must be a string if provided, non-string rejects with error
- [ ] 1.5 Verify existing entries without new fields still pass validation (backward compatibility)
- [ ] 1.6 Export new types from src/index.ts if needed

## 2. Create memoryConflict.ts Module

- [ ] 2.1 Create src/core/memoryConflict.ts with imports from memoryValidator, memoryStore, memoryAuditLog, and memoryInjectionPolicy (getTrustPriority)
- [ ] 2.2 Implement `isSupersededMemory(entry)` — returns true if entry.supersededBy is a non-empty string
- [ ] 2.3 Implement `groupByConflictGroup(entries)` — returns Map<string, DevMemoryEntry[]> grouping entries by conflictKey (entries without conflictKey excluded)
- [ ] 2.4 Implement `selectConflictWinners(entries)` — for each conflict group, select entry with highest getTrustPriority (stable: first wins ties), return Set<string> of winner IDs
- [ ] 2.5 Implement `supersedeMemory(oldId, newerId, storePath?)` — read entries, validate both IDs exist, set older entry enabled=false/disabledReason="superseded"/supersededBy=newerId, add oldId to newer.supersedes, rewrite store, emit audit event (non-blocking)
- [ ] 2.6 Implement `setMemoryConflictGroup(conflictKey, ids, storePath?)` — validate ids.length >= 2, validate all IDs exist, set conflictKey on each, rewrite store, emit audit event (non-blocking)
- [ ] 2.7 Define and export SupersedeResult and SetConflictGroupResult interfaces

## 3. Integrate Conflict Resolution into Injection Policy

- [ ] 3.1 Import isSupersededMemory, groupByConflictGroup, selectConflictWinners from memoryConflict.ts into memoryInjectionPolicy.ts
- [ ] 3.2 Add Step 3 (superseded exclusion) after high-rejection exclusion: exclude entries where isSupersededMemory returns true, record decision with reason "Superseded by <id>"
- [ ] 3.3 Add Step 4 (conflict group resolution) after superseded exclusion: compute winners, exclude non-winners with reason "Conflict group '<key>' — winner is <winnerId>"
- [ ] 3.4 Add `supersededExcludedCount` and `conflictExcludedCount` to MemoryInjectionPolicyResult.stats interface
- [ ] 3.5 Populate new stats fields from exclusion counts in applyMemoryInjectionPolicy
- [ ] 3.6 Update existing pipeline steps numbering (sort becomes Step 5, maxTotal becomes Step 6, etc.)

## 4. Add CLI Conflict Commands

- [ ] 4.1 Add `handleMemoryConflict(args)` function in memoryCommands.ts with subcommand routing for group/supersede/inspect/list
- [ ] 4.2 Implement `handleConflictGroup(args)` — parse conflictKey and IDs from args, call setMemoryConflictGroup, display success message
- [ ] 4.3 Implement `handleConflictSupersede(args)` — parse oldId and newId from args, call supersedeMemory, display success message
- [ ] 4.4 Implement `handleConflictInspect(args)` — read entries, find by ID, display conflictKey/supersededBy/disabledReason/supersedes fields
- [ ] 4.5 Implement `handleConflictList()` — read entries, group by conflictKey, display each group with member summaries
- [ ] 4.6 Add `showConflictUsage()` helper displaying usage for conflict subcommands
- [ ] 4.7 Route "conflict" subcommand in handleMemory function
- [ ] 4.8 Update showMemoryUsage() to include conflict commands

## 5. Export Public API

- [ ] 5.1 Export isSupersededMemory, groupByConflictGroup, selectConflictWinners, supersedeMemory, setMemoryConflictGroup from src/index.ts
- [ ] 5.2 Export SupersedeResult and SetConflictGroupResult types from src/index.ts

## 6. Write Unit Tests

- [ ] 6.1 Create src/__tests__/memoryConflict.test.ts with test for isSupersededMemory returning true when supersededBy is set
- [ ] 6.2 Add test for isSupersededMemory returning false when supersededBy is undefined/empty
- [ ] 6.3 Add test for groupByConflictGroup correctly grouping entries by conflictKey
- [ ] 6.4 Add test for groupByConflictGroup excluding entries without conflictKey
- [ ] 6.5 Add test for selectConflictWinners picking highest trust priority entry
- [ ] 6.6 Add test for selectConflictWinners stable tie-breaking (first entry wins)
- [ ] 6.7 Add test for supersedeMemory setting all fields on old and new entries correctly
- [ ] 6.8 Add test for supersedeMemory throwing on missing oldId
- [ ] 6.9 Add test for supersedeMemory throwing on missing newerId
- [ ] 6.10 Add test for supersedeMemory not deleting any entries (count preserved)
- [ ] 6.11 Add test for setMemoryConflictGroup setting conflictKey on all specified entries
- [ ] 6.12 Add test for setMemoryConflictGroup throwing when fewer than 2 IDs provided
- [ ] 6.13 Add test for setMemoryConflictGroup throwing on missing ID
- [ ] 6.14 Add test for setMemoryConflictGroup not modifying entries outside the ID list
- [ ] 6.15 Add test for injection policy excluding entries with supersededBy set
- [ ] 6.16 Add test for injection policy including at most 1 entry per conflictKey
- [ ] 6.17 Add test for injection policy stats including supersededExcludedCount and conflictExcludedCount
- [ ] 6.18 Add test for validator accepting entries with supersededBy string field
- [ ] 6.19 Add test for validator rejecting entries with supersededBy non-string value
- [ ] 6.20 Add test for validator accepting entries with disabledReason string field
- [ ] 6.21 Add test for validator rejecting entries with disabledReason non-string value
- [ ] 6.22 Add test for CLI conflict group command calling setMemoryConflictGroup
- [ ] 6.23 Add test for CLI conflict supersede command calling supersedeMemory
- [ ] 6.24 Add test for CLI conflict list displaying grouped entries
- [ ] 6.25 Add test for CLI conflict inspect showing conflict fields

## 7. Write Property-Based Tests

- [ ] 7.1 Create src/__tests__/memoryConflict.property.test.ts with fast-check arbitrary for DevMemoryEntry with conflict fields
- [ ] 7.2 Property 1: Entries with supersededBy set are never included in applyMemoryInjectionPolicy output (100 runs)
- [ ] 7.3 Property 2: At most 1 entry per conflictKey in applyMemoryInjectionPolicy output (100 runs)
- [ ] 7.4 Property 3: Conflict winner has highest trust priority within its group (100 runs)
- [ ] 7.5 Property 4: supersedeMemory preserves total entry count (never physically deletes) (100 runs)
- [ ] 7.6 Property 5: setMemoryConflictGroup updates exactly the requested IDs and no others (100 runs)

## 8. Quality Gate Verification

- [ ] 8.1 Run npm run typecheck and fix any type errors
- [ ] 8.2 Run npm run lint and fix any lint errors
- [ ] 8.3 Run npm test and verify all tests pass (existing + new)
- [ ] 8.4 Run npm run build and verify successful compilation

