# Tasks: Selection Feedback (Phase 4-F)

## 1. Schema Extension

- [ ] 1.1 Add `lastRejectedAt?: string` field to the `MemoryUsageStats` interface in `src/core/memoryValidator.ts`
- [ ] 1.2 Add validation for `lastRejectedAt` in the `validateDevMemoryEntry` function: if provided, must be a string
- [ ] 1.3 Verify existing validator tests still pass with the new optional field

## 2. Pure Feedback Functions

- [ ] 2.1 Implement `recordMemorySelectionSuccess` in `src/core/memoryTrust.ts` — increments successfulSelections by 1, updates lastSuccessfulAt, preserves selectedCount and rejectedSelections, initializes usageStats if undefined, returns new object
- [ ] 2.2 Implement `recordMemorySelectionRejection` in `src/core/memoryTrust.ts` — increments rejectedSelections by 1, updates lastRejectedAt, preserves selectedCount and successfulSelections, initializes usageStats if undefined, returns new object
- [ ] 2.3 Export both functions from `src/core/memoryTrust.ts`

## 3. Persistence Functions

- [ ] 3.1 Add `MemoryFeedbackResult` interface to `src/core/memoryUsagePersistence.ts` with `updatedId?: string` and `error?: string`
- [ ] 3.2 Implement `markMemorySelectionSuccess` in `src/core/memoryUsagePersistence.ts` — reads store, finds entry by ID, returns error for not_found/deleted, applies pure function, rewrites store, records audit event with eventType "feedback" and metadata.feedback="success", returns { updatedId }
- [ ] 3.3 Implement `markMemorySelectionRejected` in `src/core/memoryUsagePersistence.ts` — reads store, finds entry by ID, returns error for not_found/deleted, allows quarantined entries, applies pure function, rewrites store, records audit event with eventType "feedback" and metadata.feedback="rejected", returns { updatedId }
- [ ] 3.4 Ensure audit failure does not prevent successful persistence result in both functions

## 4. CLI Commands

- [ ] 4.1 Add `handleMemoryUsageMarkSuccess` handler in `src/core/memoryCommands.ts` — parses ID and optional --reason, calls markMemorySelectionSuccess, outputs result or error
- [ ] 4.2 Add `handleMemoryUsageMarkRejected` handler in `src/core/memoryCommands.ts` — parses ID and optional --reason, calls markMemorySelectionRejected, outputs result or error
- [ ] 4.3 Extend the `usage` subcommand routing in `handleMemory` to dispatch `mark-success` and `mark-rejected` to the new handlers
- [ ] 4.4 Update `showMemoryUsage` help text to include the new `mark-success` and `mark-rejected` commands

## 5. Usage Stats Display Extension

- [ ] 5.1 Extend `handleMemoryUsageStats` in `src/core/memoryCommands.ts` to compute and display total successfulSelections across all active entries
- [ ] 5.2 Extend `handleMemoryUsageStats` to compute and display total rejectedSelections across all active entries
- [ ] 5.3 Extend `handleMemoryUsageStats` to compute and display successRate as success/(success+rejected) rounded to 2 decimal places, or "n/a" when denominator is 0

## 6. Health Monitor Integration

- [ ] 6.1 Add `feedbackRecordedCount?: number` and `highRejectionCount?: number` to the `stats` type in `MemoryHealthReport` in `src/core/memoryHealth.ts`
- [ ] 6.2 Compute `feedbackRecordedCount` in `calculateMemoryHealth` — count of active entries with successfulSelections > 0 or rejectedSelections > 0
- [ ] 6.3 Compute `highRejectionCount` in `calculateMemoryHealth` — count of active entries where rejectedSelections > successfulSelections AND rejectedSelections >= 3
- [ ] 6.4 Emit a warning-severity finding of type "stale" when highRejectionCount > 0 with message indicating the count

## 7. Public API Exports

- [ ] 7.1 Export `recordMemorySelectionSuccess` and `recordMemorySelectionRejection` from `src/index.ts`
- [ ] 7.2 Export `markMemorySelectionSuccess`, `markMemorySelectionRejected`, and `MemoryFeedbackResult` type from `src/index.ts`
- [ ] 7.3 Export `handleMemoryUsageMarkSuccess` and `handleMemoryUsageMarkRejected` from `src/index.ts`

## 8. Unit Tests

- [ ] 8.1 Create `src/__tests__/selectionFeedback.test.ts` with test: `recordMemorySelectionSuccess` increments successfulSelections by 1
- [ ] 8.2 Add test: `recordMemorySelectionSuccess` updates lastSuccessfulAt to ISO timestamp
- [ ] 8.3 Add test: `recordMemorySelectionRejection` increments rejectedSelections by 1
- [ ] 8.4 Add test: `recordMemorySelectionRejection` updates lastRejectedAt to ISO timestamp
- [ ] 8.5 Add test: selectedCount unchanged by both `recordMemorySelectionSuccess` and `recordMemorySelectionRejection`
- [ ] 8.6 Add test: `markMemorySelectionSuccess` with unknown ID returns `{ error: "not_found" }`
- [ ] 8.7 Add test: `markMemorySelectionSuccess` with deleted entry returns `{ error: "entry_deleted" }`
- [ ] 8.8 Add test: `markMemorySelectionRejected` with quarantined entry allows feedback and returns `{ updatedId }`
- [ ] 8.9 Add test: audit event is recorded after successful `markMemorySelectionSuccess`
- [ ] 8.10 Add test: `handleMemoryUsageStats` output includes successRate
- [ ] 8.11 Add test: `calculateMemoryHealth` includes feedbackRecordedCount and highRejectionCount in stats
- [ ] 8.12 Add test: `calculateMemoryHealth` emits warning finding when highRejectionCount > 0

## 9. Property-Based Tests

- [ ] 9.1 Create `src/__tests__/selectionFeedback.property.test.ts` with property: `recordMemorySelectionSuccess` increments only successfulSelections (100 runs, fast-check)
- [ ] 9.2 Add property: `recordMemorySelectionRejection` increments only rejectedSelections (100 runs, fast-check)
- [ ] 9.3 Add property: selectedCount unchanged by either feedback function (100 runs, fast-check)
- [ ] 9.4 Add property: successRate in [0, 1] when (successfulSelections + rejectedSelections) > 0 (100 runs, fast-check)
- [ ] 9.5 Add property: feedback audit events have before/after with valid numeric counts (100 runs, fast-check)

## 10. Quality Gates

- [ ] 10.1 Run `npm run typecheck` and verify zero errors
- [ ] 10.2 Run `npm run lint` and verify zero errors
- [ ] 10.3 Run `npm run test` and verify all tests pass (including new tests)
- [ ] 10.4 Run `npm run build` and verify successful compilation
