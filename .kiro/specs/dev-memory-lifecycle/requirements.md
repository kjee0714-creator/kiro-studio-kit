# Requirements Document

## Introduction

Phase 3 of the Development Memory system adds lifecycle management capabilities to the Kiro Studio Kit (KSK). This enables developers to disable, soft-delete, supersede, prune, compact, and track history of memory entries. The feature extends the existing `memory` CLI subcommand with new operations and enhances the selection/filtering pipeline with detailed exclusion reporting.

## Glossary

- **Memory_Store**: The JSONL file at `.kiro/ksk/dev-memory.jsonl` that persists all DevMemoryEntry records
- **CLI**: The `kiro-studio-kit` command-line interface binary
- **Entry**: A single DevMemoryEntry record in the Memory_Store
- **Selector**: The `selectMemoryEntries` function that filters and scores entries for prompt injection
- **Filter_Pipeline**: The `filterEntries` function that excludes entries based on enabled, confidence, expiry, and superseded status
- **Rewrite_Operation**: A store mutation that reads all entries, modifies target entries, and writes back the complete set
- **Soft_Delete**: Setting `deleted=true` and `deletedAt` timestamp on an entry without removing it from the store
- **Supersede_Relation**: A relationship where a newer entry's `supersedes` array references an older entry's ID, marking the older entry as obsolete
- **Prune_Candidate**: An entry meeting removal criteria (deleted, disabled, expired, superseded, or stale with low severity and low confidence)
- **Compact_Operation**: A store rewrite that retains only active entries and removes all deleted entries
- **Backup_File**: A timestamped copy of the Memory_Store created before destructive operations, stored at `.kiro/ksk/dev-memory.backup-YYYYMMDD.jsonl`
- **Lifecycle_Event**: A state change in an entry's history (creation, disable, enable, delete, supersede)

## Requirements

### Requirement 1: Disable and Enable Memory Entries

**User Story:** As a developer, I want to disable and re-enable memory entries via CLI, so that I can temporarily exclude entries from prompt injection without deleting them.

#### Acceptance Criteria

1. WHEN the command `memory disable <id>` is executed with a valid entry ID, THE CLI SHALL set the `enabled` field of the specified entry to `false` using a Rewrite_Operation
2. WHEN the command `memory enable <id>` is executed with a valid entry ID, THE CLI SHALL set the `enabled` field of the specified entry to `true` using a Rewrite_Operation
3. IF the specified ID does not exist in the Memory_Store, THEN THE CLI SHALL print an error message to stderr and exit with code 1
4. IF the entry is already in the target state (disabling an already-disabled entry or enabling an already-enabled entry), THEN THE CLI SHALL print a warning message to stderr and exit with code 0
5. WHEN an entry is disabled, THE Selector SHALL exclude the entry from prompt injection results

### Requirement 2: Soft Delete Memory Entries

**User Story:** As a developer, I want to soft-delete memory entries, so that entries are excluded from all queries while remaining recoverable until pruned.

#### Acceptance Criteria

1. WHEN the command `memory delete <id>` is executed with a valid entry ID, THE CLI SHALL set `deleted` to `true` and `deletedAt` to the current ISO 8601 timestamp on the specified entry using a Rewrite_Operation
2. IF the specified ID does not exist in the Memory_Store, THEN THE CLI SHALL print an error message to stderr and exit with code 1
3. WHEN an entry has `deleted` set to `true`, THE Filter_Pipeline SHALL exclude the entry from selection results
4. WHEN an entry has `deleted` set to `true`, THE `memory list` command SHALL exclude the entry from output
5. WHEN an entry has `deleted` set to `true`, THE `memory search` command SHALL exclude the entry from results
6. WHEN the command `memory inspect <id>` is executed with a deleted entry ID, THE CLI SHALL display the entry including its deleted status

### Requirement 3: Supersede Memory Entries

**User Story:** As a developer, I want to mark an older memory entry as superseded by a newer one, so that obsolete entries are automatically excluded from prompt injection.

#### Acceptance Criteria

1. WHEN the command `memory supersede <oldId> <newId>` is executed with valid entry IDs, THE CLI SHALL add `oldId` to the `newEntry`'s `supersedes` array using a Rewrite_Operation
2. IF either `oldId` or `newId` does not exist in the Memory_Store, THEN THE CLI SHALL print an error message identifying the missing ID to stderr and exit with code 1
3. WHEN an entry is superseded, THE Selector SHALL exclude the superseded entry from prompt injection results
4. WHEN the command `memory inspect` is executed on a superseding entry, THE CLI SHALL display the list of entry IDs it supersedes
5. WHEN the command `memory inspect` is executed on a superseded entry, THE CLI SHALL display which entry supersedes it

### Requirement 4: Prune Memory Entries

**User Story:** As a developer, I want to prune obsolete memory entries from the store, so that the store remains lean and relevant over time.

#### Acceptance Criteria

1. WHEN the command `memory prune` is executed without `--apply`, THE CLI SHALL display a dry-run report listing candidate counts by category without modifying the Memory_Store
2. WHEN the command `memory prune --apply` is executed, THE CLI SHALL create a Backup_File before removing Prune_Candidates from the Memory_Store
3. THE CLI SHALL classify Prune_Candidates as entries matching any of: `deleted` is `true`, `enabled` is `false`, expired (expiresAt in the past), superseded by another entry, or older than 180 days with both `severity` of "low" and `confidence` of "low"
4. WHEN the command `memory prune --apply` is executed, THE CLI SHALL report the number of entries removed and the path to the Backup_File
5. WHEN the command `memory prune` dry-run is executed, THE Memory_Store SHALL remain unchanged

### Requirement 5: Compact Memory Store

**User Story:** As a developer, I want to compact the memory store, so that deleted entries are permanently removed and the store file is optimized.

#### Acceptance Criteria

1. WHEN the command `memory compact` is executed, THE CLI SHALL create a Backup_File before rewriting the Memory_Store
2. WHEN the command `memory compact` is executed, THE CLI SHALL rewrite the Memory_Store containing only non-deleted entries
3. WHEN the command `memory compact` is executed, THE CLI SHALL validate all entries in the compacted store using the existing validator
4. WHEN the command `memory compact` is executed, THE CLI SHALL report the number of entries before and after compaction and the path to the Backup_File
5. FOR ALL active (non-deleted) entries before compaction, THE Compact_Operation SHALL preserve the entry data without modification
6. FOR ALL active entries, selecting memories before compact and after compact SHALL produce equivalent results for the same task text and mode

### Requirement 6: Memory Entry History

**User Story:** As a developer, I want to view the lifecycle history of a memory entry, so that I can understand when and how an entry's state changed.

#### Acceptance Criteria

1. WHEN the command `memory history <id>` is executed with a valid entry ID, THE CLI SHALL display lifecycle events for the entry in chronological order
2. THE CLI SHALL derive lifecycle events from the entry's current state: creation date from `createdAt`, disabled status from `enabled` field, deleted status from `deleted` and `deletedAt` fields, and superseded-by relationship from other entries' `supersedes` arrays
3. IF the specified ID does not exist in the Memory_Store, THEN THE CLI SHALL print an error message to stderr and exit with code 1

### Requirement 7: Selection Filtering Extension with Exclusion Reasons

**User Story:** As a developer, I want detailed exclusion reporting in memory selection results, so that I can understand why entries were excluded from prompt injection.

#### Acceptance Criteria

1. THE Filter_Pipeline SHALL exclude entries where `deleted` is `true` in addition to existing exclusion conditions (disabled, low confidence, expired, superseded)
2. THE SelectionResult SHALL include an `excludedReasons` breakdown with counts for each exclusion category: disabled, deleted, expired, superseded, and lowConfidence
3. THE MemoryInjectionMeta SHALL include the `excludedReasons` breakdown when memory is injected into prompts
4. FOR ALL entries in the Memory_Store, each excluded entry SHALL be counted in exactly one exclusion category (the first matching condition in evaluation order)

### Requirement 8: Stats Command Extension

**User Story:** As a developer, I want extended statistics about the memory store, so that I can monitor store health and lifecycle state distribution.

#### Acceptance Criteria

1. WHEN the command `memory stats` is executed, THE CLI SHALL display the count of deleted entries
2. WHEN the command `memory stats` is executed, THE CLI SHALL display the count of superseded entries
3. WHEN the command `memory stats` is executed, THE CLI SHALL display the average age in days of active (non-deleted, enabled) memories
4. WHEN the command `memory stats` is executed, THE CLI SHALL display the oldest and newest active memory creation dates
5. WHEN the command `memory stats` is executed, THE CLI SHALL display the Memory_Store file size in kilobytes

### Requirement 9: Validator Extension for New Fields

**User Story:** As a developer, I want the entry validator to accept the new `deleted` and `deletedAt` optional fields, so that entries with lifecycle state pass validation.

#### Acceptance Criteria

1. WHEN a DevMemoryEntry includes `deleted` as a boolean value, THE Validator SHALL accept the entry as valid
2. WHEN a DevMemoryEntry includes `deletedAt` as a string value, THE Validator SHALL accept the entry as valid
3. WHEN a DevMemoryEntry includes `deleted` as a non-boolean value, THE Validator SHALL reject the entry with a descriptive error
4. WHEN a DevMemoryEntry includes `deletedAt` as a non-string value, THE Validator SHALL reject the entry with a descriptive error
5. WHEN a DevMemoryEntry omits `deleted` and `deletedAt` fields, THE Validator SHALL accept the entry as valid (backward compatibility)

### Requirement 10: Backup File Management

**User Story:** As a developer, I want destructive operations to create timestamped backups, so that I can recover from accidental data loss.

#### Acceptance Criteria

1. WHEN a Backup_File is created, THE CLI SHALL write it to `.kiro/ksk/dev-memory.backup-YYYYMMDD.jsonl` where YYYYMMDD is the current date
2. THE Backup_File SHALL contain an exact copy of the Memory_Store contents at the time of backup creation
3. WHEN a Backup_File with the same date already exists, THE CLI SHALL overwrite the existing backup (one backup per day)

### Requirement 11: Property-Based Tests

**User Story:** As a developer, I want property-based tests covering lifecycle operations, so that correctness invariants are verified across randomized inputs.

#### Acceptance Criteria

1. THE test suite SHALL include a property test verifying that Compact_Operation preserves all active (non-deleted) entry data unchanged (minimum 100 runs)
2. THE test suite SHALL include a property test verifying that entries with `deleted` set to `true` are excluded from Selector results for all task texts and modes (minimum 100 runs)
3. THE test suite SHALL include a property test verifying that superseded entries are excluded from Selector results for all task texts and modes (minimum 100 runs)
4. THE test suite SHALL include a property test verifying that memory selection before and after Compact_Operation produces equivalent results for the same inputs (minimum 100 runs)
5. THE test suite SHALL include a property test verifying that lifecycle history events are in chronological order for all generated entries (minimum 100 runs)
6. THE test suite SHALL include a property test verifying that `memory prune` dry-run does not mutate the store contents (minimum 100 runs)

### Requirement 12: Quality Gates

**User Story:** As a developer, I want all quality gates to pass after implementation, so that the codebase remains stable and maintainable.

#### Acceptance Criteria

1. THE implementation SHALL pass `npm run typecheck` without errors
2. THE implementation SHALL pass `npm run lint` without errors
3. THE implementation SHALL pass `npm test` with all tests passing
4. THE implementation SHALL pass `npm run build` without errors
