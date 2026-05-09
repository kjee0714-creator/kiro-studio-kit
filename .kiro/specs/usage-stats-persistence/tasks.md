# Tasks

## 1. Create `memoryUsagePersistence.ts` Module

- [ ] 1.1 Create `src/core/memoryUsagePersistence.ts` with `UsagePersistenceResult` interface and `persistMemorySelections` function signature
- [ ] 1.2 Implement `persistMemorySelections` logic: read store, match by ID, check eligibility (enabled, not deleted, not quarantined), apply `recordMemorySelection`, collect results
- [ ] 1.3 Handle edge cases: entry not found in store (add to skippedIds), individual entry errors (add to errors array, continue processing)
- [ ] 1.4 Perform single batch `rewriteMemoryEntries` at the end with all updated entries

## 2. Extend `injectMemorySection` Return Value

- [ ] 2.1 Modify `injectMemorySection` in `src/core/memoryInjector.ts` to include `selectedEntries: DevMemoryEntry[]` in the return object (the `result.selected` array)
- [ ] 2.2 Update existing tests that destructure the return value to ensure backward compatibility

## 3. Integrate Persistence into Prompt Generator

- [ ] 3.1 Add `memoryUsagePersistence` optional field to `GenerateResult` interface in `src/core/promptGenerator.ts`
- [ ] 3.2 Import `persistMemorySelections` in `promptGenerator.ts`
- [ ] 3.3 After memory injection, call `persistMemorySelections` with selected entries when `memoryMode !== "off"` and `selectedCount > 0`
- [ ] 3.4 Wrap persistence call in try/catch — on failure, emit `console.error` warning and continue
- [ ] 3.5 On success, populate `memoryUsagePersistence` in the returned `GenerateResult`

## 4. Add CLI `usage stats` Command

- [ ] 4.1 Implement `handleMemoryUsageStats()` in `src/core/memoryCommands.ts`: read entries, filter active, sort by selectedCount descending, display table
- [ ] 4.2 Handle empty case: display "no usage data available" message
- [ ] 4.3 Add routing for `usage` subcommand in `handleMemory` dispatcher (route `usage stats` and `usage reset`)

## 5. Add CLI `usage reset` Command

- [ ] 5.1 Implement `handleMemoryUsageReset(args)` in `src/core/memoryCommands.ts`: parse ID, find entry, reset usageStats to zeroes, remove timestamp fields
- [ ] 5.2 Handle error case: ID not found — display error and exit(1)
- [ ] 5.3 Rewrite store and display confirmation message on success

## 6. Extend Health Report with Usage Findings

- [ ] 6.1 Add `neverSelectedCount`, `frequentlySelectedCount`, and `recentlyActiveCount` to health report stats in `src/core/memoryHealth.ts`
- [ ] 6.2 Add finding of type `"stale"` with severity `"warning"` when neverSelected/activeEntries ratio exceeds 0.5
- [ ] 6.3 Update `handleMemoryHealth` CLI output to display usage stats in the report

## 7. Update Public API Exports

- [ ] 7.1 Export `persistMemorySelections` and `UsagePersistenceResult` from `src/index.ts`
- [ ] 7.2 Export `handleMemoryUsageStats` and `handleMemoryUsageReset` from `src/index.ts`
- [ ] 7.3 Update CLI usage help text in `showMemoryUsage()` to include `usage stats` and `usage reset` commands

## 8. Write Unit Tests

- [ ] 8.1 Create `src/__tests__/memoryUsagePersistence.test.ts`
- [ ] 8.2 Test: `persistMemorySelections` updates `selectedCount` for eligible entries
- [ ] 8.3 Test: `persistMemorySelections` updates `lastSelectedAt` timestamp
- [ ] 8.4 Test: disabled entries are skipped (added to skippedIds)
- [ ] 8.5 Test: deleted entries are skipped (added to skippedIds)
- [ ] 8.6 Test: quarantined entries are skipped (added to skippedIds)
- [ ] 8.7 Test: entry not found in store is skipped
- [ ] 8.8 Test: persistence failure in prompt generator does not throw (prompt generation succeeds)
- [ ] 8.9 Test: `handleMemoryUsageStats` displays entries sorted by selectedCount
- [ ] 8.10 Test: `handleMemoryUsageReset` resets usageStats to zero values
- [ ] 8.11 Test: `handleMemoryUsageReset` errors on unknown ID
- [ ] 8.12 Test: health report includes usage findings when neverSelected ratio > 0.5

## 9. Write Property-Based Tests

- [ ] 9.1 Create `src/__tests__/memoryUsagePersistence.property.test.ts`
- [ ] 9.2 Property 1: selectedCount monotonically increases after persistence (for eligible entries, after.selectedCount > before.selectedCount)
- [ ] 9.3 Property 2: persistMemorySelections never modifies quarantined entries (quarantined entry state is identical before and after)
- [ ] 9.4 Property 3: persistMemorySelections never modifies deleted entries (deleted entry state is identical before and after)
- [ ] 9.5 Property 4: usage reset always returns selectedCount = 0 (idempotent: reset(reset(x)) === reset(x))
- [ ] 9.6 Property 5: persisted selectedCount equals original + 1 per persistence operation (single increment invariant)

## 10. Verify Quality Gates

- [ ] 10.1 Run `npm run typecheck` and fix any type errors
- [ ] 10.2 Run `npm run lint` and fix any lint violations
- [ ] 10.3 Run `npm test` and ensure all tests pass (existing + new)
- [ ] 10.4 Run `npm run build` and ensure clean compilation
