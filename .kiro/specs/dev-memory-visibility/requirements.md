# Requirements Document

## Introduction

Development Memory (Phase 1) provides storage, scoring, selection, and injection of past lessons into AI prompts. Phase 2 adds observability features so developers can see which memories were selected, their scores, match reasons, and injection statistics. This enables debugging of memory selection behavior and provides transparency into how memories influence prompt generation.

## Glossary

- **Memory_Selector**: The module (`memorySelector.ts`) responsible for scoring and selecting DevMemoryEntries based on task text relevance.
- **Memory_Injector**: The module (`memoryInjector.ts`) that orchestrates memory selection, formatting, and section string generation for prompt injection.
- **CLI**: The command-line interface (`cli.ts`) that routes user commands to appropriate handlers.
- **Memory_Commands**: The module (`memoryCommands.ts`) that handles `memory` subcommand routing and execution.
- **SelectionResult**: The data structure returned by `selectMemoryEntries` containing selected entries and metadata.
- **MemoryInjectionMeta**: The metadata structure recorded in experiment logs describing memory injection behavior.
- **ScoredMemoryEntry**: A detailed scoring result containing the entry, its score, match reasons, and estimated character count.
- **MemoryMatchReason**: A single scoring reason record indicating the type of match, the matched value, and points awarded.
- **Memory_Store**: The JSONL file (`.kiro/ksk/dev-memory.jsonl`) persisting all DevMemoryEntry records.
- **DevMemoryEntry**: A single development memory record with id, kind, summary, trigger, fix, and metadata fields.

## Requirements

### Requirement 1: Detailed Scoring with Match Reasons

**User Story:** As a developer, I want to see why each memory entry received its score, so that I can understand and debug memory selection behavior.

#### Acceptance Criteria

1. WHEN a DevMemoryEntry is scored against task text, THE Memory_Selector SHALL return a ScoredMemoryEntry containing the entry, its numeric score, an array of MemoryMatchReason records, and an estimated character count.
2. THE Memory_Selector SHALL produce the same numeric score from `scoreEntryDetailed` as from the existing `scoreEntry` function for identical inputs.
3. WHEN a relatedFiles value matches task text, THE Memory_Selector SHALL include a MemoryMatchReason with type "file", the matched filename as value, and 5 as points.
4. WHEN a relatedSymbols value matches task text, THE Memory_Selector SHALL include a MemoryMatchReason with type "symbol", the matched symbol as value, and 4 as points.
5. WHEN a tags value matches task text, THE Memory_Selector SHALL include a MemoryMatchReason with type "tag", the matched tag as value, and 3 as points.
6. WHEN kind keywords match task text, THE Memory_Selector SHALL include a MemoryMatchReason with type "kind", the entry kind as value, and 2 as points.
7. WHEN severity is "high", THE Memory_Selector SHALL include a MemoryMatchReason with type "severity", "high" as value, and 2 as points.
8. WHEN severity is "medium", THE Memory_Selector SHALL include a MemoryMatchReason with type "severity", "medium" as value, and 1 as points.
9. WHEN the entry was created within the last 30 days, THE Memory_Selector SHALL include a MemoryMatchReason with type "recent", "within_30d" as value, and 1 as points.
10. THE Memory_Selector SHALL maintain the existing `scoreEntry` function unchanged for backward compatibility.

### Requirement 2: Extended Selection Result

**User Story:** As a developer, I want the selection result to include detailed scoring information, so that I can inspect the full selection decision.

#### Acceptance Criteria

1. THE Memory_Selector SHALL return a SelectionResult containing a `selectedDetails` array of ScoredMemoryEntry records alongside the existing `selected` array.
2. THE Memory_Selector SHALL include `consideredCount` indicating the number of entries that passed filtering.
3. THE Memory_Selector SHALL include `excludedCount` indicating the number of entries excluded by filtering.
4. THE Memory_Selector SHALL include `totalSelectedChars` equal to the sum of `estimatedChars` across all selectedDetails entries.
5. THE Memory_Selector SHALL sort `selectedDetails` by score in descending order.
6. THE Memory_Selector SHALL preserve the existing `selected` and `totalAvailable` fields unchanged for backward compatibility.

### Requirement 3: Extended Injection Metadata

**User Story:** As a developer, I want the injection metadata to include detailed selection information, so that experiment logs capture full observability data.

#### Acceptance Criteria

1. THE Memory_Injector SHALL include `consideredCount` in MemoryInjectionMeta.
2. THE Memory_Injector SHALL include `excludedCount` in MemoryInjectionMeta.
3. THE Memory_Injector SHALL include `totalSelectedChars` in MemoryInjectionMeta.
4. THE Memory_Injector SHALL include `topScore` as the maximum score among selected entries, or 0 when no entries are selected.
5. THE Memory_Injector SHALL include `selectedDetails` as an array of objects containing id, summary, kind, score, matchedReasons, and estimatedChars for each selected entry.
6. THE Memory_Injector SHALL preserve all existing MemoryInjectionMeta fields unchanged for backward compatibility.
7. WHEN mode is "off", THE Memory_Injector SHALL return `consideredCount` as 0, `excludedCount` as 0, `totalSelectedChars` as 0, and `topScore` as 0.

### Requirement 4: Memory Report CLI Option

**User Story:** As a developer, I want a `--memory-report` flag on the `prompt` command, so that I can see memory usage details after prompt generation.

#### Acceptance Criteria

1. WHEN `--memory-report` is specified, THE CLI SHALL display a memory usage summary on stdout after prompt generation output.
2. THE CLI SHALL display the memory mode, selected count, total available count, injected character count, and top score in the report.
3. WHEN entries are selected, THE CLI SHALL display each selected entry with its score, kind, summary, and match reasons.
4. WHEN `--memory off --memory-report` is specified, THE CLI SHALL display the report showing mode "off" and selected count 0.
5. THE CLI SHALL not alter the normal prompt generation output when `--memory-report` is specified.
6. THE CLI SHALL support `--memory-report` in combination with `--mode`, `--compact`, and `--out` options without conflict.

### Requirement 5: Memory Inspect Command

**User Story:** As a developer, I want to inspect a single memory entry by ID, so that I can view its full details.

#### Acceptance Criteria

1. WHEN `memory inspect <id>` is invoked with a valid ID, THE Memory_Commands SHALL display all fields of the matching DevMemoryEntry.
2. THE Memory_Commands SHALL display: id, kind, severity, confidence, enabled, createdAt, summary, trigger, fix, futurePromptHint, relatedFiles, relatedSymbols, and tags.
3. IF the specified ID does not match any entry, THEN THE Memory_Commands SHALL display an error message and exit with a non-zero code.
4. THE Memory_Commands SHALL match IDs exactly without partial matching.
5. THE Memory_Commands SHALL display disabled entries when their ID is specified.

### Requirement 6: Memory Stats Command

**User Story:** As a developer, I want to see aggregate statistics about my memory store, so that I can understand the overall state of my development memories.

#### Acceptance Criteria

1. WHEN `memory stats` is invoked, THE Memory_Commands SHALL display the total entry count, enabled count, disabled count, low-confidence count, and expired count.
2. THE Memory_Commands SHALL display a breakdown of entries by kind.
3. THE Memory_Commands SHALL display a breakdown of entries by severity.
4. THE Memory_Commands SHALL display the newest and oldest entries with their date, kind, and summary.
5. WHEN the memory store is empty, THE Memory_Commands SHALL display zero counts without error.
6. THE Memory_Commands SHALL skip invalid JSONL lines consistent with existing store reading behavior.

### Requirement 7: README Documentation

**User Story:** As a developer, I want documentation for the new visibility features, so that I can learn how to use them.

#### Acceptance Criteria

1. THE README SHALL include a "Memory Usage Visibility" section documenting the `--memory-report` flag.
2. THE README SHALL include documentation for the `memory inspect` command with usage example.
3. THE README SHALL include documentation for the `memory stats` command with example output.

### Requirement 8: Property-Based Test for Score Consistency

**User Story:** As a developer, I want automated verification that detailed scoring is consistent with simple scoring, so that the refactoring does not introduce regressions.

#### Acceptance Criteria

1. FOR ALL valid DevMemoryEntry and taskText combinations, THE test suite SHALL verify that `scoreEntryDetailed(entry, taskText).score` equals `scoreEntry(entry, taskText)`.
2. FOR ALL valid SelectionResult instances, THE test suite SHALL verify that `totalSelectedChars` equals the sum of `estimatedChars` across all `selectedDetails` entries.
3. FOR ALL valid SelectionResult instances with multiple entries, THE test suite SHALL verify that `selectedDetails` scores are in non-increasing order.
