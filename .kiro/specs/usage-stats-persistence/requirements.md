# Requirements Document

## Introduction

Phase 4-D adds usage statistics persistence to the Kiro Studio Kit Dev Memory system. Currently, `recordMemorySelection` exists as a pure function in `memoryTrust.ts` that returns a new entry with incremented `usageStats`, but this function is never called during prompt generation. This feature closes that gap by persisting selection events to the JSONL store after memory injection, adding CLI commands for usage inspection and reset, and integrating usage metrics into the health report.

## Glossary

- **Persistence_Module**: The `memoryUsagePersistence.ts` module responsible for reading the store, applying `recordMemorySelection` to selected entries, and rewriting the store with updated usage statistics.
- **Prompt_Generator**: The `promptGenerator.ts` module that orchestrates prompt assembly including memory injection.
- **Memory_Store**: The JSONL file at `.kiro/ksk/dev-memory.jsonl` containing all DevMemoryEntry records.
- **Usage_Stats**: The `MemoryUsageStats` object on a DevMemoryEntry tracking `selectedCount`, `successfulSelections`, `rejectedSelections`, `lastSelectedAt`, and `lastSuccessfulAt`.
- **Health_Reporter**: The `memoryHealth.ts` module that computes health scores and findings for the memory store.
- **CLI_Handler**: The `memoryCommands.ts` module that dispatches CLI subcommands for the `memory` command group.
- **Selected_Entry**: A DevMemoryEntry that was chosen by the memory selector during prompt generation.
- **Skipped_Entry**: A DevMemoryEntry that exists in the selected set but cannot be updated because it is disabled, deleted, or quarantined in the current store state.

## Requirements

### Requirement 1: Persist Memory Selections

**User Story:** As a developer, I want memory selection events to be persisted to the store during prompt generation, so that usage statistics accumulate over time and inform trust assessments.

#### Acceptance Criteria

1. WHEN `persistMemorySelections` is called with an array of selected entries, THE Persistence_Module SHALL read the current Memory_Store, apply `recordMemorySelection` to each matching enabled and non-deleted and non-quarantined entry, and rewrite the store with updated entries.
2. WHEN a selected entry matches a store entry by ID and the store entry has `enabled=true` AND `deleted` is not `true` AND `captureStatus` is not `"quarantined"`, THE Persistence_Module SHALL increment `selectedCount` by 1 and set `lastSelectedAt` to the current timestamp.
3. WHEN a selected entry matches a store entry that is disabled OR deleted OR quarantined, THE Persistence_Module SHALL add that entry ID to the `skippedIds` array in the result.
4. WHEN a selected entry ID does not match any entry in the store, THE Persistence_Module SHALL add that entry ID to the `skippedIds` array in the result.
5. THE Persistence_Module SHALL return a `UsagePersistenceResult` containing `updatedIds`, `skippedIds`, and `errors` arrays.

### Requirement 2: Prompt Generator Integration

**User Story:** As a developer, I want prompt generation to automatically persist usage stats for selected memories, so that I do not need to manually track which memories are being used.

#### Acceptance Criteria

1. WHEN the Prompt_Generator completes memory injection with one or more selected entries, THE Prompt_Generator SHALL call `persistMemorySelections` with those selected entries.
2. IF `persistMemorySelections` throws an error, THEN THE Prompt_Generator SHALL catch the error, emit a warning to stderr, and continue returning the generated prompt without interruption.
3. WHEN persistence succeeds, THE Prompt_Generator SHALL include `memoryUsagePersistence` metadata in the `GenerateResult` containing `updatedCount`, `skippedCount`, and `errorCount`.
4. WHEN memory mode is `"off"` or no entries are selected, THE Prompt_Generator SHALL skip persistence and omit `memoryUsagePersistence` from the result.

### Requirement 3: Usage Statistics CLI Command

**User Story:** As a developer, I want to view usage statistics for my memory entries from the CLI, so that I can identify which memories are frequently selected and which are unused.

#### Acceptance Criteria

1. WHEN the user runs `ksk memory usage stats`, THE CLI_Handler SHALL display a table of active entries sorted by `selectedCount` descending, showing ID, summary, selectedCount, and lastSelectedAt for each entry.
2. WHEN no active entries have usage statistics, THE CLI_Handler SHALL display a message indicating no usage data is available.

### Requirement 4: Usage Reset CLI Command

**User Story:** As a developer, I want to reset usage statistics for a specific memory entry, so that I can clear stale counters after significant changes to an entry.

#### Acceptance Criteria

1. WHEN the user runs `ksk memory usage reset <id>`, THE CLI_Handler SHALL set the matching entry's `usageStats` to `{ selectedCount: 0, successfulSelections: 0, rejectedSelections: 0 }` and remove `lastSelectedAt` and `lastSuccessfulAt`.
2. IF the specified ID does not match any entry in the store, THEN THE CLI_Handler SHALL display an error message and exit with code 1.
3. WHEN the reset succeeds, THE CLI_Handler SHALL display a confirmation message including the entry ID.

### Requirement 5: Health Report Usage Integration

**User Story:** As a developer, I want the health report to include usage-based findings, so that I can identify entries that are never selected or are over-relied upon.

#### Acceptance Criteria

1. THE Health_Reporter SHALL include in its report the count of active entries that have never been selected (selectedCount equals 0 or usageStats is undefined).
2. THE Health_Reporter SHALL include in its report the count of active entries that are frequently selected (selectedCount greater than 20).
3. THE Health_Reporter SHALL include in its report the count of active entries that were selected within the last 30 days.
4. WHEN the ratio of never-selected entries to total active entries exceeds 0.5, THE Health_Reporter SHALL emit a finding of type `"stale"` with severity `"warning"` indicating that many entries are unused.

### Requirement 6: Property-Based Test Coverage

**User Story:** As a developer, I want property-based tests to verify the correctness invariants of usage persistence, so that edge cases are caught by randomized testing.

#### Acceptance Criteria

1. FOR ALL valid arrays of selected entries, THE Persistence_Module SHALL produce a `selectedCount` on each updated entry that is strictly greater than the original `selectedCount`.
2. FOR ALL valid arrays of selected entries containing quarantined entries, THE Persistence_Module SHALL leave quarantined entries unmodified in the store.
3. FOR ALL valid arrays of selected entries containing deleted entries, THE Persistence_Module SHALL leave deleted entries unmodified in the store.
4. FOR ALL valid entry IDs, after `usage reset` is applied, THE entry SHALL have `selectedCount` equal to 0.
5. FOR ALL single persistence operations on an entry with original `selectedCount` of N, THE resulting `selectedCount` SHALL equal N + 1.
