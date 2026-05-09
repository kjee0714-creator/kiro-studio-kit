# Requirements Document

## Introduction

Phase 4-K of the Development Memory system adds explicit conflict management capabilities to the Kiro Studio Kit (KSK). This enables developers to group conflicting memory entries, supersede older entries with newer ones (with full audit trail), and ensures the injection policy correctly handles conflict groups and superseded entries. The feature reuses the existing `conflictKey` field on DevMemoryEntry as the conflict group identifier and adds `supersededBy` and `disabledReason` fields for richer lifecycle tracking.

## Glossary

- **Memory_Store**: The JSONL file at `.kiro/ksk/dev-memory.jsonl` that persists all DevMemoryEntry records
- **CLI**: The `kiro-studio-kit` command-line interface binary
- **Entry**: A single DevMemoryEntry record in the Memory_Store
- **Conflict_Group**: A set of entries sharing the same `conflictKey` value, indicating they address the same concern and at most one should be injected
- **Supersede_Relation**: A relationship where a newer entry replaces an older entry; the older entry gets `supersededBy` set and is disabled, the newer entry's `supersedes` array includes the older ID
- **Injection_Policy**: The `applyMemoryInjectionPolicy` function that filters and prioritizes entries for prompt injection
- **Audit_Log**: The append-only JSONL file at `.kiro/ksk/dev-memory-audit.jsonl` recording lifecycle events
- **Conflict_Winner**: The entry within a Conflict_Group that is selected for injection (highest trust priority, then original order)
- **Rewrite_Operation**: A store mutation that reads all entries, modifies target entries, and writes back the complete set

## Requirements

### Requirement 1: Schema Extension

**User Story:** As a developer, I want the DevMemoryEntry schema to support conflict management fields, so that entries can track supersession relationships and conflict group membership with clear reasons.

#### Acceptance Criteria

1. THE DevMemoryEntry interface SHALL reuse the existing `conflictKey` optional string field as the conflict group identifier (no new field needed)
2. THE DevMemoryEntry interface SHALL include an optional `supersededBy` field of type `string` representing the ID of the entry that supersedes this one
3. THE DevMemoryEntry interface SHALL include an optional `disabledReason` field of type `string` representing why the entry was disabled (e.g., "superseded", "manual", "conflict_resolution")
4. WHEN a DevMemoryEntry includes `supersededBy` as a string value, THE Validator SHALL accept the entry as valid
5. WHEN a DevMemoryEntry includes `supersededBy` as a non-string value, THE Validator SHALL reject the entry with a descriptive error
6. WHEN a DevMemoryEntry includes `disabledReason` as a string value, THE Validator SHALL accept the entry as valid
7. WHEN a DevMemoryEntry includes `disabledReason` as a non-string value, THE Validator SHALL reject the entry with a descriptive error
8. WHEN a DevMemoryEntry omits `supersededBy` and `disabledReason` fields, THE Validator SHALL accept the entry as valid (backward compatibility)

### Requirement 2: Supersede Memory

**User Story:** As a developer, I want to supersede an older memory entry with a newer one, so that the older entry is automatically disabled with a clear reason and the relationship is tracked bidirectionally.

#### Acceptance Criteria

1. WHEN `supersedeMemory(oldId, newerId)` is called with valid entry IDs, THE function SHALL set the older entry's `enabled` to `false`
2. WHEN `supersedeMemory(oldId, newerId)` is called with valid entry IDs, THE function SHALL set the older entry's `disabledReason` to `"superseded"`
3. WHEN `supersedeMemory(oldId, newerId)` is called with valid entry IDs, THE function SHALL set the older entry's `supersededBy` to the `newerId` value
4. WHEN `supersedeMemory(oldId, newerId)` is called with valid entry IDs, THE function SHALL add `oldId` to the newer entry's `supersedes` array (creating the array if absent)
5. WHEN `supersedeMemory(oldId, newerId)` is called with valid entry IDs, THE function SHALL persist the changes using a Rewrite_Operation
6. WHEN `supersedeMemory` completes successfully, THE function SHALL emit an audit event with eventType `"manual_update"` and metadata.operation `"supersede"`
7. IF the audit event write fails, THE function SHALL NOT throw — audit failure is non-blocking
8. IF `oldId` does not exist in the Memory_Store, THE function SHALL throw an error with a descriptive message
9. IF `newerId` does not exist in the Memory_Store, THE function SHALL throw an error with a descriptive message
10. THE `supersedeMemory` function SHALL NOT physically delete any entry from the store

### Requirement 3: Conflict Group

**User Story:** As a developer, I want to assign multiple memory entries to the same conflict group, so that the injection policy can ensure at most one entry from the group is injected.

#### Acceptance Criteria

1. WHEN `setMemoryConflictGroup(conflictKey, ids)` is called with a valid conflictKey and array of entry IDs, THE function SHALL set the `conflictKey` field on each specified entry to the provided value
2. THE `ids` parameter SHALL require at least 2 entry IDs; if fewer than 2 are provided, THE function SHALL throw an error
3. IF any ID in the `ids` array does not exist in the Memory_Store, THE function SHALL throw an error identifying the missing ID
4. WHEN `setMemoryConflictGroup` completes successfully, THE function SHALL persist the changes using a Rewrite_Operation
5. WHEN `setMemoryConflictGroup` completes successfully, THE function SHALL emit an audit event with eventType `"manual_update"` and metadata.operation `"set_conflict_group"`
6. IF the audit event write fails, THE function SHALL NOT throw — audit failure is non-blocking
7. THE `setMemoryConflictGroup` function SHALL update exactly the entries whose IDs are in the `ids` array and no others

### Requirement 4: Injection Policy Conflict Handling

**User Story:** As a developer, I want the injection policy to automatically exclude superseded entries and limit conflict groups to one winner, so that prompts receive only the most relevant, non-conflicting memories.

#### Acceptance Criteria

1. WHEN the injection policy processes entries, entries with a non-empty `supersededBy` field SHALL be excluded with reason `"Superseded by <supersededBy>"`
2. WHEN the injection policy processes entries sharing the same `conflictKey`, at most 1 entry per conflict group SHALL be included in the final selection
3. THE conflict winner within a group SHALL be the entry with the highest trust priority (as determined by `getTrustPriority`); ties are broken by original array order (stable)
4. THE conflict resolution step SHALL occur after high-rejection exclusion and before the trust-priority sort in the policy pipeline
5. THE `MemoryInjectionPolicyDecision` for conflict-excluded entries SHALL have reason `"Conflict group '<conflictKey>' — winner is <winnerId>"`
6. THE `MemoryInjectionPolicyResult.stats` SHALL include a `supersededExcludedCount` field (number) counting entries excluded due to supersession
7. THE `MemoryInjectionPolicyResult.stats` SHALL include a `conflictExcludedCount` field (number) counting entries excluded due to conflict group resolution

### Requirement 5: CLI Conflict Commands

**User Story:** As a developer, I want CLI commands to manage conflict groups and supersession, so that I can organize and resolve memory conflicts from the terminal.

#### Acceptance Criteria

1. WHEN the command `memory conflict group <conflictKey> <id1> <id2> [id3...]` is executed, THE CLI SHALL call `setMemoryConflictGroup` with the provided conflictKey and IDs
2. WHEN the command `memory conflict supersede <oldId> <newId>` is executed, THE CLI SHALL call `supersedeMemory` with the provided IDs
3. WHEN the command `memory conflict inspect <id>` is executed, THE CLI SHALL display the entry's conflictKey, supersededBy, disabledReason, and supersedes fields
4. WHEN the command `memory conflict list` is executed, THE CLI SHALL display all conflict groups (grouped by conflictKey) with their member entry summaries
5. IF any command encounters a missing ID error, THE CLI SHALL print the error to stderr and exit with code 1
6. IF no subcommand is provided after `memory conflict`, THE CLI SHALL display usage help for conflict commands

### Requirement 6: Property-Based Tests

**User Story:** As a developer, I want property-based tests verifying conflict management invariants, so that correctness is guaranteed across randomized inputs.

#### Acceptance Criteria

1. THE test suite SHALL include a property test verifying that entries with `supersededBy` set are never included in injection policy output (minimum 100 runs)
2. THE test suite SHALL include a property test verifying that at most 1 entry per `conflictKey` group is included in injection policy output (minimum 100 runs)
3. THE test suite SHALL include a property test verifying that the conflict winner within a group is the entry with the highest trust priority (minimum 100 runs)
4. THE test suite SHALL include a property test verifying that `supersedeMemory` never physically deletes an entry — entry count before equals entry count after (minimum 100 runs)
5. THE test suite SHALL include a property test verifying that `setMemoryConflictGroup` updates exactly the requested IDs and no others (minimum 100 runs)

