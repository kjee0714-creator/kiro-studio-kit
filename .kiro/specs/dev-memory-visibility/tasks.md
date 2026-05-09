# Implementation Plan: Dev Memory Visibility

## Overview

Add observability to the Development Memory system by implementing detailed scoring with match reasons, extended selection metadata, CLI reporting (`--memory-report`), and inspection commands (`memory inspect`, `memory stats`). Implementation proceeds types-first, then logic, then CLI, then tests, with each step building on the previous.

## Tasks

- [x] 1. Add new types and `scoreEntryDetailed` to memorySelector.ts
  - [x] 1.1 Add `MemoryMatchReason` and `ScoredMemoryEntry` interfaces
    - Add `MemoryMatchReason` interface with `type`, `value`, and `points` fields
    - Add `ScoredMemoryEntry` interface with `entry`, `score`, `reasons`, and `estimatedChars` fields
    - _Requirements: 1.1_

  - [x] 1.2 Extend `SelectionResult` interface with optional new fields
    - Add optional `selectedDetails?: ScoredMemoryEntry[]`
    - Add optional `consideredCount?: number`
    - Add optional `excludedCount?: number`
    - Add optional `totalSelectedChars?: number`
    - Existing `selected` and `totalAvailable` fields remain unchanged
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [x] 1.3 Implement `scoreEntryDetailed` function
    - Mirror the exact logic of `scoreEntry` but collect `MemoryMatchReason` records along the way
    - Compute `estimatedChars` using existing `estimateEntryChars`
    - Return `ScoredMemoryEntry` with score equal to sum of reason points
    - Keep existing `scoreEntry` function unchanged
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

  - [x] 1.4 Update `selectMemoryEntries` to populate new `SelectionResult` fields
    - Use `scoreEntryDetailed` internally to build `selectedDetails`
    - Compute `consideredCount` (entries passing filter), `excludedCount` (entries failing filter)
    - Compute `totalSelectedChars` as sum of `estimatedChars` across selected entries
    - Sort `selectedDetails` by score descending (matching existing sort order)
    - Ensure `selected` and `totalAvailable` remain identical to Phase 1 behavior
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 2. Extend memoryInjector.ts with detailed metadata
  - [x] 2.1 Extend `MemoryInjectionMeta` interface with new optional fields
    - Add `consideredCount?: number`
    - Add `excludedCount?: number`
    - Add `totalSelectedChars?: number`
    - Add `topScore?: number`
    - Add `selectedDetails?: Array<{ id, summary, kind, score, matchedReasons, estimatedChars }>`
    - Import `MemoryMatchReason` type from memorySelector
    - Existing fields remain unchanged
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 2.2 Update `injectMemorySection` to populate new metadata fields
    - Read new fields from `SelectionResult` and map into `MemoryInjectionMeta`
    - Compute `topScore` as max score among selected entries (0 when none selected)
    - Map `selectedDetails` from `ScoredMemoryEntry[]` to the meta detail format
    - When mode is "off", set all new numeric fields to 0 and `selectedDetails` to empty array
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Checkpoint - Verify core logic
  - Ensure all tests pass (`npm run typecheck && npm run test`), ask the user if questions arise.

- [x] 4. Add `memory inspect` and `memory stats` commands to memoryCommands.ts
  - [x] 4.1 Implement `handleMemoryInspect` function
    - Accept args array, extract ID as first positional argument
    - Read all entries from store (including disabled)
    - Find entry by exact ID match
    - Display all fields: id, kind, severity, confidence, enabled, createdAt, summary, trigger, fix, futurePromptHint, relatedFiles, relatedSymbols, tags
    - Also display optional fields (expiresAt, supersedes) if present
    - Print error to stderr and exit with code 1 if ID not found
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 4.2 Implement `handleMemoryStats` function
    - Read all entries from store
    - Compute: total count, enabled count, disabled count, low-confidence count, expired count
    - Compute breakdown by kind (count per DevMemoryKind)
    - Compute breakdown by severity (count per Severity level)
    - Display newest and oldest entries with date, kind, and summary
    - Handle empty store gracefully (display zero counts)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 4.3 Update `handleMemory` router and usage text
    - Add `"inspect"` and `"stats"` cases to the switch statement
    - Route `inspect` to `handleMemoryInspect(args.slice(1))`
    - Route `stats` to `handleMemoryStats()`
    - Update `showMemoryUsage` to document new subcommands
    - _Requirements: 5.1, 6.1_

- [x] 5. Add `--memory-report` flag to cli.ts
  - [x] 5.1 Implement `parseMemoryReportFlag` function
    - Return true if `--memory-report` is present in args
    - Export the function for testability
    - _Requirements: 4.1_

  - [x] 5.2 Update `handlePrompt` to support `--memory-report`
    - Parse the flag from args
    - Exclude `--memory-report` from positional arg filtering
    - After normal prompt generation output, if flag is set, format and print memory report
    - Report format: mode, selected/available counts, injected chars, top score, per-entry details with reasons
    - Ensure normal prompt output is unaltered
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 5.3 Update `showUsage` to document `--memory-report`
    - Add `--memory-report` to the prompt command options section
    - _Requirements: 4.1_

  - [x] 5.4 Propagate `MemoryInjectionMeta` from `generatePrompt` to CLI
    - Add `memoryMeta` field to `GenerateResult` interface in promptGenerator.ts
    - Return the full `MemoryInjectionMeta` from `generatePrompt`
    - Use it in `handlePrompt` for report formatting
    - _Requirements: 4.2, 4.3_

- [x] 6. Checkpoint - Verify CLI integration
  - Ensure all tests pass (`npm run typecheck && npm run test`), ask the user if questions arise.

- [x] 7. Update public API exports in index.ts
  - Export `scoreEntryDetailed` from memorySelector
  - Export `MemoryMatchReason` and `ScoredMemoryEntry` types from memorySelector
  - Export `handleMemoryInspect` and `handleMemoryStats` from memoryCommands
  - _Requirements: 1.1, 2.1, 5.1, 6.1_

- [x] 8. Write property-based tests
  - [x] 8.1 Write property test: Score Consistency (Property 1)
    - **Property 1: Score Consistency**
    - For any valid DevMemoryEntry and taskText, `scoreEntryDetailed(entry, taskText).score === scoreEntry(entry, taskText)`
    - Use fast-check arbitrary for DevMemoryEntry (reuse existing generator pattern)
    - Minimum 100 iterations
    - **Validates: Requirements 1.2, 1.10, 8.1**

  - [x] 8.2 Write property test: Reason Points Sum to Score (Property 2)
    - **Property 2: Reason Points Sum to Score**
    - For any valid DevMemoryEntry and taskText, sum of `reasons[i].points` equals returned `score`
    - Minimum 100 iterations
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9**

  - [x] 8.3 Write property test: Selected Details Consistency (Property 3)
    - **Property 3: Selected Details Consistency**
    - For any set of entries, taskText, and mode, `selectedDetails[i].entry` corresponds to `selected[i]`
    - Minimum 100 iterations
    - **Validates: Requirements 2.1, 2.6**

  - [x] 8.4 Write property test: Total Selected Chars Sum Invariant (Property 4)
    - **Property 4: Total Selected Chars Sum Invariant**
    - For any SelectionResult, `totalSelectedChars` equals sum of `selectedDetails[i].estimatedChars`
    - Minimum 100 iterations
    - **Validates: Requirements 2.4, 8.2**

  - [x] 8.5 Write property test: Score Ordering (Property 5)
    - **Property 5: Score Ordering**
    - For any SelectionResult with multiple entries, `selectedDetails[i].score >= selectedDetails[i+1].score`
    - Minimum 100 iterations
    - **Validates: Requirements 2.5, 8.3**

  - [x] 8.6 Write property test: Filtering Count Invariant (Property 6)
    - **Property 6: Filtering Count Invariant**
    - For any entries, taskText, and mode (not "off"), `consideredCount + excludedCount === entries.length`
    - Minimum 100 iterations
    - **Validates: Requirements 2.2, 2.3**

- [x] 9. Write unit tests
  - [x] 9.1 Write unit tests for `scoreEntryDetailed`
    - Test correct reason types for each match category (file, symbol, tag, kind, severity, recent)
    - Test entry with no matches returns score 0 and empty reasons
    - Test multiple matches accumulate correctly
    - File: `src/__tests__/memoryVisibility.test.ts`
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 9.2 Write unit tests for extended `selectMemoryEntries`
    - Test `selectedDetails` populated correctly alongside `selected`
    - Test `consideredCount` and `excludedCount` values
    - Test `totalSelectedChars` computation
    - Test mode "off" returns empty selectedDetails
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 9.3 Write unit tests for extended `injectMemorySection`
    - Test new meta fields are populated correctly
    - Test `topScore` computation
    - Test `selectedDetails` mapping in meta
    - Test mode "off" returns zeroed new fields
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 9.4 Write unit tests for `handleMemoryInspect`
    - Test displays all fields for valid ID
    - Test error on missing ID (non-zero exit)
    - Test exact ID matching (no partial match)
    - Test displays disabled entries
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 9.5 Write unit tests for `handleMemoryStats`
    - Test correct counts and breakdowns
    - Test empty store shows zero counts
    - Test newest/oldest entry display
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 9.6 Write unit tests for CLI `--memory-report`
    - Test `parseMemoryReportFlag` parsing
    - Test report output format
    - Test `--memory-report` does not alter prompt file content
    - Test flag combinations (`--memory-report` + `--mode` + `--out`)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 10. Checkpoint - Run full test suite
  - Ensure all tests pass (`npm run typecheck && npm run lint && npm run test && npm run build`), ask the user if questions arise.

- [x] 11. Update README documentation
  - Add "Memory Usage Visibility" section documenting `--memory-report` flag with usage example
  - Add documentation for `memory inspect <id>` command with usage example
  - Add documentation for `memory stats` command with example output
  - Update the CLI usage section to include new options and subcommands
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 12. Final checkpoint - Ensure all quality gates pass
  - Run `npm run typecheck && npm run lint && npm run test && npm run build`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required (no optional markers) per project convention
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Checkpoints ensure incremental validation at key integration points
- The implementation preserves full backward compatibility with existing interfaces
