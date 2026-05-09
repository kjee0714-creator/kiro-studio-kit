# Tasks

## 1. Create Pure Function Module (`pendingOperations.ts`)

- [ ] 1.1 Create `src/core/pendingOperations.ts` with type definitions: `PendingPromoteResult`, `PendingDiscardResult`, `PendingPruneCandidate`, `PendingStatsResult`
- [ ] 1.2 Implement `isPendingEntry(entry)` — returns true if `deleted !== true`
- [ ] 1.3 Implement `promotePendingEntry(entry, now?)` — returns new entry with `captureStatus="active"`, `enabled=true`, `trustLevel="probation"`, `authority="hint"`, `promotedAt=now`
- [ ] 1.4 Implement `promoteAllPendingEntries(entries, now?)` — returns `{ promoted, remaining }` where promoted are non-deleted entries with promotion fields set, remaining are deleted entries unchanged
- [ ] 1.5 Implement `discardPendingEntry(entries, id)` — returns `{ updated, discardedEntry }` with target entry's `captureStatus` set to `"discarded"`; throws if not found or deleted
- [ ] 1.6 Implement `classifyPrunePendingCandidates(entries, thresholdDays?, now?)` — returns entries older than threshold (default 30 days) that are non-deleted and not already discarded
- [ ] 1.7 Implement `applyPrunePendingEntries(entries, candidateIds)` — returns entries array with candidates' `captureStatus` set to `"discarded"`
- [ ] 1.8 Implement `computePendingStats(entries, now?)` — returns `{ pendingCount, oldPendingCount, oldestPendingAt }`
- [ ] 1.9 Export all functions and types from `src/core/pendingOperations.ts`

## 2. Extend CLI Routing and Handlers

- [ ] 2.1 Add audit event recording (try/catch) to existing `handlePendingPromote` in `memoryCommands.ts`
- [ ] 2.2 Implement `handlePendingInspect(args)` — reads pending store, finds entry by ID, displays full details; errors on not-found or deleted
- [ ] 2.3 Implement `handlePendingPromoteAll()` — reads pending store, calls `promoteAllPendingEntries`, appends each to active store, rewrites pending store, records audit events
- [ ] 2.4 Implement `handlePendingDiscard(args)` — reads pending store, calls `discardPendingEntry`, rewrites pending store, records audit event
- [ ] 2.5 Implement `handlePendingPrune(args)` — parses `--older-than-days N` and `--dry-run` flags, calls `classifyPrunePendingCandidates`, applies or displays candidates, records audit events
- [ ] 2.6 Implement `handlePendingStats()` — reads pending store, calls `computePendingStats`, displays results
- [ ] 2.7 Extend `handleMemoryPending` routing to dispatch `inspect`, `discard`, `prune`, `stats` subcommands and `--all` flag on `promote`
- [ ] 2.8 Update `showMemoryUsage()` help text to include new pending subcommands

## 3. Public API Exports

- [ ] 3.1 Export `pendingOperations.ts` types and functions from `src/index.ts`
- [ ] 3.2 Export new handler functions (`handlePendingInspect`, `handlePendingPromoteAll`, `handlePendingDiscard`, `handlePendingPrune`, `handlePendingStats`) from `src/index.ts`

## 4. Unit Tests

- [ ] 4.1 Create `src/__tests__/pendingOperations.test.ts` with test scaffolding and imports
- [ ] 4.2 Test: `pending inspect` shows full details for a valid pending entry
- [ ] 4.3 Test: `pending inspect` with non-existent ID prints error and exits with code 1
- [ ] 4.4 Test: `pending inspect` with deleted entry prints error and exits with code 1
- [ ] 4.5 Test: `promote` single records audit event with eventType "promote"
- [ ] 4.6 Test: `promote --all` promotes all non-deleted pending entries to active store
- [ ] 4.7 Test: `promote --all` with 0 non-deleted pending entries returns empty and prints message
- [ ] 4.8 Test: `discard` sets captureStatus to "discarded" and rewrites pending store
- [ ] 4.9 Test: `discard` with not-found ID returns error
- [ ] 4.10 Test: `discard` with deleted entry returns error
- [ ] 4.11 Test: `prune` discards entries older than threshold
- [ ] 4.12 Test: `prune --dry-run` does not modify pending store
- [ ] 4.13 Test: `prune` with no old entries returns 0 candidates
- [ ] 4.14 Test: `pending stats` shows correct pendingCount, oldPendingCount, oldestPendingAt

## 5. Property-Based Tests

- [ ] 5.1 Create `src/__tests__/pendingOperations.property.test.ts` with fast-check generators for pending entries (non-deleted and deleted variants)
- [ ] 5.2 Property: `promoteAllPendingEntries` only modifies entries where `deleted !== true` (100 runs)
- [ ] 5.3 Property: `discardPendingEntry` only modifies the target entry where `deleted !== true` (100 runs)
- [ ] 5.4 Property: promote and discard never modify entries where `deleted === true` (100 runs)
- [ ] 5.5 Property: `classifyPrunePendingCandidates` does not mutate the input entries array (100 runs)
- [ ] 5.6 Property: `promoteAllPendingEntries` returns `promoted.length` equal to count of non-deleted input entries (100 runs)

## 6. Quality Gates

- [ ] 6.1 Run `npm run typecheck` and verify zero errors
- [ ] 6.2 Run `npm run lint` and verify zero errors
- [ ] 6.3 Run `npm run test` and verify all tests pass (existing 654 + new tests)
- [ ] 6.4 Run `npm run build` and verify successful compilation
